/**
 * Emergency hand-back: stop/sweep every OpenClaw-stack process and re-enable
 * the scheduled tasks. Use when a supervisor session died and the bot must
 * return to task ownership without opening the TUI.
 */
import { createSupervisor } from '../src/index'

const sup = createSupervisor()
const ledger = await sup.ownership()
if (ledger === null) {
  console.log('Not migrated — the scheduled tasks already own the stack. Nothing to do.')
  process.exit(0)
}

console.log(`Releasing ownership taken ${ledger.migratedAt} back to the scheduled tasks…`)
await sup.release()
console.log('Done. Tasks re-enabled and started; the bot is coming back under task ownership.')
process.exit(0)
