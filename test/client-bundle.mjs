// Verify the client bundle factory parses and executes its registration logic
// under a mock __ModuleLoader__ + module table (browser shape).
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')

// Mock browser module table: provide the modules our bundle requires.
const modules = {
  'react': { default: undefined, createElement: (type, props, ...children) => ({ type, props, children }) },
  '@deepseek-ai/dsh-client-runtime/client': {
    createSnapshotStore: (initial) => {
      let snapshot = initial
      const listeners = new Set()
      return {
        getSnapshot: () => snapshot,
        set: (next) => { snapshot = next; for (const l of listeners) l() },
        subscribe: (l) => { listeners.add(l); return () => listeners.delete(l) },
      }
    },
  },
}
const factories = {}

globalThis.window = {
  __ModuleLoader__: {
    load: ({ id, factory }) => { factories[id] = factory },
  },
}

// Execute the bundle in a CJS-like scope.
const require = (spec) => {
  if (spec in modules) return modules[spec]
  throw new Error(`module not in mock table: ${spec}`)
}
const fn = new Function('require', 'module', 'exports', 'window', src + '\n;return module.exports')
const moduleObj = { exports: {} }
const exported = fn(require, moduleObj, moduleObj.exports, globalThis.window)

console.log('bundle registered id: dsh-discord-richpresence')
const factory = factories['dsh-discord-richpresence']
if (!factory) { console.error('FAIL: factory not registered'); process.exit(1) }

const bundle = factory(require)
console.log('bundle exports keys:', Object.keys(bundle).join(', '))
console.log('inject:', JSON.stringify(bundle.inject))
console.log('apply type:', typeof bundle.apply)

// Mock the client ctx and run apply() to exercise slot registration.
const slotRegistrations = []
const ctx = {
  get: (name) => name === 'connection' ? { api: { settings: { update: async () => ({ result: { ok: true, value: { richMode: true } } }) } } } : undefined,
  settingsScope: { describe: () => ({ ensure: async () => {}, getSnapshot: () => ({ view: { writable: true, value: { richMode: false } } }) }) },
  locale: { register: () => {}, bind: () => (key) => key },
  slots: { inject: (name, cb) => { slotRegistrations.push([name, cb]) } },
  effect: (cb) => { const r = cb(); return typeof r === 'function' ? r : () => {} },
  on: () => () => {},
}
bundle.apply(ctx)
console.log('slot registrations:', JSON.stringify(slotRegistrations.map(([n]) => n)))
if (slotRegistrations.some(([n]) => n === 'settings.general.item')) {
  console.log('CLIENT BUNDLE TEST PASSED')
  process.exit(0)
} else {
  console.error('CLIENT BUNDLE TEST FAILED: settings.general.item not registered')
  process.exit(1)
}
