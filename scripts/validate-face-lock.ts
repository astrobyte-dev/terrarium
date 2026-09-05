import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { performanceDir } from '../packages/core/src/inference/settings'
import { buildFaceWorkflow } from '../packages/core/src/render/face-workflow'
import { renderImage, uploadImage } from '../packages/core/src/render/client'
const root = 'http://127.0.0.1:18790/comfy'
const dir = join(performanceDir(), 'benchmarks/images')
const ref = await uploadImage(root, 'terrarium_benchmark_adult_reference.png', readFileSync(join(dir, 'balanced.png')))
if (!ref.ok) throw new Error(ref.message)
const graph = buildFaceWorkflow({ preset: 'balanced', refImageName: ref.name, seed: 84,
  prompt: 'An adult woman aged 30 wearing a blue wool sweater, sitting at a cafe table with a book, natural daylight, portrait photograph' })
graph['7']!.inputs.filename_prefix = 'terrarium_benchmark_face_lock'
const start = performance.now()
const result = await renderImage(root, graph, { timeoutMs: 600000, pollIntervalMs: 500 })
if (!result.ok || !result.images[0]) throw new Error(result.message)
const image = result.images[0]
const response = await fetch(`${root}/view?${new URLSearchParams({ filename: image.filename, subfolder: image.subfolder, type: image.type })}`)
writeFileSync(join(dir, 'face-lock.png'), Buffer.from(await response.arrayBuffer()))
const metadata = { ok: true, elapsedMs: performance.now() - start, preset: 'balanced', faceLock: true, seed: 84, promptId: result.promptId }
writeFileSync(join(dir, 'face-lock.json'), JSON.stringify(metadata, null, 2))
console.log(JSON.stringify(metadata))
