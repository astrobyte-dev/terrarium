/**
 * Create a character from a spec JSON file. Dry-run by default — pass --write
 * to actually add it (full card + compact card into AGENTS.md, with backup).
 *
 *   npm run create-bot -- path\to\spec.json [--write]
 */
import { createBot } from '../src/bots/workspace'
import { renderCompactCard, renderFullCard } from '../src/bots/render'
import type { BotSpec } from '../src/bots/spec'
import { createWindowsSystem } from '../src/system/windows'

const specPath = process.argv[2]
const write = process.argv.includes('--write')
if (specPath === undefined) {
  console.error('usage: npm run create-bot -- <spec.json> [--write]')
  process.exit(1)
}

const system = createWindowsSystem()
const spec = JSON.parse(await system.readTextFile(specPath)) as BotSpec
const result = await createBot({ system, spec, dryRun: !write })

if (!result.ok) {
  console.log('NOT CREATED:')
  for (const e of result.errors) console.log(`  ! ${e}`)
  if (result.plan !== null) {
    console.log(`  (AGENTS.md: ${result.plan.currentChars} chars used, card needs ${result.plan.cardChars}, headroom ${result.plan.headroom})`)
  }
  process.exit(1)
}

const plan = result.plan!
console.log(`${spec.displayName} (${spec.age}) — ${write ? 'CREATED' : 'DRY RUN, nothing written'}`)
console.log(`  AGENTS.md: ${plan.currentChars} → ${plan.resultChars} chars (limit 12000, headroom after: ${12000 - 200 - plan.resultChars})`)
console.log(`  full card: ${renderFullCard(spec).length} chars → ${result.fullCardPath}`)
console.log(`  compact card: ${renderCompactCard(spec).length} chars`)
if (write) console.log(`  AGENTS.md backup: ${result.backupPath}`)
if (write) console.log('\nRestart the gateway (r on gateway in the TUI, or task restart) to load her.')
process.exit(0)
