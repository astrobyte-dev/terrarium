/**
 * Read-only health check: diagnose drift from the known-good state
 * (config, credentials, ownership). Pass --repair to regenerate the config
 * from the proven template (rotates a backup first). Touches nothing otherwise.
 */
import { createSupervisor } from '../src/index'

const sup = createSupervisor()
const report = await sup.doctor()

const ICON = { ok: '✓', warn: '!', fail: '✗' } as const
console.log('Terrarium doctor\n')
for (const c of report.checks) {
  console.log(`${ICON[c.status]} ${c.title.padEnd(12)} ${c.detail}`)
}
console.log(`\n${report.healthy ? 'All good.' : 'Attention needed above.'}`)

if (process.argv.includes('--repair')) {
  console.log('\nRepairing (regenerating config)…')
  const result = await sup.repair()
  console.log(`  ${result.message}`)
}
