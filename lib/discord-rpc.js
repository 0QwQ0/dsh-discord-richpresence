import { connect } from 'node:net'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

/**
 * Minimal Discord Rich Presence client over the local IPC transport.
 *
 * Discord's desktop client exposes a local RPC endpoint (a named pipe on
 * Windows, a unix socket on macOS/Linux, or a loopback TCP port) that accepts
 * a JSON frame protocol. A `HANDSHAKE` with a Discord Application client_id
 * (no OAuth token is required for the local IPC transport) is followed by
 * `SET_ACTIVITY` frames. This module deliberately carries zero dependencies.
 *
 * Frame layout (little-endian):
 *   uint32 opcode | uint32 length | UTF-8 JSON payload
 *
 * Opcodes: 0 HANDSHAKE, 1 FRAME, 2 CLOSE, 3 PING, 4 PONG
 */

const OP_HANDSHAKE = 0
const OP_FRAME = 1
const OP_CLOSE = 2
const OP_PING = 3
const OP_PONG = 4

/** Candidate IPC endpoints, ordered by preference. */
function candidateEndpoints() {
  const candidates = []
  if (process.platform === 'win32') {
    for (let i = 0; i < 10; i += 1) {
      candidates.push(`\\\\?\\pipe\\discord-ipc-${i}`)
    }
  } else if (process.platform === 'darwin') {
    const base = join(homedir(), 'Library', 'Application Support', 'discord')
    for (let i = 0; i < 10; i += 1) {
      candidates.push(join(base, `discord-ipc-${i}`))
    }
  } else {
    const base = join(homedir(), '.config', 'discord')
    for (let i = 0; i < 10; i += 1) {
      candidates.push(join(base, `discord-ipc-${i}`))
    }
  }
  // Loopback TCP fallback used by some Discord builds / containers.
  for (let i = 0; i < 10; i += 1) {
    candidates.push(`tcp://127.0.0.1:${6463 + i}`)
  }
  return candidates
}

/** Serialize one RPC frame. */
function encodeFrame(opcode, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8')
  const header = Buffer.alloc(8)
  header.writeUInt32LE(opcode, 0)
  header.writeUInt32LE(body.length, 4)
  return Buffer.concat([header, body])
}

/**
 * Promise-based Rich Presence IPC client.
 *
 * @example
 * const rpc = new DiscordRpc({ clientId: '123456789012345678' })
 * await rpc.connect()
 * await rpc.setActivity({ state: '正在干活', details: 'DSH' })
 * // rpc.close() on shutdown; rpc.on('disconnected') fires on drop.
 */
export class DiscordRpc {
  /**
   * @param {object} options
   * @param {string} options.clientId - Discord Application ID.
   * @param {number} [options.connectTimeoutMs=5000] - per-endpoint connect timeout.
   */
  constructor(options) {
    this.clientId = options.clientId
    this.connectTimeoutMs = options.connectTimeoutMs ?? 5000
    /** @type {import('node:net').Socket | undefined} */
    this.socket = undefined
    this.buffer = Buffer.alloc(0)
    /** @type {Map<string, (msg: any) => void>} pending nonce -> resolver */
    this.pending = new Map()
    this.ready = false
    this.connected = false
    this.closed = false
    /** @type {Set<(msg: any) => void>} */
    this.listeners = new Set()
    /** @type {Set<() => void>} */
    this.disconnectListeners = new Set()
    /** @type {NodeJS.Timeout | undefined} */
    this.pingTimer = undefined
  }

  /** Subscribe to inbound RPC messages (after READY). Returns unsubscribe. */
  onMessage(listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Subscribe to transport drops. Returns unsubscribe. */
  onDisconnect(listener) {
    this.disconnectListeners.add(listener)
    return () => this.disconnectListeners.delete(listener)
  }

  /** True while the IPC transport is connected and READY. */
  isConnected() {
    return this.connected && this.ready
  }

  /**
   * Try each endpoint until one connects and completes the handshake.
   */
  connect() {
    if (this.closed) throw new Error('DiscordRpc is closed')
    const endpoints = candidateEndpoints()
    return this.#tryEndpoints(endpoints, 0)
  }

  async #tryEndpoints(endpoints, index) {
    if (index >= endpoints.length) {
      throw new Error('no Discord IPC endpoint available (is Discord running?)')
    }
    const endpoint = endpoints[index]
    try {
      await this.#connectOne(endpoint)
      return
    } catch (error) {
      // A reachable-but-wrong endpoint (e.g. stale pipe) is worth one retry;
      // otherwise move on to the next candidate.
      if (this.closed) throw error
      return this.#tryEndpoints(endpoints, index + 1)
    }
  }

  /** Connect to one endpoint and perform the handshake. */
  #connectOne(endpoint) {
    return new Promise((resolve, reject) => {
      const socket = endpoint.startsWith('tcp://')
        ? connect({ host: '127.0.0.1', port: Number(endpoint.slice('tcp://'.length).split(':')[1]) })
        : connect(endpoint)
      this.socket = socket

      let settled = false
      const fail = (error) => {
        if (settled) return
        settled = true
        socket.destroy()
        this.socket = undefined
        reject(error)
      }
      const succeed = () => {
        if (settled) return
        settled = true
        this.connected = true
        resolve()
      }

      socket.setTimeout(this.connectTimeoutMs)
      socket.once('timeout', () => fail(new Error(`connect timeout: ${endpoint}`)))
      socket.once('error', (error) => fail(error))
      socket.once('close', () => {
        if (!settled) fail(new Error(`closed before handshake: ${endpoint}`))
        else this.#handleClose()
      })

      socket.on('data', (chunk) => this.#onData(chunk))

      // Handshake: opcode 0, { v, client_id }.
      this.#write(OP_HANDSHAKE, {
        v: 1,
        client_id: this.clientId,
      })
      this.#waitFor('READY', 4000).then(() => {
        this.ready = true
        succeed()
        this.#startPing()
      }).catch((error) => fail(error))
    })
  }

  /** Accumulate incoming bytes and parse complete frames. */
  #onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk])
    while (this.buffer.length >= 8) {
      const opcode = this.buffer.readUInt32LE(0)
      const length = this.buffer.readUInt32LE(4)
      if (this.buffer.length < 8 + length) break
      const body = this.buffer.subarray(8, 8 + length)
      this.buffer = this.buffer.subarray(8 + length)
      let message
      try {
        message = JSON.parse(body.toString('utf8'))
      } catch {
        continue
      }
      this.#dispatch(opcode, message)
    }
  }

  #dispatch(opcode, message) {
    if (opcode === OP_PING) {
      this.#write(OP_PONG, {})
      return
    }
    if (opcode === OP_CLOSE) {
      this.#handleClose()
      return
    }
    // Frame (opcode 1): resolve pending requests or fan out to listeners.
    if (message?.nonce && this.pending.has(message.nonce)) {
      const resolve = this.pending.get(message.nonce)
      this.pending.delete(message.nonce)
      resolve(message)
      return
    }
    for (const listener of this.listeners) {
      try {
        listener(message)
      } catch {
        // listener errors must not kill the transport
      }
    }
  }

  #write(opcode, payload) {
    if (!this.socket || this.socket.destroyed) return
    this.socket.write(encodeFrame(opcode, payload))
  }

  /**
   * Send a command and await its response frame (matched by nonce).
   */
  request(cmd, args, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      if (!this.connected) {
        reject(new Error('not connected'))
        return
      }
      const nonce = randomUUID()
      const timer = setTimeout(() => {
        this.pending.delete(nonce)
        reject(new Error(`timeout waiting for ${cmd}`))
      }, timeoutMs)
      this.pending.set(nonce, (message) => {
        clearTimeout(timer)
        if (message.evt === 'ERROR') {
          reject(new Error(`${cmd} failed: ${message.data?.message ?? 'unknown error'}`))
        } else {
          resolve(message)
        }
      })
      this.#write(OP_FRAME, { cmd, args, nonce })
    })
  }

  /**
   * Update the displayed Rich Presence activity.
   *
   * @param {object} activity - Discord activity payload (state, details, timestamps, assets, ...).
   */
  async setActivity(activity) {
    if (!this.isConnected()) return false
    try {
      await this.request('SET_ACTIVITY', {
        pid: process.pid,
        activity,
      })
      return true
    } catch {
      return false
    }
  }

  /**
   * Clear the current activity (back to "no game/activity").
   */
  async clearActivity() {
    return this.setActivity({})
  }

  /** Wait until an inbound DISPATCH with the given event name arrives. */
  #waitFor(event, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.listeners.delete(listener)
        reject(new Error(`timeout waiting for ${event}`))
      }, timeoutMs)
      const listener = (message) => {
        if (message.evt === event) {
          clearTimeout(timer)
          this.listeners.delete(listener)
          resolve(message)
        }
      }
      this.listeners.add(listener)
    })
  }

  #startPing() {
    this.#stopPing()
    this.pingTimer = setInterval(() => {
      if (this.connected) this.#write(OP_PING, {})
    }, 15000)
    // Do not keep the process alive on the ping interval alone.
    if (typeof this.pingTimer.unref === 'function') this.pingTimer.unref()
  }

  #stopPing() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer)
      this.pingTimer = undefined
    }
  }

  #handleClose() {
    const wasConnected = this.connected
    this.connected = false
    this.ready = false
    this.socket = undefined
    this.buffer = Buffer.alloc(0)
    for (const resolve of this.pending.values()) {
      try {
        resolve({ evt: 'ERROR', data: { message: 'transport closed' } })
      } catch {
        // ignore
      }
    }
    this.pending.clear()
    this.#stopPing()
    if (wasConnected) {
      for (const listener of this.disconnectListeners) {
        try {
          listener()
        } catch {
          // ignore
        }
      }
    }
  }

  /** Close the transport and stop all timers. */
  close() {
    this.closed = true
    this.#stopPing()
    if (this.socket) {
      try {
        this.socket.destroy()
      } catch {
        // ignore
      }
      this.socket = undefined
    }
    this.connected = false
    this.ready = false
  }
}

/**
 * Convenience: build the standard activity object for a status line.
 *
 * @param {object} options
 * @param {string} options.state - short status line shown on Discord.
 * @param {string} [options.details] - optional second line.
 * @param {number} [options.startTime] - epoch ms; presence shows elapsed time.
 * @param {string} [options.largeImage] - asset key configured in the Discord app.
 */
export function buildActivity({ state, details, startTime, largeImage }) {
  const activity = {
    state,
    type: 0, // Playing
  }
  if (details) activity.details = details
  if (startTime) activity.timestamps = { start: startTime }
  if (largeImage) {
    activity.assets = { large_image: largeImage }
  }
  return activity
}
