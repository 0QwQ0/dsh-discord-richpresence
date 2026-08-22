import { DiscordRpc, buildActivity } from './discord-rpc.js'

export const name = 'dsh-discord-richpresence'

/**
 * Default status pool, grouped by interaction phase. Every group is a plain
 * list the user can edit in the plugin config (`statuses`). The plugin only
 * ever sends these opaque strings to Discord — never session titles, message
 * text, file paths, or any other workspace content.
 */
const DEFAULT_STATUSES = {
  userInput: [
    '正在指挥大肥鱼干活',
    '正在给大肥鱼喂 token',
  ],
  agentWorking: [
    '正在与大肥鱼一起 Brainstorming',
    '正在听大肥鱼讲解 Project',
  ],
  tools: [
    '正在提交改动意见',
  ],
  forking: [
    '正在创建大肥鱼记忆切片',
  ],
  idle: [
    '正在等待大肥鱼待命',
  ],
}

/** Priority order: higher wins when several phases overlap. */
const PHASE_PRIORITY = {
  tools: 4,
  userInput: 3,
  forking: 2,
  agentWorking: 1,
  idle: 0,
}

/** How long a transient phase (user input / fork) stays on screen. */
const TRANSIENT_MS = 12000

/** Whether a phase is transient and should decay back to a base phase. */
const TRANSIENT_PHASES = new Set(['userInput', 'forking'])

function pickMessage(messages, cursor) {
  if (!Array.isArray(messages) || messages.length === 0) return undefined
  return messages[cursor % messages.length]
}

function now() {
  return Date.now()
}

/**
 * Cordis host plugin: watches coarse dsh activity events and mirrors them as
 * configurable, content-free Rich Presence lines on the local Discord client.
 *
 * The plugin only emits status strings from the configured `statuses` lists.
 * It never reads message text, session titles, file paths, or tool output, so
 * nothing about the user's workspace content can leak to Discord.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {object} config
 * @param {string} [config.clientId] - Discord Application ID (required).
 * @param {string} [config.details] - optional second line, e.g. 'DeepSeek Harness'.
 * @param {string} [config.largeImage] - optional Discord asset key for the large image.
 * @param {Record<string, string[]>} [config.statuses] - per-phase status lists.
 * @param {boolean} [config.randomize] - pick statuses at random instead of rotating.
 * @param {number} [config.minIntervalMs] - minimum delay between pushes.
 * @param {number} [config.reconnectMs] - IPC reconnect polling interval.
 * @returns {() => void} disposer that closes the RPC transport and clears timers.
 */
export function apply(ctx, config = {}) {
  const clientId = config.clientId
  if (!clientId) {
    console.warn(`[${name}] no clientId configured — Discord Rich Presence disabled (set config.clientId to your Discord Application ID)`)
    return
  }

  const statuses = {
    userInput: config.statuses?.userInput ?? DEFAULT_STATUSES.userInput,
    agentWorking: config.statuses?.agentWorking ?? DEFAULT_STATUSES.agentWorking,
    tools: config.statuses?.tools ?? DEFAULT_STATUSES.tools,
    forking: config.statuses?.forking ?? DEFAULT_STATUSES.forking,
    idle: config.statuses?.idle ?? DEFAULT_STATUSES.idle,
  }

  const details = config.details ?? 'DeepSeek Harness'
  const largeImage = config.largeImage
  const minIntervalMs = config.minIntervalMs ?? 5000
  const reconnectMs = config.reconnectMs ?? 15000
  const randomize = config.randomize ?? false

  const rpc = new DiscordRpc({ clientId })
  const rpcStartedAt = now()

  // Per-phase rotation cursors so consecutive pushes within one phase cycle.
  const cursors = Object.fromEntries(Object.keys(statuses).map((key) => [key, 0]))

  let currentPhase = 'idle'
  let lastPushedPhase = undefined
  let lastPushedAt = 0
  let transientUntil = 0
  let connected = false

  // Manual timer bookkeeping: everything here is cleared by the disposer.
  const timeouts = new Set()
  const intervals = new Set()
  function safeTimeout(callback, ms) {
    const handle = setTimeout(callback, ms)
    timeouts.add(handle)
    return handle
  }
  function safeInterval(callback, ms) {
    const handle = setInterval(callback, ms)
    intervals.add(handle)
    return handle
  }
  function clearAllTimers() {
    for (const handle of timeouts) clearTimeout(handle)
    for (const handle of intervals) clearInterval(handle)
    timeouts.clear()
    intervals.clear()
  }

  /** Pick the current status line for a phase. */
  function lineFor(phase) {
    const messages = statuses[phase]
    if (!messages || messages.length === 0) return undefined
    if (randomize) {
      return messages[Math.floor(Math.random() * messages.length)]
    }
    return pickMessage(messages, cursors[phase])
  }

  /** Rotate the phase cursor. */
  function advance(phase) {
    const messages = statuses[phase]
    if (messages && messages.length > 0) {
      cursors[phase] = (cursors[phase] + 1) % messages.length
    }
  }

  /**
   * Request a phase switch. Transient phases decay back to the base phase
   * after TRANSIENT_MS; tools phase ends when the next agentWorking arrives.
   */
  function requestPhase(phase, { decay = false } = {}) {
    const base = phase === 'idle' ? 'idle' : phase
    if (base !== 'idle' && PHASE_PRIORITY[base] < PHASE_PRIORITY[currentPhase]) {
      // A lower-priority phase cannot override a higher-priority one.
      return
    }
    if (base === currentPhase && !decay) return
    currentPhase = base
    if (decay || TRANSIENT_PHASES.has(base)) {
      transientUntil = now() + TRANSIENT_MS
    } else {
      transientUntil = 0
    }
    schedulePush()
  }

  /** Debounced push of the current status line. */
  let pushTimer
  function schedulePush() {
    if (pushTimer) return
    pushTimer = safeTimeout(() => {
      pushTimer = undefined
      pushNow()
    }, 250)
  }

  function pushNow() {
    const phase = currentPhase
    const line = lineFor(phase)
    if (!line) return
    const nowMs = now()
    if (phase === lastPushedPhase && nowMs - lastPushedAt < minIntervalMs) return
    lastPushedPhase = phase
    lastPushedAt = nowMs
    advance(phase)
    const activity = buildActivity({
      state: line,
      details,
      startTime: rpcStartedAt,
      largeImage,
    })
    rpc.setActivity(activity).then((ok) => {
      if (ok) connected = true
    }).catch(() => {
      connected = false
    })
  }

  /** Ensure a connected transport, retrying on a timer when Discord is absent. */
  let connectTimer
  function ensureConnected() {
    if (rpc.isConnected() || connectTimer) return
    rpc.connect().then(() => {
      connected = true
      connectTimer = undefined
      pushNow()
    }).catch(() => {
      connected = false
      connectTimer = undefined
      scheduleReconnect()
    })
  }

  function scheduleReconnect() {
    if (connectTimer) return
    connectTimer = safeTimeout(() => {
      connectTimer = undefined
      ensureConnected()
    }, reconnectMs)
  }

  // Reconnect when Discord disappears.
  rpc.onDisconnect(() => {
    connected = false
    scheduleReconnect()
  })

  // --- Activity plumbing: coarse, content-free events only ---

  // A user message entered the agent's inbox -> "commanding / feeding tokens".
  ctx.on('agent/inbox/inserted', () => {
    requestPhase('userInput', { decay: true })
    ensureConnected()
  }, { global: true })

  // Agent toggled idle/running -> "brainstorming / explaining".
  ctx.on('agent/status', (payload) => {
    const status = payload?.status
    if (status === 'running') {
      requestPhase('agentWorking')
      ensureConnected()
    } else if (status === 'idle') {
      requestPhase('idle')
    }
  }, { global: true })

  // A model tool is about to dispatch -> "submitting change suggestions".
  ctx.on('tools/pre-execute', (exec, next) => {
    requestPhase('tools', { decay: true })
    ensureConnected()
    return next()
  }, { global: true })

  // A new session / fork was created -> "creating a memory slice".
  ctx.on('session/created', () => {
    requestPhase('forking', { decay: true })
    ensureConnected()
  }, { global: true })

  // A workflow run started -> agent is orchestrating children.
  ctx.on('workflow/start', () => {
    requestPhase('agentWorking')
    ensureConnected()
  }, { global: true })

  // Transient-phase decay loop: userInput/forking fall back to agentWorking.
  safeInterval(() => {
    if (TRANSIENT_PHASES.has(currentPhase) && now() >= transientUntil) {
      requestPhase('agentWorking')
    }
  }, 5000)

  // Initial connection attempt.
  ensureConnected()

  // Disposer: closes the transport and clears every timer on fiber unload.
  return () => {
    clearAllTimers()
    try {
      rpc.close()
    } catch {
      // ignore
    }
  }
}
