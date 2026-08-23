// Active-session filtering verification: capture the actual DiscordRpc
// setActivity calls by loading index.js through a mock discord-rpc module.
// Run from the profile directory so deps resolve.
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const profilePaths = ['C:/Users/Hacke/.dsh/profiles/web']
const cordisPath = require.resolve('@deepseek-ai/cordis', { paths: profilePaths })
const settingsPath = require.resolve('@deepseek-ai/dsh-settings', { paths: profilePaths })

const { Context } = await import(pathToFileURL(cordisPath).href)
const dshSettings = await import(pathToFileURL(settingsPath).href)
const { installSettingsSection, settingsNamespace } = dshSettings

// Mock discord-rpc: capture every SET_ACTIVITY state line.
const pushedStates = []
const mockModule = {
  DiscordRpc: class {
    constructor() {}
    isConnected() { return true }
    connect() { return Promise.resolve() }
    setActivity(activity) { pushedStates.push(activity.state); return Promise.resolve(true) }
    close() {}
    onDisconnect() { return () => {} }
  },
  buildActivity: ({ state, details, startTime, largeImage }) => ({ state, details }),
}
const mockUrl = pathToFileURL('F:/aura/pluginDev/dsh-discord-richpresence/lib/discord-rpc.mock.mjs').href
await import('node:fs/promises').then(fs => fs.writeFile(
  'F:/aura/pluginDev/dsh-discord-richpresence/lib/discord-rpc.mock.mjs',
  'export const DiscordRpc = globalThis.__mockDiscordRpc.DiscordRpc\nexport const buildActivity = globalThis.__mockDiscordRpc.buildActivity\n',
))
globalThis.__mockDiscordRpc = mockModule
// Load index.js from the real path; its `import './discord-rpc.js'` will use
// the real file, so instead we load a COPY that imports the mock.
const fsMod = await import('node:fs/promises')
const realSrc = await fsMod.readFile('F:/aura/pluginDev/dsh-discord-richpresence/lib/index.js', 'utf8')
const patched = realSrc.replace("from './discord-rpc.js'", "from './discord-rpc.mock.mjs'")
await fsMod.writeFile('F:/aura/pluginDev/dsh-discord-richpresence/lib/index.mock.mjs', patched)
const { apply, name } = await import('file:///F:/aura/pluginDev/dsh-discord-richpresence/lib/index.mock.mjs')
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
const tokenMeter = { measure: (s) => ({ totalTokens: s?._tokens ?? 0 }) }
ctx.reflect.provide('tokenMeter', tokenMeter)

const disposer = apply(ctx, {
  clientId: 'X',
  statuses: { userInput: ['模糊-输入'], agentWorking: ['模糊-思考'], tools: ['模糊-工具'], forking: ['模糊-分支'], idle: ['模糊-空闲'] },
  minIntervalMs: 1,
  reconnectMs: 100,
  richMinIntervalMs: 100,
  richJitterMs: 50,
})
await new Promise((r) => setTimeout(r, 50))
const registered = registrations.get(String(settingsNamespace('discord-richpresence')))
if (registered) {
  registered.resolved.richMode = true
  for (const w of registered.watchers) w()
}
await new Promise((r) => setTimeout(r, 400))

const carrier = { [Symbol.for('cordis.filter')]: () => false }
const fire = (n, p) => {
  const args = [carrier, n, p]
  for (const cb of ctx.events.dispatch('emit', args)) { try { cb(...args) } catch (e) { console.error('listener threw:', e) } }
}
const fireStep = async (agent) => {
  const args = [carrier, 'agent/pre-step', agent]
  const cbs = ctx.events.dispatch('waterfall', args)
  const inner = async () => ({ ok: true })
  const chain = cbs.reduceRight((nx, cb) => () => cb(agent, nx), inner)
  await chain()
}

// 1) subagent created + steps: must NOT become active / must not pollute.
fire('agent/created', { agent: { id: 'sub-1', session: { header: { origin: 'subagent', delegationDepth: 1 } } } })
await fireStep({ agent: { id: 'sub-1', session: { header: { origin: 'subagent', delegationDepth: 1 }, _tokens: 999 } }, turn: 999, step: 999 })
fire('agent/status', { agent: { id: 'sub-1' }, status: 'running' })
await new Promise((r) => setTimeout(r, 200))
const beforeUser = pushedStates.length
console.log('states after subagent noise:', pushedStates.slice(beforeUser - 3))

// 2) user interacts with root-1 (real user input).
fire('agent/inbox/inserted', { agent: { id: 'root-1', session: { header: { origin: undefined }, _tokens: 38700000 } }, message: { source: { kind: 'user' } } })
await fireStep({ agent: { id: 'root-1', session: { header: { origin: undefined }, _tokens: 38700000 } }, turn: 195, step: 6 })
fire('agent/status', { agent: { id: 'root-1' }, status: 'running' })
await new Promise((r) => setTimeout(r, 600))
const afterRoot1 = pushedStates.filter(s => s.includes('38700000') || s.includes('6/195'))
console.log('root-1 rich states:', JSON.stringify(afterRoot1.slice(0, 3)))

// 3) user switches to root-2; root-1 stale steps must be ignored.
fire('agent/inbox/inserted', { agent: { id: 'root-2', session: { header: { origin: undefined }, _tokens: 12400 } }, message: { source: { kind: 'user' } } })
await fireStep({ agent: { id: 'root-1', session: { header: { origin: undefined }, _tokens: 111 } }, turn: 1, step: 1 })
await fireStep({ agent: { id: 'root-2', session: { header: { origin: undefined }, _tokens: 12400 } }, turn: 3, step: 2 })
await new Promise((r) => setTimeout(r, 600))
const afterRoot2 = pushedStates.filter(s => s.includes('12.4K') || s.includes('2/3'))
console.log('root-2 rich states:', JSON.stringify(afterRoot2.slice(0, 3)))
const stale = pushedStates.filter(s => s.includes('999/999') || s.includes('999'))
console.log('states containing subagent 999:', stale.length, '(expect 0)')

if (stale.length > 0) {
  console.error('FAIL: subagent data leaked into Discord states')
  process.exit(1)
}
if (afterRoot1.length === 0) {
  console.error('FAIL: root-1 rich states missing')
  process.exit(1)
}
if (afterRoot2.length === 0) {
  console.error('FAIL: root-2 rich states missing after session switch')
  process.exit(1)
}

disposer()
console.log('ACTIVE-SESSION FILTER TEST PASSED')
process.exit(0)
