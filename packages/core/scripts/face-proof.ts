/**
 * M4e proof: run the EXACT face-locked pipeline (IPAdapter + FaceDetailer
 * face & hand passes) on the managed ComfyUI, using a real character ref.
 * Usage: tsx face-proof.ts [character] [outDir]
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { buildFaceWorkflow } from '../src/render/face-workflow'
import { renderImage, uploadImage } from '../src/render/client'
import { MANAGED_COMFY_PORT, managedComfySpawn } from '../src/install/comfyui'
import { createWindowsSystem } from '../src/system/windows'

const character = process.argv[2] ?? 'luna'
const outDir = process.argv[3] ?? join(process.cwd(), 'proof-output')
const BASE = `http://127.0.0.1:${MANAGED_COMFY_PORT}`
const system = createWindowsSystem()

const handle = system.spawnProcess(managedComfySpawn())
handle.onStderrLine((l) => {
  if (/error|traceback/i.test(l)) console.log(`  [comfy] ${l}`)
})
console.log('booting managed ComfyUI…')
const bootDeadline = Date.now() + 240_000
let up = false
while (Date.now() < bootDeadline && !up) {
  await new Promise((r) => setTimeout(r, 2000))
  if (!(await system.probeTcp(MANAGED_COMFY_PORT, 1000))) continue
  up = await fetch(`${BASE}/system_stats`).then((r) => r.ok).catch(() => false)
}
if (!up) {
  console.log('FAILED — managed ComfyUI never came up')
  await system.killTree(handle.pid)
  process.exit(1)
}

const refPath = join(homedir(), '.openclaw', 'workspace', 'characters', 'refs', `${character}.png`)
console.log(`uploading face ref ${refPath}…`)
const refBytes = new Uint8Array(await readFile(refPath))
const upload = await uploadImage(BASE, `${character}.png`, refBytes)
console.log(`  ${upload.message}`)
if (!upload.ok || upload.name === null) {
  await system.killTree(handle.pid)
  process.exit(1)
}

const workflow = buildFaceWorkflow({
  prompt: 'woman in a red summer dress standing on a beach at golden hour, smiling at the camera, hands relaxed at her sides',
  seed: 20260707,
  refImageName: upload.name,
})
console.log('rendering face-locked image (base + IPAdapter + face pass + hand pass)…')
const started = Date.now()
const result = await renderImage(BASE, workflow, {
  timeoutMs: 600_000,
  onProgress: (phase) => console.log(`  ${phase}`),
})
console.log(`  ${result.message} in ${Math.round((Date.now() - started) / 1000)}s`)

let saved: string | null = null
if (result.ok && result.images.length > 0) {
  const img = result.images[0]!
  const q = new URLSearchParams({ filename: img.filename, subfolder: img.subfolder, type: img.type })
  const res = await fetch(`${BASE}/view?${q}`)
  const bytes = new Uint8Array(await res.arrayBuffer())
  await mkdir(outDir, { recursive: true })
  saved = join(outDir, `face-proof-${character}.png`)
  await writeFile(saved, bytes)
  console.log(`saved: ${saved} (${bytes.length} bytes)`)
}

await system.killTree(handle.pid)
console.log(saved !== null ? 'face-locked pipeline verified on managed ComfyUI.' : 'FAILED — no image produced')
process.exit(saved !== null ? 0 : 1)
