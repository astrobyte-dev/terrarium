import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { performanceDir } from '../packages/core/src/inference/settings'
const phase = process.argv[2] ?? 'tuned'
const dir = join(performanceDir(), 'benchmarks'); mkdirSync(dir, { recursive: true })
const prompts = [
  { name: 'voice', messages: [{ role: 'system', content: 'You are Mira, a fictional adult friend, age 28. You are warm, witty and concise. Reply in two sentences without a speaker label.' },
    { role: 'user', content: 'I finally finished fixing my old bicycle. The first ride was wobbly but fun. What would you say?' }] },
  { name: 'recall', messages: [{ role: 'system', content: 'Reply concisely. Use only the supplied conversation for personal facts.' },
    { role: 'user', content: 'My dog is Pip. My interview is Thursday. I prefer tea to coffee.' },
    { role: 'assistant', content: 'Got it: Pip, Thursday, and tea.' },
    { role: 'user', content: 'Correction: the interview moved to Friday. Suggest a calm morning plan. Mention my dog and the corrected day.' }] },
]
const results: Record<string, unknown>[] = []
async function request(url: string, body: Record<string, unknown>) {
  const start = performance.now()
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(180000) })
  let firstTokenMs: number | null = null, text = '', usage: any, summary: any, buffer = ''
  if (!response.ok) return { status: response.status, totalMs: performance.now() - start }
  for await (const chunk of response.body as any) {
    buffer += Buffer.from(chunk).toString('utf8')
    const lines = buffer.split('\n'); buffer = lines.pop() ?? ''
    for (const line of lines) {
      try {
        const data = JSON.parse(line.replace(/^data:\s*/, ''))
        const delta = data.message?.content ?? data.choices?.[0]?.delta?.content ?? ''
        if (delta) { firstTokenMs ??= performance.now() - start; text += delta }
        if (data.usage) usage = data.usage
        if (data.done) summary = data
      } catch { /* SSE comments and terminal markers */ }
    }
  }
  return { status: response.status, firstTokenMs, totalMs: performance.now() - start, text,
    usage, loadMs: summary?.load_duration / 1e6 || undefined, promptTokens: summary?.prompt_eval_count,
    outputTokens: summary?.eval_count, tokensPerSecond: summary?.eval_duration ? summary.eval_count / (summary.eval_duration / 1e9) : undefined,
    correctRecall: /Pip/i.test(text) && /Friday/i.test(text) }
}
if (phase === 'baseline') {
  const queue = await fetch('http://127.0.0.1:8188/queue').then(r => r.json()) as any
  if (queue.queue_running.length || queue.queue_pending.length) throw new Error('Image job active; benchmark deferred')
  await fetch('http://127.0.0.1:8188/free', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ unload_models: true, free_memory: true }) })
}
const localModels = phase === 'baseline' ? ['dolphin3:8b'] : phase === 'local' ? ['dolphin3:8b', 'huihui_ai/qwen3-abliterated:8b', 'huihui_ai/qwen3.5-abliterated:9b'] : []
for (const model of localModels) for (const prompt of prompts) {
  const result = await request(phase === 'baseline' ? 'http://127.0.0.1:11434/api/chat' : 'http://127.0.0.1:18790/ollama/api/chat', {
    model, messages: prompt.messages, stream: true, keep_alive: '20s', think: false,
    options: { num_ctx: phase === 'baseline' ? 16384 : 4096, num_predict: 160, temperature: 0.7, seed: 42 },
  })
  results.push({ model, test: prompt.name, ...result }); console.log(JSON.stringify(results.at(-1)))
}
if (phase === 'hosted') for (const [provider, model] of [['arliai', 'Gemma-4-31B-it'], ['venice', 'venice-uncensored-1-2'], ['venice', 'venice-uncensored-role-play'], ['venice', 'gemma-4-uncensored']]) {
  for (const prompt of prompts) {
    const result = await request(`http://127.0.0.1:18790/${provider}/v1/chat/completions`, { model, messages: prompt.messages, stream: true, max_tokens: 160, temperature: 0.7 })
    results.push({ provider, model, test: prompt.name, ...result }); console.log(JSON.stringify(results.at(-1)))
  }
}
writeFileSync(join(dir, `${phase}.json`), JSON.stringify({ date: new Date().toISOString(), results }, null, 2))
