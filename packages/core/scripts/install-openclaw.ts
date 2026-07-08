/** Install (or repair) the pinned OpenClaw copy in the Terrarium runtime. Idempotent. */
import { createOpenclawInstaller } from '../src/install/openclaw'
import { createWindowsSystem } from '../src/system/windows'

const installer = createOpenclawInstaller(createWindowsSystem())
const plan = await installer.plan()
if (plan.actions.length === 0) {
  console.log(`already pinned: openclaw@${plan.installed?.version} at ${plan.installed?.path}`)
  process.exit(0)
}
console.log(plan.actions[0])
const outcome = await installer.install((p) => console.log(`  ${p.phase}…`))
console.log(outcome.ok ? `OK: ${outcome.message}` : `FAIL: ${outcome.message}`)
console.log('verify:', await installer.verify())
process.exit(outcome.ok ? 0 : 1)
