import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { freemem, totalmem } from 'node:os'
import { buildFaceWorkflow } from '../packages/core/src/render/face-workflow'
import { renderImage } from '../packages/core/src/render/client'
import { performanceDir } from '../packages/core/src/inference/settings'
const dir = join(performanceDir(), 'benchmarks', 'images'); mkdirSync(dir, { recursive: true })
const results: unknown[] = []
for (const preset of ['quality', 'balanced', 'preview', 'lightning'] as const) {
  // Clear node-result reuse so Balanced cannot reuse Quality's already-rendered face.
  for (;;) {
    const queue = await fetch('http://127.0.0.1:8188/queue').then(r => r.json()) as any
    if (!queue.queue_running.length && !queue.queue_pending.length) break
    await new Promise(r => setTimeout(r, 500))
  }
  await fetch('http://127.0.0.1:8188/free', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ free_memory: true, unload_models: false }) })
  await new Promise(r => setTimeout(r, 500))
  const graph = buildFaceWorkflow({ preset, prompt: 'An adult woman aged 30 wearing a blue wool sweater, sitting at a cafe table with a book, hands resting on the table, natural daylight, medium portrait photograph', seed: 42 })
  graph['7']!.inputs.filename_prefix = `terrarium_benchmark_${preset}`
  let peakVramMiB = 0, peakSystemRamMiB = 0, measuring = false
  const sample = () => {
    peakSystemRamMiB = Math.max(peakSystemRamMiB, (totalmem() - freemem()) / 1048576)
    if (measuring) return
    measuring = true
    execFile('nvidia-smi', ['--query-gpu=memory.used', '--format=csv,noheader,nounits'], { windowsHide: true, timeout: 3000 }, (_e, stdout) => {
      const used = parseFloat(stdout); if (Number.isFinite(used)) peakVramMiB = Math.max(peakVramMiB, used)
      measuring = false
    })
  }
  const timer = setInterval(sample, 1000); sample()
  const start = performance.now()
  try {
    const result = await renderImage('http://127.0.0.1:18790/comfy', graph, { timeoutMs: 600000, pollIntervalMs: 500 })
    const elapsedMs = performance.now() - start
    let path: string | undefined
    if (result.ok && result.images[0]) {
      const image = result.images[0]
      const response = await fetch(`http://127.0.0.1:18790/comfy/view?${new URLSearchParams({ filename: image.filename, subfolder: image.subfolder, type: image.type })}`)
      if (!response.ok) throw new Error('Could not download benchmark image')
      path = join(dir, `${preset}.png`); writeFileSync(path, Buffer.from(await response.arrayBuffer()))
    }
    const row = { preset, seed: 42, nodeCacheCleared: true, ok: result.ok, elapsedMs, peakVramMiB, peakSystemRamMiB: Math.round(peakSystemRamMiB), path, promptId: result.promptId, message: result.message }
    results.push(row); console.log(JSON.stringify(row))
    writeFileSync(join(dir, 'results.json'), JSON.stringify({ date: new Date().toISOString(), results }, null, 2))
  } finally { clearInterval(timer) }
}
