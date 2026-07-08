/**
 * Prove the managed ComfyUI renders: boot it, submit a real txt2img workflow
 * against a checkpoint already in its models dir, confirm an image comes out.
 * Requires a checkpoint copied into the managed models/checkpoints first.
 */
import { readdir } from 'node:fs/promises'
import { MANAGED_COMFY_PORT, managedComfySpawn } from '../src/install/comfyui'
import { buildTxt2ImgWorkflow } from '../src/render/workflow'
import { renderImage } from '../src/render/client'
import { createWindowsSystem } from '../src/system/windows'

const CKPT_DIR = 'C:\\Terrarium\\comfyui\\ComfyUI_windows_portable\\ComfyUI\\models\\checkpoints'
const system = createWindowsSystem()

const files = (await readdir(CKPT_DIR)).filter((f) => f.endsWith('.safetensors'))
if (files.length === 0) {
  console.log('no checkpoint in managed models/checkpoints — copy one in first')
  process.exit(1)
}
const checkpoint = files[0]!
const isTurbo = /turbo/i.test(checkpoint)
console.log(`checkpoint: ${checkpoint}${isTurbo ? ' (turbo: 1-step)' : ''}`)

const handle = system.spawnProcess(managedComfySpawn())
handle.onStdoutLine((l) => { if (/to see the gui/i.test(l)) console.log('  ﹥ up') })

const base = `http://127.0.0.1:${MANAGED_COMFY_PORT}`
const deadline = Date.now() + 180_000
while (Date.now() < deadline) {
  if (await system.probeTcp(MANAGED_COMFY_PORT, 1000)) break
  await new Promise((r) => setTimeout(r, 2000))
}

const workflow = buildTxt2ImgWorkflow({
  checkpoint,
  positive: 'a scenic mountain lake at sunrise, photograph',
  negative: 'lowres, blurry',
  width: 512,
  height: 512,
  steps: isTurbo ? 1 : 20,
  cfg: isTurbo ? 1 : 7,
  samplerName: isTurbo ? 'euler_ancestral' : 'euler',
  filenamePrefix: 'terrarium_proof',
})

const result = await renderImage(base, workflow, { onProgress: (p) => console.log(`  ${p}`), timeoutMs: 160_000 })
console.log(result.ok ? `OK: ${result.message} → ${result.images.map((i) => i.filename).join(', ')}` : `FAIL: ${result.message}`)
await system.killTree(handle.pid)
console.log('managed instance stopped.')
process.exit(result.ok && result.images.length > 0 ? 0 : 1)
