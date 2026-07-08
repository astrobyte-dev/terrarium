/** Install the managed ComfyUI portable (sacrificial parallel install). */
import { createComfyuiInstaller } from '../src/install/comfyui'
import { createWindowsSystem } from '../src/system/windows'

const installer = createComfyuiInstaller({ system: createWindowsSystem() })
const plan = await installer.plan()
console.log('plan:', JSON.stringify(plan.actions), 'blockers:', JSON.stringify(plan.blockers))
if (plan.installed !== null && plan.installed.path.includes('Terrarium')) {
  console.log('managed ComfyUI already installed at', plan.installed.path)
  process.exit(0)
}

let lastPct = -1
const outcome = await installer.install((p) => {
  if (p.percent !== null && p.percent !== lastPct && p.percent % 5 === 0) {
    console.log(`  ${p.phase}: ${p.percent}%`)
    lastPct = p.percent
  } else if (p.percent === null) {
    console.log(`  ${p.phase}`)
  }
})
console.log(outcome.ok ? `OK: ${outcome.message}` : `FAIL: ${outcome.message}`)
process.exit(outcome.ok ? 0 : 1)
