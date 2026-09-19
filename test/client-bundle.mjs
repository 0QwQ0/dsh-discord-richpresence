// Verify the client bundle against the contracts of BOTH harness generations:
//  - store resolution: @deepseek-ai/dsh-client-store (0.1.5+) -> client-runtime (0.1.1) -> inlined
//  - settings mirror shape: view.namespaces[] lookup
//  - write path: settings.mutate with expectedRevision + acceptView fold
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')

/** A store factory used by the mocked official packages. */
const officialStore = (tag) => (initial) => {
  let snapshot = initial
  const listeners = new Set()
  return {
    __tag: tag,
    getSnapshot: () => snapshot,
    set: (next) => { snapshot = next; for (const l of listeners) l() },
    subscribe: (l) => { listeners.add(l); return () => listeners.delete(l) },
    update: (mutator) => { const draft = { ...snapshot }; mutator(draft); snapshot = draft; for (const l of listeners) l() },
  }
}

/**
 * Load the bundle with a given mock module table.
 * @param {object} modules - module table (spec -> exports).
 * @returns {object} the bundle exports plus the slot registration captured.
 */
function loadBundle(modules) {
  const factories = {}
  const windowStub = { __ModuleLoader__: { load: ({ id, factory }) => { factories[id] = factory } } }
  const requireMock = (spec) => {
    if (spec in modules) return modules[spec]
    throw new Error(`module not in mock table: ${spec}`)
  }
  new Function('require', 'window', src + '\n;return 0')(requireMock, windowStub)
  const factory = factories['dsh-discord-richpresence']
  if (!factory) throw new Error('factory not registered')
  const bundle = factory(requireMock)

  let registered = null
  const ctx = {
    get: (name) => name === 'connection' ? { api: modules.__api } : undefined,
    settingsScope: { describe: () => modules.__mirror },
    locale: { register: () => {}, bind: () => (key) => key },
    slots: {
      inject: (name, cb) => { registered = cb },
      register: (options, component) => ({ options, component }),
    },
    effect: (cb) => { const r = cb(); return typeof r === 'function' ? r : () => {} },
    on: () => () => {},
  }
  bundle.apply(ctx)
  return { bundle, entry: registered() }
}

/** Build the mock settings mirror + api with the REAL shapes. */
function makeMirrorAndApi() {
  let storedValue = { richMode: false }
  let revision = 3
  let acceptFolded = null
  const mirrorListeners = new Set()
  const mirror = {
    getSnapshot: () => ({
      status: 'ready',
      error: null,
      view: {
        writable: true,
        hasDocument: true,
        namespaces: [{ ns: 'discord-richpresence', value: storedValue, revision, schema: {}, secrets: [] }],
      },
    }),
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
        if (op.op !== 'set' || op.path[0] !== 'richMode') return { result: { ok: false, error: { message: 'bad op' } } }
        storedValue = { ...storedValue, richMode: op.value }
        revision += 1
        return { result: { ok: true, value: { ns, value: storedValue, revision } } }
      },
    },
  }
  return { mirror, api, acceptFolded: () => acceptFolded }
}

/** Run the controller flow on a loaded bundle and return observed states. */
async function exercise(entry, mirrorInfo) {
  const injected = entry.options.inject()
  await injected.load()
  const loaded = injected.hooks.richMode.getSnapshot()
  await injected.setRichMode(true)
  const toggled = injected.hooks.richMode.getSnapshot()
  return { loaded, toggled, folded: mirrorInfo.acceptFolded() }
}

const reactModule = { default: undefined, createElement: (type, props, ...children) => ({ type, props, children }) }

// --- Scenario 1: harness 0.1.5+ (dsh-client-store present) ---
{
  const { mirror, api, acceptFolded } = makeMirrorAndApi()
  const modules = {
    'react': reactModule,
    '@deepseek-ai/dsh-client-store': { createSnapshotStore: officialStore('client-store') },
    __api: api,
    __mirror: mirror,
  }
  const { bundle, entry } = loadBundle(modules)
  const out = await exercise(entry, { acceptFolded })
  console.log('[0.1.5+] inject:', JSON.stringify(bundle.inject))
  console.log('[0.1.5+] loaded:', JSON.stringify(out.loaded), 'toggled:', JSON.stringify(out.toggled))
  if (out.loaded.richMode !== false || out.toggled.richMode !== true) {
    console.error('FAIL: 0.1.5+ scenario wrong state'); process.exit(1)
  }
  if (!out.folded || out.folded.value.richMode !== true) {
    console.error('FAIL: 0.1.5+ acceptView not folded'); process.exit(1)
  }
}

// --- Scenario 2: harness 0.1.1 (client-runtime/client present, no client-store) ---
{
  const { mirror, api, acceptFolded } = makeMirrorAndApi()
  const modules = {
    'react': reactModule,
    '@deepseek-ai/dsh-client-runtime/client': { createSnapshotStore: officialStore('client-runtime') },
    __api: api,
    __mirror: mirror,
  }
  const { entry } = loadBundle(modules)
  const out = await exercise(entry, { acceptFolded })
  console.log('[0.1.1]  loaded:', JSON.stringify(out.loaded), 'toggled:', JSON.stringify(out.toggled))
  if (out.loaded.richMode !== false || out.toggled.richMode !== true) {
    console.error('FAIL: 0.1.1 scenario wrong state'); process.exit(1)
  }
}

// --- Scenario 3: neither package reachable -> inlined store must carry it ---
{
  const { mirror, api, acceptFolded } = makeMirrorAndApi()
  const modules = { 'react': reactModule, __api: api, __mirror: mirror }
  const { entry } = loadBundle(modules)
  const out = await exercise(entry, { acceptFolded })
  console.log('[inlined] loaded:', JSON.stringify(out.loaded), 'toggled:', JSON.stringify(out.toggled))
  if (out.loaded.richMode !== false || out.toggled.richMode !== true) {
    console.error('FAIL: inlined-store scenario wrong state'); process.exit(1)
  }
  if (!out.folded || out.folded.value.richMode !== true) {
    console.error('FAIL: inlined-store acceptView not folded'); process.exit(1)
  }
}

console.log('CLIENT BUNDLE TEST PASSED (0.1.5+ / 0.1.1 / inlined store)')
process.exit(0)
