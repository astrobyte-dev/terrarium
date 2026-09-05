import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import { RequestQueue } from './queue'
import { compactMessages, type Message } from './context'
import { INFERENCE_PORT, performanceDir, performanceSettings } from './settings'
import { VENICE_BASE_URL, VENICE_MODELS, veniceRequest } from './venice'

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
export interface ProxyOptions {
  port?: number; ollamaUrl?: string; comfyUrl?: string; arliaiUrl?: string; veniceUrl?: string
  workspace?: string; dataDir?: string; fetchImpl?: typeof fetch
  credentials?: { venice?: string | null; arliai?: string | null }
  compact?: boolean; budgetUsd?: number
  externalGpuBusy?: () => Promise<boolean>
}

export function createInferenceProxy(options: ProxyOptions = {}) {
  const gpu = new RequestQueue()
  const providers = { venice: new RequestQueue(), arliai: new RequestQueue() }
  const dir = options.dataDir ?? performanceDir()
  mkdirSync(dir, { recursive: true })
  const fetchFn = options.fetchImpl ?? fetch
  const ollama = options.ollamaUrl ?? 'http://127.0.0.1:11434'
  const comfy = options.comfyUrl ?? 'http://127.0.0.1:8188'
  const ledgerFile = join(dir, 'venice-usage.json')
  let spentUsd = 0
  if (existsSync(ledgerFile)) {
    const ledger = JSON.parse(readFileSync(ledgerFile, 'utf8'))
    if (typeof ledger.spentUsd !== 'number' || !Number.isFinite(ledger.spentUsd) || ledger.spentUsd < 0) throw new Error('Invalid Venice usage ledger')
    spentUsd = ledger.spentUsd
  }
  const persistUsage = () => {
    writeFileSync(`${ledgerFile}.tmp`, JSON.stringify({ spentUsd, updatedAt: Date.now(), accounting: 'usage-or-conservative-reservation' }))
    renameSync(`${ledgerFile}.tmp`, ledgerFile)
  }
  const metrics = (data: Record<string, unknown>) => {
    appendFileSync(join(dir, 'performance.jsonl'), `${JSON.stringify({ ts: Date.now(), ...data })}\n`)
  }
  async function json(url: string, body?: unknown): Promise<any> {
    const r = await fetchFn(url, { ...(body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000) })
    if (!r.ok) throw new Error(`Backend request failed (${r.status})`)
    const text = await r.text()
    return text.trim() ? JSON.parse(text) : {}
  }
  async function idleComfy(signal?: AbortSignal): Promise<void> {
    // This also sees jobs submitted directly in ComfyUI's browser.
    for (;;) {
      if (signal?.aborted) throw new Error('Request cancelled')
      const q = await json(`${comfy}/queue`)
      if (!(q.queue_running?.length || q.queue_pending?.length)) return
      await delay(500)
    }
  }
  async function prepareGpu(kind: 'ollama' | 'comfy', signal?: AbortSignal): Promise<void> {
    if (await options.externalGpuBusy?.()) {
      const error = new Error('Local model training is using the GPU. Wait for training to finish before local chat or image generation.')
      error.name = 'GpuTrainingBusy'; throw error
    }
    if (kind === 'ollama') {
      try { await idleComfy(signal) } catch (e) {
        // A stopped image server owns no models; local chat must still work offline.
        if ((e as any)?.cause?.code === 'ECONNREFUSED') return
        throw e
      }
      await json(`${comfy}/free`, { unload_models: true, free_memory: true })
      await delay(250)
    } else {
      let loaded: any
      try { loaded = await json(`${ollama}/api/ps`) } catch (e) {
        if ((e as any)?.cause?.code === 'ECONNREFUSED') return
        throw e
      }
      for (const model of loaded.models ?? []) await json(`${ollama}/api/generate`, { model: model.name, keep_alive: 0, stream: false })
    }
  }
  const status = () => ({ service: 'terrarium-inference', gpu: { busy: gpu.busy, waiting: gpu.waiting },
    providers: Object.fromEntries(Object.entries(providers).map(([key, q]) => [key, { busy: q.busy, waiting: q.waiting }])),
    venice: { spentUsd, budgetUsd: options.budgetUsd ?? performanceSettings().veniceBudgetUsd } })
  const server = createServer(async (req, res) => {
    const started = Date.now()
    const controller = new AbortController()
    res.on('close', () => { if (!res.writableEnded) controller.abort() })
    let route = ''
    try {
      // Loopback only, no browser origins, no arbitrary upstream URLs/forwarded credentials.
      if (req.headers.origin || !/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host ?? '')) throw new Error('Untrusted request origin')
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (url.pathname === '/health' && req.method === 'GET') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(status())); return }
      const match = url.pathname.match(/^\/(chat\/)?(ollama|comfy|venice|arliai)(\/.*)$/)
      if (!match) { res.writeHead(404); res.end(); return }
      const chat = !!match[1], kind = match[2] as 'ollama' | 'comfy' | 'venice' | 'arliai', path = match[3]!
      route = kind + path
      const local = kind === 'ollama' || kind === 'comfy'
      const allowed = kind === 'ollama' ? /^\/api\/(chat|generate|ps|tags|show|version|embed|embeddings)$/
        : kind === 'comfy' ? /^\/(prompt|history(?:\/[a-zA-Z0-9-]+)?|queue|system_stats|view|upload\/image|object_info(?:\/[^/]+)?)$/
        : /^\/v1\/(chat\/completions|models)$/
      if (!allowed.test(path) || !['GET', 'POST'].includes(req.method ?? '')) { res.writeHead(404); res.end(); return }
      let buffer = await readBody(req)
      let body: Record<string, any> | null = null
      if (buffer.length && String(req.headers['content-type']).includes('application/json')) body = JSON.parse(buffer.toString())
      const inference = kind === 'comfy' ? path === '/prompt' && req.method === 'POST'
        : req.method === 'POST' && /\/(chat|generate|embeddings|embed|completions)$/.test(path)
      if (body && chat && Array.isArray(body.messages) && !body.tools?.length && !body.messages.some((m: Message) => m.role === 'tool' || m.tool_calls)
        && (options.compact ?? performanceSettings().compactPrompt)) {
        const compact = compactMessages(body.messages, options.workspace ?? join(homedir(), '.openclaw', 'workspace'))
        body.messages = compact.messages
        metrics({ stage: 'context', model: body.model, beforeChars: compact.beforeChars, afterChars: compact.afterChars, character: compact.character })
      }
      if (body && kind === 'ollama' && inference) {
        body.options ??= {}
        if (chat) { body.options.num_ctx = performanceSettings().localContext; body.options.num_predict ??= 768 }
        if (/qwen3/.test(body.model ?? '')) body.think = false
      }
      if (body && kind === 'venice' && inference) body = veniceRequest(body)
      if (body && !local && inference) {
        // OpenClaw may use the newer OpenAI spelling; these providers accept max_tokens.
        body.max_tokens = Math.min(Number(body.max_tokens ?? body.max_completion_tokens ?? 1024), 2048)
        delete body.max_completion_tokens
      }
      if (body) buffer = Buffer.from(JSON.stringify(body))
      const target = kind === 'ollama' ? ollama + path : kind === 'comfy' ? comfy + path
        : (kind === 'venice' ? options.veniceUrl ?? VENICE_BASE_URL : options.arliaiUrl ?? 'https://api.arliai.com/v1') + path.replace(/^\/v1/, '')
      const headers: Record<string, string> = {}
      if (req.headers['content-type']) headers['content-type'] = String(req.headers['content-type'])
      if (!local) {
        const credential = options.credentials?.[kind] ?? (typeof req.headers.authorization === 'string' ? req.headers.authorization.replace(/^Bearer /, '') : undefined)
        if (!credential) throw new Error('Provider credential is unavailable')
        headers.authorization = `Bearer ${credential}`
      }
      const work = async () => {
        if (controller.signal.aborted) throw new Error('Request cancelled')
        const queueMs = Date.now() - started
        let reservation = 0
        if (inference && kind === 'venice') {
          const model = VENICE_MODELS.find(m => m.id === body?.model)
          if (!model) throw new Error('Venice model has no verified budget pricing; refresh catalog before use')
          const output = Math.min(Number(body?.max_tokens ?? 1024), 2048)
          if (!Number.isFinite(output) || output < 1) throw new Error('Invalid output budget')
          body!.max_tokens = output
          delete body!.max_completion_tokens
          body!.n = 1
          buffer = Buffer.from(JSON.stringify(body))
          reservation = (buffer.length * model.cost.input + output * model.cost.output) / 1e6
          if (spentUsd + reservation > (options.budgetUsd ?? performanceSettings().veniceBudgetUsd)) {
            res.writeHead(429, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'Terrarium Venice budget reached; use the configured fallback.', type: 'budget_exhausted' } })); return
          }
          spentUsd += reservation; persistUsage()
        }
        if (local && inference) await prepareGpu(kind, controller.signal)
        const upstreamStart = Date.now()
        const response = await fetchFn(target + url.search, {
          method: req.method, headers, ...(buffer.length ? { body: buffer } : {}),
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(local ? 600000 : 120000)]),
        })
        res.writeHead(response.status, { 'content-type': response.headers.get('content-type') ?? 'application/json', 'cache-control': 'no-store' })
        let tail = '', firstByteMs: number | null = null
        const reader = response.body?.getReader()
        if (reader) for (;;) {
          const chunk = await reader.read()
          if (chunk.done) break
          firstByteMs ??= Date.now() - started
          tail = (tail + Buffer.from(chunk.value).toString('utf8')).slice(-65536)
          if (!res.write(chunk.value)) await once(res, 'drain', { signal: controller.signal })
        }
        res.end()
        let summary: any = null
        try { summary = JSON.parse(tail) } catch {
          for (const line of tail.split('\n')) {
            try { const value = JSON.parse(line.replace(/^data: /, '')); if (value.usage || value.done) summary = value } catch { /* SSE frame */ }
          }
        }
        if (reservation && summary?.usage) {
          const model = VENICE_MODELS.find(m => m.id === body?.model)!
          const usage = summary.usage
          const actual = (usage.prompt_tokens * model.cost.input + usage.completion_tokens * model.cost.output) / 1e6
          if (Number.isFinite(actual) && actual >= 0) { spentUsd = Math.max(0, spentUsd - reservation + actual); persistUsage() }
        }
        if (inference || !response.ok) metrics({ stage: 'request', route, model: body?.model, status: response.status, queueMs, firstByteMs,
          outputLimit: body?.max_tokens ?? body?.options?.num_predict, requestFields: body ? Object.keys(body) : undefined,
          upstreamMs: Date.now() - upstreamStart, totalMs: Date.now() - started,
          usage: summary?.usage, loadMs: summary?.load_duration / 1e6 || undefined,
          promptTokens: summary?.prompt_eval_count, outputTokens: summary?.eval_count,
          tokensPerSecond: summary?.eval_duration > 0 ? summary.eval_count / (summary.eval_duration / 1e9) : undefined })
        // POST /prompt accepts asynchronously: retain GPU lease until its queue is idle.
        if (kind === 'comfy' && inference && response.ok) {
          await idleComfy()
          metrics({ stage: 'render-complete', promptId: summary?.prompt_id, totalMs: Date.now() - started })
        }
      }
      if (inference) {
        const queue = local ? gpu : providers[kind]
        await queue.run(work, controller.signal, req.headers['x-terrarium-priority'] === 'background' ? 10 : 0)
      } else await work()
    } catch (error) {
      // Never log upstream response bodies, prompts, or authorization values.
      metrics({ stage: 'error', route, totalMs: Date.now() - started, error: error instanceof Error ? error.name : 'Error',
        causeCode: (error as any)?.cause?.code })
      if (!res.headersSent) { res.writeHead(503, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { message: error instanceof Error && error.name === 'GpuTrainingBusy' ? error.message : 'Inference coordinator could not complete the request. Check service status and budget.' } })) }
      else if (!res.writableEnded) res.destroy()
    }
  })
  return { server, status, listen: () => new Promise<void>((resolve, reject) => {
    server.once('error', reject); server.listen(options.port ?? INFERENCE_PORT, '127.0.0.1', () => { server.removeListener('error', reject); resolve() })
  }), close: () => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()) }) }
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []; let size = 0
  for await (const chunk of req) { size += chunk.length; if (size > 16 * 1024 * 1024) throw new Error('Request too large'); chunks.push(Buffer.from(chunk)) }
  return Buffer.concat(chunks)
}
