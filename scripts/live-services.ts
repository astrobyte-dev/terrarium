import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import assert from 'node:assert/strict'
import { createChatClient, createWindowsSystem, buildTxt2ImgWorkflow, renderImage } from '../packages/core/src/index'

// Explicit, local integration test: creates a dedicated conversation and media.
// Never run as part of the unit suite; services must already be running.
const out = resolve('.desktop-smoke')
mkdirSync(out, { recursive: true })
const results: { name: string; ok: boolean; detail: string }[] = []
const boundedFetch: typeof fetch = (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(120_000) })
async function check(name: string, fn: () => Promise<string>) {
  console.log(`Checking ${name}...`)
  try { results.push({ name, ok: true, detail: await fn() }) }
  catch (error) { results.push({ name, ok: false, detail: error instanceof Error ? error.message : String(error) }) }
  writeFileSync(join(out, 'live-results.json'), JSON.stringify({ date: new Date().toISOString(), results }, null, 2))
  console.log(`${results.at(-1)!.ok ? 'PASS' : 'FAIL'} ${name}: ${results.at(-1)!.detail}`)
}

await check('gateway chat and reconnect', async () => {
  const client = createChatClient({ system: createWindowsSystem(),
    sessionKey: `agent:main:terrarium-validation-${randomUUID()}`, deliverExternally: false,
    replyPollAttempts: 120, replyPollIntervalMs: 1000, connectTimeoutMs: 15_000 })
  client.on('error', () => {})
  const deadline = setTimeout(() => client.close(), 150_000)
  try {
    await client.connect()
    const prompt = 'Local software validation: reply exactly TERRARIUM_OK. Do not use tools or contact any channels.'
    await client.send(prompt)
    const before = await client.history()
    assert(before.some(m => m.role === 'assistant' && m.text.includes('TERRARIUM_OK')), 'No expected assistant response')
    client.close()
    await client.connect()
    const after = await client.history()
    assert(after.some(m => m.role === 'user' && m.text === prompt), 'Test message missing after reconnect')
    assert(after.some(m => m.role === 'assistant' && m.text.includes('TERRARIUM_OK')), 'Reply missing after reconnect')
    return 'Dedicated session accepted a message, replied, and retained history after client reconnect; external delivery disabled.'
  } finally { clearTimeout(deadline); client.close() }
})

await check('Ollama generation', async () => {
  const response = await boundedFetch('http://127.0.0.1:11434/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'dolphin3:8b', stream: false,
      messages: [{ role: 'user', content: 'Reply with the word hello.' }],
      options: { num_predict: 16, temperature: 0 } }),
  })
  assert(response.ok, `Ollama HTTP ${response.status}`)
  const body = await response.json() as { message?: { content?: string }; done?: boolean }
  assert(body.done && body.message?.content?.trim(), 'Ollama returned no completed text')
  return 'dolphin3:8b returned completed, nonempty text.'
})

await check('ComfyUI image generation', async () => {
  const base = 'http://127.0.0.1:8188'
  const queue = await (await boundedFetch(`${base}/queue`)).json() as { queue_running: unknown[]; queue_pending: unknown[] }
  assert(queue.queue_running.length + queue.queue_pending.length === 0, 'ComfyUI is busy; defer validation until idle')
  const result = await renderImage(base, buildTxt2ImgWorkflow({
    checkpoint: 'sd_xl_turbo_1.0_fp16.safetensors', positive: 'A peaceful mountain lake, pine forest, daylight, landscape photograph',
    width: 512, height: 512, steps: 1, cfg: 1, seed: 42,
    filenamePrefix: `terrarium_validation_${randomUUID()}`,
  }), { timeoutMs: 180_000, fetchImpl: boundedFetch })
  assert(result.ok && result.images.length > 0, result.message)
  const descriptor = result.images[0]!
  const response = await boundedFetch(`${base}/view?${new URLSearchParams({ ...descriptor })}`)
  assert(response.ok, `Image HTTP ${response.status}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  assert(bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])), 'Output is not PNG')
  assert.equal(bytes.readUInt32BE(16), 512)
  assert.equal(bytes.readUInt32BE(20), 512)
  writeFileSync(join(out, 'live-image.png'), bytes)
  return 'Rendered and downloaded a valid 512 by 512 PNG using the production workflow/client.'
})

await check('Kokoro voice generation', async () => {
  const root = join(homedir(), '.openclaw', 'workspace', 'skills', 'voice-kokoro')
  const wav = join(out, 'live-voice.wav')
  await promisify(execFile)(join(root, 'venv', 'Scripts', 'python.exe'), [join(root, 'kokoro_tts.py'),
    '--text', 'Terrarium voice validation is complete.', '--voice', 'af_heart', '--out', wav],
    { cwd: root, windowsHide: true, timeout: 120_000 })
  const bytes = readFileSync(wav)
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF')
  assert.equal(bytes.toString('ascii', 8, 12), 'WAVE')
  assert(bytes.length > 1000, 'Empty voice output')
  return `Generated a WAV file (${bytes.length} bytes) with the installed voice engine.`
})
if (results.some(result => !result.ok)) process.exitCode = 1
