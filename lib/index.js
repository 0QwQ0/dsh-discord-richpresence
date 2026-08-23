import { DiscordRpc, buildActivity } from './discord-rpc.js'
import z from '@deepseek-ai/schemastery'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'

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

/** Rich-mode status templates. Tokens/step/duration are filled at runtime. */
const RICH_STATUSES = {
  userInput: '正在指导大肥鱼',
  thinking: '大肥鱼正在思考 {step}/{turn}',
  notes: '大肥鱼正在记笔记 {tokens}',
  duration: '大肥鱼已经思考了 {duration}',
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

/** Minimum on-screen time for a rich-mode status (Discord shows it ≥ this). */
const RICH_MIN_INTERVAL_MS = 8000
/** Extra random jitter added on top of the minimum rich interval. */
const RICH_JITTER_MS = 8000
/** How long a "user is typing" hint stays relevant. */
const USER_INPUT_WINDOW_MS = 60000
/** Default rich interval cap (jitter upper bound), configurable for tests. */
const DEFAULT_RICH_INTERVAL_MS = RICH_MIN_INTERVAL_MS + RICH_JITTER_MS

function pickMessage(messages, cursor) {
  if (!Array.isArray(messages) || messages.length === 0) return undefined
  return messages[cursor % messages.length]
}

function now() {
  return Date.now()
}

/** Format a token count like Discord-friendly shorthand: 38.7M, 12.4K, 900. */
function formatTokens(tokens) {
  if (!Number.isFinite(tokens) || tokens <= 0) return undefined
  if (tokens >= 1e9) return `${(tokens / 1e9).toFixed(1)}B`
  if (tokens >= 1e6) return `${(tokens / 1e6).toFixed(1)}M`
  if (tokens >= 1e3) return `${(tokens / 1e3).toFixed(1)}K`
  return String(Math.round(tokens))
}

/** Format an elapsed duration as 1h23m45s / 30m46s / 12s. */
function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return undefined
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h${String(minutes).padStart(2, '0')}m${String(seconds).padStart(2, '0')}s`
  if (minutes > 0) return `${minutes}m${String(seconds).padStart(2, '0')}s`
  return `${seconds}s`
}

/**
 * Cordis host plugin: watches coarse dsh activity events and mirrors them as
 * configurable, content-free Rich Presence lines on the local Discord client.
 *
 * Two display modes:
 * - `richMode: false` (default): vague, user-configured status lines only.
 * - `richMode: true`: smarter, data-driven status lines (thinking turn/step,
 *   total input tokens, LLM elapsed time) picked intelligently and randomly,
 *   each staying on screen for at least 8 seconds.
 *
 * The mode is exposed as the `discordRichPresence` settings namespace, so the
 * web General-settings page can toggle it at runtime.
 *
 * The plugin only emits status strings from the configured lists/templates.
 * It never reads message text, session titles, file paths, or tool output, so
 * nothing about the user's workspace content can leak to Discord.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {object} config
 * @param {string} [config.clientId] - Discord Application ID (pre-configured in the bundle patch).
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
    // Defensive fallback only; the shipped bundle patch always provides one.
    console.warn(`[${name}] no clientId configured — Discord Rich Presence disabled`)
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
  // Rich loop bounds: 8s floor by design; tests may shrink them.
  const richMinIntervalMs = config.richMinIntervalMs ?? RICH_MIN_INTERVAL_MS
  const richJitterMs = config.richJitterMs ?? RICH_JITTER_MS

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

  function pushLine(line) {
    const nowMs = now()
    if (line === lastPushedPhase && nowMs - lastPushedAt < minIntervalMs) return
    lastPushedPhase = line
    lastPushedAt = nowMs
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
      if (richMode) pushRichNow()
      else pushNow()
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

  // --- Settings: richMode toggle (web General settings -> discordRichPresence) ---

  /** Current resolved value of the settings namespace. */
  let richMode = false
  /** Latest live facts gathered from activity events. */
  let latestTurn = 0
  let latestStep = 0
  let latestTokens = undefined
  let thinkingStartedAt = 0
  let accumulatedThinkingMs = 0
  let lastUserInputAt = 0
  /**
   * The session the user is currently interacting with. Rich-mode facts
   * (turn/step/tokens/thinking time) are only collected from THIS agent —
   * never from subagents or unrelated sessions, so the Discord status always
   * reflects the conversation the user is actually working on.
   */
  let activeSessionId = undefined
  /** Rich-mode smart random loop timer (undefined while rich mode is off). */
  let richLoopTimer = undefined

  /** Read the current settings value (kept current by setSource). */
  let richModeSource = () => ({ richMode: false })
  /** Sync our mode from the settings namespace and react to transitions. */
  function syncRichMode() {
    const next = Boolean(richModeSource().richMode)
    if (next === richMode) return
    richMode = next
    if (richMode) {
      if (!richLoopTimer) scheduleRichNext()
      pushRichNow()
    } else if (richLoopTimer) {
      clearTimeout(richLoopTimer)
      richLoopTimer = undefined
    }
  }

  /** Register the settings namespace; the client settings row writes it. */
  installSettingsSection(ctx, settingsNamespace('discord-richpresence'), z.object({
    richMode: z.boolean().default(false),
  }), { richMode: false }, {
    setSource: (get) => {
      richModeSource = get
      syncRichMode()
    },
    onChange: () => {
      syncRichMode()
    },
  })

  // --- Rich-mode live facts ---

  /** Render one rich status template. */
  function fillRichTemplate(template) {
    return template
      .replaceAll('{step}', String(latestStep || latestTurn || 0))
      .replaceAll('{turn}', String(latestTurn || 0))
      .replaceAll('{tokens}', formatTokens(latestTokens) ?? '0')
      .replaceAll('{duration}', formatDuration(accumulatedThinkingMs) ?? '0s')
  }

  /** Collect the rich-status candidates that currently make sense. */
  function richCandidates() {
    const candidates = []
    if (now() - lastUserInputAt < USER_INPUT_WINDOW_MS) {
      candidates.push(fillRichTemplate(RICH_STATUSES.userInput))
    }
    if (currentPhase === 'agentWorking' || currentPhase === 'tools' || currentPhase === 'userInput') {
      candidates.push(fillRichTemplate(RICH_STATUSES.thinking))
      if (latestTokens !== undefined) candidates.push(fillRichTemplate(RICH_STATUSES.notes))
      if (accumulatedThinkingMs > 0) candidates.push(fillRichTemplate(RICH_STATUSES.duration))
    }
    return candidates
  }

  /** Push one rich status chosen randomly from the current candidates. */
  function pushRichNow() {
    const candidates = richCandidates()
    if (candidates.length === 0) {
      // Fall back to a vague working line while idle.
      const fallback = lineFor('agentWorking') ?? lineFor('idle')
      if (fallback) pushLine(fallback)
      return
    }
    const line = candidates[Math.floor(Math.random() * candidates.length)]
    pushLine(line)
  }

  // Rich-mode smart random loop: each status stays on screen ≥ 8s.
  function scheduleRichNext() {
    const delay = richMinIntervalMs + Math.floor(Math.random() * richJitterMs)
    return safeTimeout(() => {
      if (!richMode) return
      pushRichNow()
      scheduleRichNext()
    }, delay)
  }

  // --- Activity plumbing: coarse, content-free events only ---

  /** Whether an agent is a top-level (user-facing) session, not a subagent. */
  function isTopLevelAgent(agent) {
    const meta = agent?.session?.header ?? agent?.session?.meta
    if (!meta) return false
    // Subagent children carry origin 'subagent' and a delegation depth > 0.
    if (meta.origin === 'subagent') return false
    if (meta.delegationDepth !== undefined && meta.delegationDepth > 0) return false
    return true
  }

  /** Adopt a top-level session as the active one when none is tracked yet. */
  function adoptTopLevelIfNeeded(agent) {
    if (activeSessionId === undefined && agent && isTopLevelAgent(agent)) {
      activeSessionId = agent.id
    }
  }

  // A user message entered the agent's inbox -> that agent is the session the
  // user is interacting with; "commanding / feeding tokens" only for it.
  ctx.on('agent/inbox/inserted', (payload) => {
    const message = payload?.message
    const agent = payload?.agent
    // Only real user input (source.kind === 'user') selects the active
    // session — subagent relays/receipts must not steal it.
    if (message?.source?.kind === 'user' && agent) {
      activeSessionId = agent.id
      lastUserInputAt = now()
      requestPhase('userInput', { decay: true })
      ensureConnected()
    } else if (activeSessionId === undefined && agent) {
      adoptTopLevelIfNeeded(agent)
    }
  }, { global: true })

  // A top-level agent was created -> adopt it if no active session exists yet
  // (e.g. dsh restarted while a session was open). Subagents never qualify.
  ctx.on('agent/created', (payload) => {
    adoptTopLevelIfNeeded(payload?.agent)
  }, { global: true })

  // Agent toggled idle/running -> "brainstorming / explaining".
  // Only the ACTIVE session's status drives the rich-mode facts and phases.
  ctx.on('agent/status', (payload) => {
    const agent = payload?.agent
    // Before any session is active, only top-level agents may drive phases.
    if (activeSessionId === undefined) {
      if (!agent || !isTopLevelAgent(agent)) return
      activeSessionId = agent.id
    }
    if (agent?.id !== activeSessionId) return
    const status = payload?.status
    if (status === 'running') {
      if (!thinkingStartedAt) thinkingStartedAt = now()
      requestPhase('agentWorking')
      ensureConnected()
    } else if (status === 'idle') {
      if (thinkingStartedAt) {
        accumulatedThinkingMs += now() - thinkingStartedAt
        thinkingStartedAt = 0
      }
      requestPhase('idle')
    }
  }, { global: true })

  // A model step begins -> record turn/step and current token pressure.
  // Only the ACTIVE session's steps count; subagent steps are ignored.
  ctx.on('agent/pre-step', (payload, next) => {
    const agent = payload?.agent
    if (activeSessionId === undefined) {
      adoptTopLevelIfNeeded(agent)
    }
    if (activeSessionId === undefined || agent?.id !== activeSessionId) {
      return next()
    }
    if (payload) {
      latestTurn = Number.isFinite(payload.turn) ? payload.turn : latestTurn
      latestStep = Number.isFinite(payload.step) ? payload.step : latestStep
      if (agent?.session) {
        const tokenMeter = ctx.get('tokenMeter')
        if (tokenMeter !== undefined) {
          try {
            latestTokens = tokenMeter.measure(agent.session)?.totalTokens ?? latestTokens
          } catch {
            // measurement failure keeps the previous value
          }
        }
      }
    }
    return next()
  }, { global: true })

  // A model tool is about to dispatch -> "submitting change suggestions".
  // Only tools dispatched by the ACTIVE session count; subagent tools ignore.
  ctx.on('tools/pre-execute', (exec, next) => {
    const agent = exec?.agent
    if (activeSessionId !== undefined && agent?.id !== activeSessionId) {
      return next()
    }
    requestPhase('tools', { decay: true })
    ensureConnected()
    return next()
  }, { global: true })

  // A new session / fork was created -> "creating a memory slice".
  // Only top-level forks count; a new root session also becomes the active one
  // when nothing is tracked yet.
  ctx.on('session/created', (session) => {
    const header = session?.header ?? session?.meta
    const isTopLevel = header?.origin !== 'subagent'
      && (header?.delegationDepth === undefined || header.delegationDepth === 0)
    if (isTopLevel) {
      if (activeSessionId === undefined && session?.id !== undefined) {
        activeSessionId = session.id
      }
      requestPhase('forking', { decay: true })
      ensureConnected()
    }
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
