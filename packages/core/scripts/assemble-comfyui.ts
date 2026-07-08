/**
 * M4e live assembly: bring the managed ComfyUI to full pipeline parity with
 * the live install — git nodes, bundled bespoke nodes, and every model asset
 * (copied from C:\ComfyUI where present rather than re-downloaded). Ends by
 * booting the managed instance and confirming the pipeline node classes load.
 */
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { CUSTOM_NODES, installBundledNode, installGitNode } from '../src/install/comfy-nodes'
import { MODEL_ASSETS, installModel } from '../src/install/comfy-models'
import { executeCopy, planModelAssembly } from '../src/install/comfy-assemble'
import { MANAGED_COMFY_PORT, managedComfySpawn } from '../src/install/comfyui'
import { createWindowsSystem } from '../src/system/windows'

const PORTABLE = 'C:\\Terrarium\\comfyui\\ComfyUI_windows_portable'
const MANAGED_MODELS = `${PORTABLE}\\ComfyUI\\models`
const CUSTOM_NODES_DIR = `${PORTABLE}\\ComfyUI\\custom_nodes`
const EMBEDDED_PYTHON = `${PORTABLE}\\python_embeded\\python.exe`
const LIVE_MODELS = 'C:\\ComfyUI\\models'
const BUNDLED_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'comfy-nodes')

// classes the face-locked pipeline needs, mapped to what provides them
const REQUIRED_CLASSES = [
  'FaceDetailer', // Impact-Pack
  'UltralyticsDetectorProvider', // Impact-Subpack
  'IPAdapterUnifiedLoader', // IPAdapter_plus
  'IPAdapterAdvanced', // IPAdapter_plus
  'CharacterReferenceLoader', // bundled
  'PromptModelSwitcher', // bundled
]

const system = createWindowsSystem()
const deps = { runPowerShell: (c: string) => system.runPowerShell(c), fileExists: (p: string) => system.fileExists(p) }

console.log('— custom nodes —')
for (const node of CUSTOM_NODES) {
  const result =
    node.repo === null
      ? await installBundledNode(node, { customNodesDir: CUSTOM_NODES_DIR, bundledDir: BUNDLED_DIR }, {
          fileExists: (p) => system.fileExists(p),
          readTextFile: (p) => system.readTextFile(p),
          writeTextFile: (p, t) => system.writeTextFile(p, t),
          ensureDir: (p) => system.ensureDir(p),
        })
      : await installGitNode(node, { customNodesDir: CUSTOM_NODES_DIR, embeddedPython: EMBEDDED_PYTHON }, deps)
  console.log(`  ${result.ok ? 'ok' : 'FAIL'} — ${result.message}`)
  if (!result.ok) process.exit(1)
}

console.log('— model assets —')
const liveExists = await system.fileExists(LIVE_MODELS)
const plan = await planModelAssembly(MODEL_ASSETS, {
  managedModelsDir: MANAGED_MODELS,
  liveModelsDir: liveExists ? LIVE_MODELS : null,
}, deps)

for (const action of plan) {
  if (action.kind === 'skip') {
    console.log(`  skip — ${action.name} (${action.reason})`)
  } else if (action.kind === 'copy') {
    console.log(`  copying ${action.name} (~${action.approxMb} MB) from live install…`)
    const result = await executeCopy(action, {
      runPowerShell: (c) => system.runPowerShell(c),
      ensureDir: (p) => system.ensureDir(p),
      statSize: (p) => system.statSize(p),
    })
    console.log(`  ${result.ok ? 'ok' : 'FAIL'} — ${result.message}`)
    if (!result.ok) process.exit(1)
  } else if (action.kind === 'download') {
    console.log(`  downloading ${action.asset.name} (~${action.asset.approxMb} MB)…`)
    const result = await installModel(action.asset, MANAGED_MODELS, undefined, { ensureDir: (p) => system.ensureDir(p) })
    console.log(`  ${result.ok ? 'ok' : 'FAIL'} — ${result.message}`)
    if (!result.ok) process.exit(1)
  } else {
    console.log(`  MANUAL — ${action.name}: ${action.reason}`)
  }
}

console.log('— boot + verify node classes —')
const handle = system.spawnProcess(managedComfySpawn())
const deadline = Date.now() + 300_000 // Impact Pack does first-boot dependency work
let loaded: string[] = []
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 3000))
  if (!(await system.probeTcp(MANAGED_COMFY_PORT, 1000))) continue
  try {
    const res = await fetch(`http://127.0.0.1:${MANAGED_COMFY_PORT}/object_info`)
    if (!res.ok) continue
    const info = (await res.json()) as Record<string, unknown>
    loaded = REQUIRED_CLASSES.filter((c) => c in info)
    break
  } catch {
    /* not serving yet */
  }
}
await system.killTree(handle.pid)

const missing = REQUIRED_CLASSES.filter((c) => !loaded.includes(c))
for (const c of REQUIRED_CLASSES) console.log(`  ${loaded.includes(c) ? 'ok' : 'MISSING'} — ${c}`)
if (missing.length > 0) {
  console.log(`FAILED — missing classes: ${missing.join(', ')}`)
  process.exit(1)
}
console.log('assembly complete — all pipeline node classes loaded.')
