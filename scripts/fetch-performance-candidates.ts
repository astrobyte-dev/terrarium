import { createWriteStream, existsSync, mkdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
const model = 'huihui_ai/qwen3.5-abliterated:9b'
async function pull() {
  const response = await fetch('http://127.0.0.1:11434/api/pull', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model }) })
  if (!response.ok) throw new Error(`Ollama pull failed (${response.status})`)
  let buffer = '', previous = ''
  for await (const chunk of response.body as any) {
    buffer += Buffer.from(chunk).toString('utf8')
    const lines = buffer.split('\n'); buffer = lines.pop() ?? ''
    for (const line of lines) if (line.trim()) {
      const item = JSON.parse(line)
      if (item.error) throw new Error('Ollama candidate download failed')
      const progress = item.total ? Math.floor(item.completed / item.total * 10) * 10 : item.status
      const status = `${item.status}: ${progress}`
      if (status !== previous) { console.log(`Local chat candidate ${status}`); previous = status }
    }
  }
}
async function image() {
  const folder = 'C:/ComfyUI/models/checkpoints'
  mkdirSync(folder, { recursive: true })
  const dest = join(folder, 'sdxl_lightning_4step.safetensors')
  if (existsSync(dest)) return console.log('Lightning checkpoint already present')
  const response = await fetch('https://huggingface.co/ByteDance/SDXL-Lightning/resolve/c9a24f48e1c025556787b0c58dd67a091ece2e44/sdxl_lightning_4step.safetensors')
  if (!response.ok || !response.body) throw new Error(`Lightning download failed (${response.status})`)
  await pipeline(Readable.fromWeb(response.body as any), createWriteStream(dest + '.partial'))
  renameSync(dest + '.partial', dest)
  console.log('Downloaded official SDXL-Lightning checkpoint (pinned revision)')
}
const results = await Promise.allSettled([pull(), image()])
for (const result of results) if (result.status === 'rejected') { console.error(String(result.reason)); process.exitCode = 1 }
