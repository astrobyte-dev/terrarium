import { createReadStream, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { performanceDir } from '../packages/core/src/inference/settings'
const revision = 'c9a24f48e1c025556787b0c58dd67a091ece2e44'
const filename = 'sdxl_lightning_4step.safetensors'
const response = await fetch(`https://huggingface.co/api/models/ByteDance/SDXL-Lightning/tree/${revision}`)
if (!response.ok) throw new Error(`Cannot verify publisher metadata: ${response.status}`)
const files = await response.json() as { path: string; lfs?: { oid: string } }[]
const expected = files.find(file => file.path === filename)?.lfs?.oid
if (!expected) throw new Error('Publisher SHA256 is unavailable')
const hash = createHash('sha256')
for await (const chunk of createReadStream(join('C:/ComfyUI/models/checkpoints', filename))) hash.update(chunk)
const actual = hash.digest('hex')
if (expected !== actual) throw new Error('Lightning checkpoint failed publisher checksum verification')
const tags = await fetch('http://127.0.0.1:11434/api/tags').then(r => r.json()) as any
const candidate = tags.models.find((model: any) => model.name === 'huihui_ai/qwen3.5-abliterated:9b')
if (!candidate) throw new Error('Local Qwen candidate is missing')
const result = { date: new Date().toISOString(), lightning: { revision, filename, sha256: actual },
  localChat: { model: candidate.name, digest: candidate.digest, size: candidate.size } }
writeFileSync(join(performanceDir(), 'benchmarks/model-sources.json'), JSON.stringify(result, null, 2))
console.log(JSON.stringify(result))
