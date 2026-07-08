/** Traffic-light every catalog brain against this machine's detected hardware. */
import { MODEL_CATALOG } from '../src/catalog/models'
import { trafficLight } from '../src/catalog/traffic'
import { parseNvidiaSmi, NVIDIA_SMI_QUERY } from '../src/detect/hardware'
import { createWindowsSystem } from '../src/system/windows'
import { safe } from '../src/util/safe'

const system = createWindowsSystem()
const gpus = parseNvidiaSmi(await safe(() => system.runPowerShell(NVIDIA_SMI_QUERY), ''))
const hw = { vramMb: gpus[0]?.vramMb ?? 0, ramMb: Math.round(system.totalRamMb()) }

console.log(`Hardware: ${gpus[0]?.name ?? 'no NVIDIA GPU'} (${Math.round(hw.vramMb / 1024)} GB VRAM) · ${Math.round(hw.ramMb / 1024)} GB RAM`)
console.log('Assumes ComfyUI resident (photos on) and 24k context.\n')

const dot = { green: '●', amber: '●', red: '●' }
for (const entry of MODEL_CATALOG) {
  const light = trafficLight(entry, hw, { comfyResidentMb: 1024 })
  console.log(`${dot[light.color]} ${light.color.toUpperCase().padEnd(6)} ${entry.label.padEnd(46)} [${entry.refusalTier}]`)
  console.log(`         ${light.reason}${entry.notes === '' ? '' : ` — ${entry.notes}`}`)
}
process.exit(0)
