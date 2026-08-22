// Smoke test: load the plugin in a real Cordis context, fire the coarse
// events, and confirm the plugin applies without throwing and reacts.
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Resolve @deepseek-ai/cordis from the installed dsh profile (the same
// resolution the real harness uses at runtime).
const require = createRequire(fileURLToPath(new URL('../lib/index.js', import.meta.url)))
const cordisPath = require.resolve('@deepseek-ai/cordis', {
  paths: ['C:/Users/Hacke/.dsh/profiles/web'],
})
const { Context } = await import(pathToFileURL(cordisPath).href)

const { apply, name } = await import('../lib/index.js')

console.log('plugin name:', name)

const ctx = new Context()
let applied = false
let dispose
try {
  dispose = apply(ctx, {
    clientId: 'SMOKE_TEST_CLIENT',
    details: 'smoke test',
    statuses: {
      userInput: ['正在指挥大肥鱼干活'],
      agentWorking: ['正在与大肥鱼一起 Brainstorming'],
      tools: ['正在提交改动意见'],
      forking: ['正在创建大肥鱼记忆切片'],
      idle: ['正在等待大肥鱼待命'],
    },
    minIntervalMs: 1,
    reconnectMs: 100,
  })
  applied = true
  console.log('apply OK, disposer type:', typeof dispose)
} catch (error) {
  console.error('apply FAILED:', error)
  process.exit(1)
}

// Fire the coarse events on a child scoped context (mimic agent scope).
const scoped = ctx.extend({})
try {
  ctx.emit(scoped, 'agent/inbox/inserted', { agent: {}, message: {} })
  ctx.emit(scoped, 'agent/status', { agent: {}, status: 'running' })
  ctx.emit(scoped, 'tools/pre-execute', { name: 'x' }, () => Promise.resolve({ ok: true }))
  ctx.emit(scoped, 'session/created', { id: 's1' })
  ctx.emit(scoped, 'workflow/start', { runId: 'w1' })
  console.log('events fired without throwing')
} catch (error) {
  console.error('event dispatch FAILED:', error)
  process.exit(1)
}

// Wait a moment for debounced pushes to attempt (they will fail silently:
// no Discord endpoint in this sandbox).
await new Promise((resolve) => setTimeout(resolve, 600))

if (typeof dispose === 'function') {
  dispose()
  console.log('dispose OK')
} else {
  console.warn('no disposer returned (expected when clientId missing only)')
}

console.log('SMOKE TEST PASSED')
process.exit(0)
