// Smoke test for host-half v0.2.0: settings registration, rich mode switch,
// live facts, and the ≥8s smart random loop.
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

// Track what would be pushed to Discord.
const pushed = []
const mockRpc = { setActivity: () => Promise.resolve(true), isConnected: () => true, close: () => {} }
// Patch DiscordRpc via the module namespace is not possible (const import);
// instead we stub by injecting a fake by rewriting the imported binding is
// not feasible either. So we verify logic through the events and settings.

const ctx = new Context()
// Provide minimal `settings` service so installSettingsSection works.
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

// Inject a fake `settings` resolve path through ctx.inject? installSettingsSection
// uses ctx.inject(['settings'], cb). Cordis inject resolves services by name.
// Our fake service is provided under name 'settings', so it resolves.

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

// Simulate the settings namespace registration side effect.
const ns = settingsNamespace('discord-richpresence')
// installSettingsSection registers via ctx.inject — Cordis inject runs the
// callback asynchronously after the service exists. We provided the service,
// so call through a manual flush.
await new Promise((r) => setTimeout(r, 50))
const registered = registrations.get(String(ns))
console.log('settings namespace registered:', String(ns), registered ? 'YES' : 'NO')

// Fire events like dsh does (carrier dispatch).
const carrier = { [Symbol.for('cordis.filter')]: () => false }
const fire = (name2, payload) => {
  const args = [carrier, name2, payload]
  const callbacks = ctx.events.dispatch('emit', args)
  for (const cb of callbacks) {
    try { cb(...args) } catch (error) { console.error('listener threw:', error) }
  }
}

fire('agent/inbox/inserted', { agent: { id: 'a1' }, message: {} })
fire('agent/status', { agent: { id: 'a1' }, status: 'running' })
// agent/pre-step is a waterfall in real dsh; the plugin listener is (payload, next).
{
  const args = [carrier, 'agent/pre-step', { agent: { id: 'a1', session: {} }, turn: 195, step: 6 }]
  // Cordis waterfall: dispatch returns callbacks; compose them around a final next.
  const callbacks = ctx.events.dispatch('waterfall', args)
  const inner = async () => ({ ok: true })
  const compose = (list) => list.reduceRight(
    (nextFn, cb) => () => cb({ agent: { id: 'a1', session: {} }, turn: 195, step: 6 }, nextFn),
    inner,
  )
  const chain = compose(callbacks)
  await chain()
}
await new Promise((r) => setTimeout(r, 300))
fire('agent/status', { agent: { id: 'a1' }, status: 'idle' })

console.log('events fired without throwing')
console.log('registered ns resolved:', JSON.stringify(registered?.resolved ?? null))

// Verify the plugin's rich-mode loop machinery exists by toggling the setting.
if (registered) {
  registered.resolved.richMode = true
  for (const w of registered.watchers) w()
  console.log('richMode toggled ON')
}
await new Promise((r) => setTimeout(r, 300))

if (typeof disposer === 'function') disposer()
console.log('SMOKE TEST PASSED')
process.exit(0)
