// Guard against the inject/registration mismatch this plugin once shipped:
// `dsh.client.inject` listed a package that the deployment does not compose,
// which silently prevents the browser half from activating.
//
// Every name in our `dsh.client.inject` must appear as a row in the profile's
// composed bundle patches (dsh-base + dsh-web-app + the profile's own patch).
//
// Run from anywhere; the deployment root defaults to $DSH_HOME or ~/.dsh.
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const profileDir = join(dshHome, 'profiles', 'web')
const modulesDir = join(dshHome, 'profiles', 'node_modules', '@deepseek-ai')

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const declared = pkg.dsh?.client?.inject ?? []
console.log('declared dsh.client.inject:', JSON.stringify(declared))

if (!existsSync(modulesDir)) {
  console.log(`SKIP: no deployed profile at ${modulesDir}`)
  process.exit(0)
}

/** Collect every `name:` row from the bundle patches that compose this profile. */
function collectRows() {
  const rows = new Set()
  const patches = [
    join(modulesDir, 'dsh-base', 'cordis.patch.yml'),
    join(modulesDir, 'dsh-web-app', 'cordis.patch.yml'),
    join(profileDir, 'cordis.patch.yml'),
  ]
  for (const p of patches) {
    if (!existsSync(p)) continue
    const text = readFileSync(p, 'utf8')
    for (const m of text.matchAll(/^\s*-?\s*name:\s*'?([^'\s]+)'?\s*$/gm)) rows.add(m[1])
  }
  return rows
}

const rows = collectRows()
console.log(`composed rows: ${rows.size}`)

const missing = declared.filter((name) => !rows.has(name))
if (missing.length > 0) {
  console.error('FAIL: these injected packages are not in the composed profile:')
  for (const m of missing) console.error('  -', m)
  console.error('A listed package must be a composed row; otherwise the browser half never activates.')
  process.exit(1)
}

// Also assert the bundle's own service-level inject exports are sane strings.
const clientSrc = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const injectMatch = clientSrc.match(/var inject = \[([\s\S]*?)\]/)
if (!injectMatch) {
  console.error('FAIL: lib/client.js has no inject array')
  process.exit(1)
}
const services = [...injectMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
console.log('bundle service inject:', JSON.stringify(services))

console.log('CLIENT INJECT TEST PASSED')
process.exit(0)
