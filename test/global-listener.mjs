// Core hypothesis test: does a { global: true } listener registered on the
// ROOT context receive events dispatched with an agent-style carrier (thisArg
// with a filter that would normally exclude the root listener)?
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const require = createRequire(fileURLToPath(new URL('../lib/index.js', import.meta.url)))
const cordisPath = require.resolve('@deepseek-ai/cordis', {
  paths: ['C:/Users/Hacke/.dsh/profiles/web'],
})
const { Context } = await import(pathToFileURL(cordisPath).href)

const ctx = new Context()

let globalReceived = 0
let plainReceived = 0

// The plugin registers listeners like this on the root context:
ctx.on('agent/status', () => { globalReceived += 1 }, { global: true })
ctx.on('agent/status', () => { plainReceived += 1 })

// Simulate dsh-agent's agentEvents(): dispatch with a carrier as thisArg.
// The carrier's [Context.filter] excludes listeners outside the agent isolate
// (returns false for the root ctx), exactly like Scoped<Agent> does.
const filterSymbol = Symbol.for('cordis.filter')
const carrier = {
  [filterSymbol](targetCtx) {
    // Real Service filter: same isolate scope only. Root ctx fails this.
    return targetCtx === this
  },
}

const args = [carrier, 'agent/status', { agent: {}, status: 'running' }]
const callbacks = ctx.events.dispatch('emit', args)
for (const cb of callbacks) {
  try { cb(...args) } catch (error) { console.error('listener threw:', error) }
}

console.log('global listener received:', globalReceived, '(expect 1)')
console.log('plain listener received:', plainReceived, '(expect 0)')

if (globalReceived === 1 && plainReceived === 0) {
  console.log('HYPOTHESIS CONFIRMED: { global: true } on root receives agent-scoped events')
  process.exit(0)
} else {
  console.error('HYPOTHESIS FAILED')
  process.exit(1)
}
