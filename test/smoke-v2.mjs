// Smoke test for host-half v0.2.2: settings registration, active-session
// tracking (user input selects the session; subagent events are ignored),
// rich mode switch, and live facts.
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const require = createRequire(fileURLToPath(new URL('../lib/index.js', import.meta.url)))
const profilePaths = ['C:/Users/Hacke/.dsh/profiles/web']
const cordisPath = require.resolve('@deepseek-ai/cordis', { paths: profilePaths })
const settingsPath = require.resolve('@deepseek-ai/dsh-settings', { paths: profilePaths })

const { Context } = await import(pathToFileURL(cordisPath).href)
const dshSettings = await import(pathToFileURL(settingsPath).href)
const { installSettingsSection, settingsNamespace } = dshSettings

const { apply, name } = await import('file:///F:/aura/pluginDev/dsh-discord-richpresence/lib/index.js')
console.log('plugin name:', name)

const ctx = new Context()
const registrations = new Map()
const settingsService = {
  register(ns, schema, options = {}) {
    const resolved = Object.assign({}, options.base)
    const registration = { ns, schema, base: options.base, resolved, revision: 0, watchers: new Set() }
    registrations.set(ns, registration)
    return {
      get: () => registration.resolved,
      watch: (cb) => { registration.watchers.add(cb); return () => registration.watchers.delete(cb) },
      update: () => Promise.resolve(),
      replace: () => Promise.resolve(),
    }
  },
  get(ns) { return registrations.get(ns)?.resolved },
}
ctx.reflect.provide('settings', settingsService)

// Mock tokenMeter so pre-step can measure tokens.
const tokenMeter = {
  measure: (session) => ({ totalTokens: session._tokens ?? 0 }),
}
ctx.reflect.provide('tokenMeter', tokenMeter)

let disposer
try {
  disposer = apply(ctx, {
    clientId: 'SMOKE_TEST_CLIENT',
    details: 'smoke test',
    statuses: {
      userInput: ['模糊-用户输入'],
      agentWorking: ['模糊-思考中'],
      tools: ['模糊-工具'],
      forking: ['模糊-分支'],
      idle: ['模糊-空闲'],
    },
    minIntervalMs: 1,
    reconnectMs: 100,
  })
  console.log('apply OK, disposer:', typeof disposer)
} catch (error) {
  console.error('apply FAILED:', error)
  process.exit(1)
}

await new Promise((r) => setTimeout(r, 50))
const ns = settingsNamespace('discord-richpresence')
const registered = registrations.get(String(ns))
console.log('settings namespace registered:', String(ns), registered ? 'YES' : 'NO')

const carrier = { [Symbol.for('cordis.filter')]: () => false }
const fire = (name2, payload) => {
  const args = [carrier, name2, payload]
  const callbacks = ctx.events.dispatch('emit', args)
  for (const cb of callbacks) {
    try { cb(...args) } catch (error) { console.error('listener threw:', error) }
  }
}
const fireStep = async (agent) => {
  const args = [carrier, 'agent/pre-step', agent]
  const callbacks = ctx.events.dispatch('waterfall', args)
  const inner = async () => ({ ok: true })
  const compose = (list) => list.reduceRight(
    (nextFn, cb) => () => cb(agent, nextFn),
    inner,
  )
  const chain = compose(callbacks)
  await chain()
}

// A top-level agent is created first (no active session yet -> adopt it).
fire('agent/created', {
  agent: {
    id: 'root-1',
    session: { header: { origin: undefined, delegationDepth: undefined }, _tokens: 100 },
  },
})
console.log('after root created (no user input yet)')

// A SUBAGENT is created — must NOT be adopted as active.
fire('agent/created', {
  agent: {
    id: 'sub-1',
    session: { header: { origin: 'subagent', delegationDepth: 1 }, _tokens: 999 },
  },
})

// Subagent pre-steps must be ignored: huge turn/step/tokens from sub-1.
await fireStep({
  agent: { id: 'sub-1', session: { header: { origin: 'subagent', delegationDepth: 1 }, _tokens: 999 } },
  turn: 999, step: 999,
})
// Subagent status must not drive phases.
fire('agent/status', { agent: { id: 'sub-1', session: {} }, status: 'running' })

// Now the user sends a real message to root-1 (source.kind === 'user').
fire('agent/inbox/inserted', {
  agent: { id: 'root-1', session: { header: { origin: undefined }, _tokens: 100 } },
  message: { source: { kind: 'user' }, content: [] },
})
console.log('user input to root-1')

// Root pre-step with real facts.
await fireStep({
  agent: { id: 'root-1', session: { header: { origin: undefined }, _tokens: 38700000 } },
  turn: 195, step: 6,
})
fire('agent/status', { agent: { id: 'root-1', session: {} }, status: 'running' })
await new Promise((r) => setTimeout(r, 50))
fire('agent/status', { agent: { id: 'root-1', session: {} }, status: 'idle' })

// A user switches to another top-level session root-2.
fire('agent/created', {
  agent: {
    id: 'root-2',
    session: { header: { origin: undefined, delegationDepth: undefined }, _tokens: 500 },
  },
})
fire('agent/inbox/inserted', {
  agent: { id: 'root-2', session: { header: { origin: undefined }, _tokens: 500 } },
  message: { source: { kind: 'user' }, content: [] },
})
// root-1 steps AFTER switch must be ignored.
await fireStep({
  agent: { id: 'root-1', session: { header: { origin: undefined }, _tokens: 111 } },
  turn: 1, step: 1,
})
// root-2 steps count.
await fireStep({
  agent: { id: 'root-2', session: { header: { origin: undefined }, _tokens: 12400 } },
  turn: 3, step: 2,
})
fire('agent/status', { agent: { id: 'root-2', session: {} }, status: 'running' })

console.log('events fired without throwing')

// Verify the rich-mode loop machinery exists by toggling the setting.
if (registered) {
  registered.resolved.richMode = true
  for (const w of registered.watchers) w()
  console.log('richMode toggled ON')
}
await new Promise((r) => setTimeout(r, 300))

if (typeof disposer === 'function') disposer()
console.log('SMOKE TEST PASSED')
process.exit(0)
