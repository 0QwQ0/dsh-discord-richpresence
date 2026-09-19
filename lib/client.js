/**
 * dsh-discord-richpresence — browser half.
 *
 * Registers one toggle row in Settings → General that switches the plugin
 * between vague status lines and richer, data-driven status lines. The
 * setting is persisted through the `discord-richpresence` settings namespace,
 * which the Host half of this plugin registers.
 *
 * This file is consumed by the dsh client module system as a
 * `window.__ModuleLoader__.load({ id, factory })` bundle. It is plain
 * JavaScript with no JSX and no build step.
 */
window.__ModuleLoader__.load({
  id: 'dsh-discord-richpresence',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    // The browser module table provides React at runtime (both harness
    // generations seed it from the shell).
    var React = require('react')

    /**
     * Minimal snapshot store: `getSnapshot`/`subscribe`/`set`/`update`, the
     * contract the slot renderer consumes through `useSyncExternalStore`.
     *
     * Inlined on purpose. The harness moved this factory between releases —
     * 0.1.5+ ships it in `@deepseek-ai/dsh-client-store`, while 0.1.1 exposed it
     * from `@deepseek-ai/dsh-client-runtime/client` — so a hard `require` of
     * either would break the other generation.
     * @param {object} initial - initial snapshot value.
     * @returns {object} the store handle.
     */
    function createLocalStore(initial) {
      var state = initial
      var listeners = new Set()
      function notify() {
        var pending = []
        listeners.forEach(function (listener) { pending.push(listener) })
        for (var i = 0; i < pending.length; i += 1) pending[i]()
      }
      return {
        getSnapshot: function getSnapshot() { return state },
        subscribe: function subscribe(listener) {
          listeners.add(listener)
          return function unsubscribe() { listeners.delete(listener) }
        },
        set: function set(next) {
          state = next
          notify()
        },
        update: function update(mutator) {
          var draft = Object.assign({}, state)
          mutator(draft)
          state = draft
          notify()
        },
      }
    }

    /**
     * Prefer the harness-provided store factory, falling back to the inlined
     * one when neither generation's package is reachable.
     * @returns {(initial: object) => object} a store factory.
     */
    function resolveStoreFactory() {
      var candidates = [
        '@deepseek-ai/dsh-client-store',
        '@deepseek-ai/dsh-client-runtime/client',
      ]
      for (var i = 0; i < candidates.length; i += 1) {
        try {
          var candidate = require(candidates[i])
          if (candidate && typeof candidate.createSnapshotStore === 'function') {
            return candidate.createSnapshotStore
          }
        } catch (error) {
          // This generation does not ship that package; try the next one.
        }
      }
      return createLocalStore
    }

    var createSnapshotStore = resolveStoreFactory()

    /** Settings namespace registered by the Host half. */
    var SETTINGS_NS = 'discord-richpresence'

    /** Row snapshot shape. */
    var INITIAL = {
      status: 'idle',
      error: null,
      writable: false,
      richMode: false,
    }

    /**
     * Row controller: derives the toggle from the settings describe mirror
     * and writes `richMode` through the settings wire.
     */
    function RichModeController(api, describeFace) {
      this.api = api
      this.describeFace = describeFace
      this.store = createSnapshotStore(INITIAL)
      this.saving = false
      this.disposed = false
      this.following = undefined
      var self = this
      this.derive = function derive() { self._derive() }
    }

    RichModeController.prototype.set = function set(patch) {
      this.store.set(Object.assign({}, this.store.getSnapshot(), patch))
    }

    RichModeController.prototype._derive = function _derive() {
      if (this.disposed || this.saving) return
      var mirrored = this.describeFace.getSnapshot()
      if (mirrored.status === 'unavailable') {
        this.set({ status: 'unavailable', writable: false, richMode: false })
        return
      }
      if (mirrored.view === undefined) {
        if (mirrored.error !== null) this.set({ status: 'error', error: mirrored.error })
        return
      }
      var view = mirrored.view.namespaces.find(function (entry) { return entry.ns === SETTINGS_NS })
      if (view === undefined) {
        this.set({ status: 'unavailable', writable: false, richMode: false })
        return
      }
      var value = view.value
      var richMode = Boolean(value && typeof value === 'object' ? value.richMode : false)
      this.set({
        status: 'ready',
        error: null,
        writable: mirrored.view.writable,
        richMode,
      })
    }

    /**
     * Load the namespace value and writability, then follow the mirror.
     * @returns once the snapshot reflects the host.
     */
    RichModeController.prototype.load = async function load() {
      if (this.disposed) return
      this.following ??= this.describeFace.subscribe(this.derive)
      this.set({ status: 'loading', error: null })
      await this.describeFace.ensure()
      this.derive()
    }

    /** Persist the toggle. */
    RichModeController.prototype.setRichMode = async function setRichMode(richMode) {
      var before = this.store.getSnapshot()
      if (this.saving || before.richMode === richMode) return
      var view = this.describeFace.getSnapshot().view?.namespaces
        .find(function (entry) { return entry.ns === SETTINGS_NS })
      if (view === undefined || !before.writable) return
      this.saving = true
      this.set({ status: 'saving', richMode })
      try {
        var response = await this.api.settings.mutate({
          ns: SETTINGS_NS,
          ops: [{ op: 'set', path: ['richMode'], value: richMode }],
          expectedRevision: view.revision,
        })
        if (!response.result.ok) throw new Error(response.result.error.message)
        this.saving = false
        if (this.disposed) return
        // The mirror publish reaches this row's own subscription, so the fold
        // is also what republishes the accepted value here.
        this.describeFace.acceptView(response.result.value)
      } catch (error) {
        this.saving = false
        if (this.disposed) return
        this.set({
          status: 'ready',
          richMode: before.richMode,
          error: error && error.message ? error.message : String(error),
        })
      }
    }

    /** Stop following the mirror. */
    RichModeController.prototype.dispose = function dispose() {
      this.disposed = true
      if (this.following) this.following()
      this.following = undefined
    }

    /**
     * Toggle row rendered inside Settings → General.
     * @param {object} props - slot props: useRichMode selector + setRichMode.
     * @returns {object} React element tree.
     */
    function RichModeRow(props) {
      var state = props.useRichMode(function (snapshot) { return snapshot })
      var busy = state.status === 'loading' || state.status === 'saving'
      var toggle = function () {
        if (busy || !state.writable) return
        props.setRichMode(!state.richMode)
      }
      var title = props.t ? props.t('title') : 'Rich presence detail'
      var description = state.error
        ? state.error
        : props.t
          ? props.t('description')
          : 'Show richer status lines (thinking step, input tokens, LLM time) on Discord'
      return React.createElement('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          padding: '12px 0',
        },
      },
        React.createElement('div', { style: { flex: '1', minWidth: 0 } },
          React.createElement('div', { style: { fontSize: '14px', lineHeight: '20px', color: 'var(--dsw-alias-label-primary, #e8e8e8)' } }, title),
          React.createElement('div', { style: { fontSize: '12px', lineHeight: '18px', color: 'var(--dsw-alias-label-secondary, #a0a0a0)' } }, description),
        ),
        React.createElement('button', {
          type: 'button',
          role: 'switch',
          'aria-checked': state.richMode,
          disabled: busy || !state.writable,
          onClick: toggle,
          style: {
            boxSizing: 'border-box',
            width: '40px',
            height: '22px',
            borderRadius: '11px',
            padding: '2px',
            border: 'none',
            cursor: state.writable ? 'pointer' : 'not-allowed',
            background: state.richMode
              ? 'var(--dsw-alias-state-success-primary, #3fb950)'
              : 'var(--dsw-alias-interactive-bg-hover, #3c3c3c)',
            display: 'flex',
            justifyContent: state.richMode ? 'flex-end' : 'flex-start',
          },
        },
          React.createElement('span', {
            style: {
              width: '18px',
              height: '18px',
              borderRadius: '50%',
              background: '#fff',
              display: 'block',
            },
          }),
        ),
      )
    }

    /** Required services (cordis fiber inject). */
    var inject = [
      'slots',
      'connection',
      'settingsScope',
      'locale',
    ]

    /**
     * Plugin body: register the General-settings toggle row.
     * @param {object} ctx - the browser plugin context.
     */
    function apply(ctx) {
      var api = ctx.get('connection').api
      var controller = new RichModeController(api, ctx.settingsScope.describe())

      ctx.effect(function () {
        ctx.locale.register('discordRichPresence', {
          zh: {
            title: 'Rich Presence 丰富状态',
            description: '向 Discord 推送更丰富的状态行（思考步数、输入 token、LLM 时长）',
          },
          en: {
            title: 'Rich presence detail',
            description: 'Show richer status lines (thinking step, input tokens, LLM time) on Discord',
          },
        })
      }, 'dsh-discord-richpresence: row dictionaries')

      var injected = function () {
        return {
          hooks: { richMode: controller.store },
          load: function () { return controller.load() },
          setRichMode: function (value) { return controller.setRichMode(value) },
          t: ctx.locale.bind('discordRichPresence'),
        }
      }

      ctx.slots.inject('settings.general.item', function () {
        return ctx.slots.register({
          name: 'settings.general.item',
          id: 'discord-richpresence-rich',
          order: 30,
          locale: 'discordRichPresence',
          inject: injected,
        }, RichModeRow)
      })

      // Initial load once the mirror is ready; release the mirror follow on teardown.
      ctx.effect(function () {
        void controller.load()
        return function () {
          controller.dispose()
        }
      }, 'dsh-discord-richpresence: row load')
    }

    exports.inject = inject
    exports.apply = apply
    return module.exports
  },
})
