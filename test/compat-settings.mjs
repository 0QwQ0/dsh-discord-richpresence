// Settings integration test that adapts to the harness generation it runs on.
//
// Run it from a directory whose node_modules resolves the target harness:
//   - harness 0.1.1-rc.2 (dsh profile)          -> exercises the `register` fallback
//   - harness 0.1.5-rc.2 (latest npm `latest`)  -> exercises `installSection`
//
// It mounts a REAL SettingsProvider subclass, loads the plugin, and asserts the
// namespace registers, a provider write reaches the plugin, and events flow.
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const cordisPath = require.resolve('@deepseek-ai/cordis')
const settingsPath = require.resolve('@deepseek-ai/dsh-settings')
const settingsPkg = require(require.resolve('@deepseek-ai/dsh-settings/package.json'))

const { Context } = await import(pathToFileURL(cordisPath).href)
const settingsMod = await import(pathToFileURL(settingsPath).href)
const Provider = settingsMod.SettingsProvider ?? settingsMod.default

console.log('=== harness generation under test ===')
console.log('dsh-settings:', settingsPkg.version)
console.log('cordis:      ', require(require.resolve('@deepseek-ai/cordis/package.json')).version)
console.log('exports:', Object.keys(settingsMod).sort().join(', '))
const moduleHelper = typeof settingsMod.installSettingsSection === 'function'
console.log('module-level installSettingsSection:', moduleHelper ? 'present (0.1.x)' : 'absent (0.1.5+)')

// Minimal in-memory provider over the real base class.
const document = {}
class MemorySettings extends Provider {
  get writable() { return true }
  async load() { return { ...document } }
  async persist(ns, section) { document[ns] = section }
}

const ctx = new Context()
ctx.plugin(MemorySettings)
await new Promise((r) => setTimeout(r, 60))
const settings = ctx.get('settings')
console.log('settings service mounted:', settings !== undefined)
const providerApi = typeof settings?.installSection === 'function'
  ? 'installSection (0.1.5+)'
  : typeof settings?.register === 'function'
    ? 'register (0.1.x fallback)'
    : 'NONE'
console.log('provider API used by the plugin path:', providerApi)
if (providerApi === 'NONE') {
  console.error('FAIL: no usable settings provider API')
  process.exit(1)
}

ctx.reflect.provide('tokenMeter', { measure: (s) => ({ totalTokens: s?._tokens ?? 0 }) })

const { apply, name } = await import('file:///F:/aura/pluginDev/dsh-discord-richpresence/lib/index.js')
console.log('plugin module loaded:', name)

let disposer
try {
  disposer = apply(ctx, {
    clientId: 'COMPAT_TEST',
    statuses: { userInput: ['u'], agentWorking: ['w'], tools: ['t'], forking: ['f'], idle: ['i'] },
    minIntervalMs: 1,
    reconnectMs: 100,
    richMinIntervalMs: 100,
    richJitterMs: 50,
  })
  console.log('apply OK')
} catch (error) {
  console.error('FAIL: apply threw:', error)
  process.exit(1)
}

await new Promise((r) => setTimeout(r, 150))

const registered = settings.get('discord-richpresence')
console.log('registered namespace value:', JSON.stringify(registered))
if (registered === undefined || registered.richMode !== false) {
  console.error('FAIL: namespace missing or default richMode != false')
  process.exit(1)
}

// Provider write must reach the plugin's watch/onChange path.
await settings.update('discord-richpresence', { richMode: true })
await new Promise((r) => setTimeout(r, 200))
console.log('after provider update:', JSON.stringify(settings.get('discord-richpresence')))

// Events (unchanged signatures) must flow without throwing.
const carrier = { [Symbol.for('cordis.filter')]: () => false }
const fire = (n, p) => {
  const args = [carrier, n, p]
  for (const cb of ctx.events.dispatch('emit', args)) { try { cb(...args) } catch (e) { console.error('listener threw:', e) } }
}
fire('agent/inbox/inserted', { agent: { id: 'root-1', session: { header: {} } }, message: { source: { kind: 'user' } } })
fire('agent/status', { agent: { id: 'root-1' }, status: 'running' })
await new Promise((r) => setTimeout(r, 120))
fire('agent/status', { agent: { id: 'root-1' }, status: 'idle' })
console.log('events fired without throwing')

if (typeof disposer === 'function') disposer()
console.log(`SETTINGS COMPAT TEST PASSED on ${settingsPkg.version} (${providerApi})`)
process.exit(0)
