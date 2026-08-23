// Verify the client bundle controller against the real mirror contract:
// view.namespaces[] lookup, mutate write with expectedRevision, acceptView fold.
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')

// --- mock browser module table ---
const storeImpl = (initial) => {
  let snapshot = initial
  const listeners = new Set()
  return {
    getSnapshot: () => snapshot,
    set: (next) => { snapshot = next; for (const l of listeners) l() },
    subscribe: (l) => { listeners.add(l); return () => listeners.delete(l) },
  }
}
const modules = {
  'react': { default: undefined, createElement: (type, props, ...children) => ({ type, props, children }) },
  '@deepseek-ai/dsh-client-runtime/client': { createSnapshotStore: storeImpl },
}
const factories = {}
globalThis.window = { __ModuleLoader__: { load: ({ id, factory }) => { factories[id] = factory } } }
const require = (spec) => {
  if (spec in modules) return modules[spec]
  throw new Error(`module not in mock table: ${spec}`)
}
new Function('require', 'window', src + '\n;return 0')(require, globalThis.window)
const factory = factories['dsh-discord-richpresence']
if (!factory) { console.error('FAIL: factory not registered'); process.exit(1) }
const bundle = factory(require)
console.log('bundle exports:', Object.keys(bundle).join(', '))

// --- mock settings describe mirror with the REAL namespace structure ---
let storedValue = { richMode: false }
let revision = 3
let acceptFolded = null
const mirrorListeners = new Set()
const describeView = () => ({
  writable: true,
  hasDocument: true,
  namespaces: [{ ns: 'discord-richpresence', value: storedValue, revision, schema: {}, secrets: [] }],
})
const mirror = {
  getSnapshot: () => ({ status: 'ready', view: describeView(), error: null }),
  subscribe: (l) => { mirrorListeners.add(l); return () => mirrorListeners.delete(l) },
  ensure: async () => {},
  acceptView: (view) => {
    acceptFolded = view
    storedValue = view.value
    revision = view.revision
    for (const l of mirrorListeners) l()
  },
}
const api = {
  settings: {
    mutate: async ({ ns, ops, expectedRevision }) => {
      if (expectedRevision !== revision) return { result: { ok: false, error: { message: 'stale revision' } } }
      const op = ops[0]
      if (op.op === 'set' && op.path[0] === 'richMode') {
        storedValue = Object.assign({}, storedValue, { [op.path[0]]: op.value })
        revision += 1
        return { result: { ok: true, value: { ns, value: storedValue, revision } } }
      }
      return { result: { ok: false, error: { message: 'bad op' } } }
    },
  },
}

// --- run apply with a mock ctx ---
let registered = null
const ctx = {
  get: (name) => name === 'connection' ? { api } : undefined,
  settingsScope: { describe: () => mirror },
  locale: { register: () => {}, bind: () => (key) => key },
  slots: {
    inject: (name, cb) => { registered = cb },
    register: (options, component) => ({ options, component }),
  },
  effect: (cb) => { const r = cb(); return typeof r === 'function' ? r : () => {} },
  on: () => () => {},
}
bundle.apply(ctx)
if (!registered) { console.error('FAIL: settings.general.item not registered'); process.exit(1) }

// Materialize the slot entry to get the injected controller face.
const entry = registered()
console.log('slot id:', entry.options.id)
console.log('entry keys:', Object.keys(entry).join(', '))
const injected = entry.options.inject()
console.log('controller hooks present:', typeof injected.load, typeof injected.setRichMode)

// Load -> should read richMode=false from the mirror namespaces.
await injected.load()
let snap = injected.hooks.richMode.getSnapshot()
console.log('after load:', JSON.stringify({ status: snap.status, writable: snap.writable, richMode: snap.richMode }))
if (snap.richMode !== false || snap.writable !== true) { console.error('FAIL: initial load wrong'); process.exit(1) }

// Toggle on -> mutate writes true, acceptView folds the answer.
await injected.setRichMode(true)
snap = injected.hooks.richMode.getSnapshot()
console.log('after toggle on:', JSON.stringify({ status: snap.status, richMode: snap.richMode }))
console.log('acceptView folded:', JSON.stringify(acceptFolded && acceptFolded.value))
if (snap.richMode !== true) { console.error('FAIL: toggle did not persist'); process.exit(1) }
if (!acceptFolded || acceptFolded.value.richMode !== true) { console.error('FAIL: acceptView not folded'); process.exit(1) }

// Mirror refresh re-derives the stored value (simulates settings/document-updated).
storedValue = { richMode: false } // simulate an external reset
await injected.load()
snap = injected.hooks.richMode.getSnapshot()
console.log('after mirror reset re-load:', JSON.stringify({ richMode: snap.richMode }))

console.log('CLIENT CONTROLLER TEST PASSED')
process.exit(0)
