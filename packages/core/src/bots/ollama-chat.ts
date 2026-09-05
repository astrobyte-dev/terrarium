// Thin one-shot chat call to the LOCAL Ollama server, used by the Bot Builder's
// AI-assist. Local (not ArliAI) on purpose: the gateway owns ArliAI's single
// parallel slot, and the drafting model is uncensored so adult companion personas
// aren't refused. fetch is injectable for tests.

import { helperContext, localEndpoint } from '../inference/settings'

export interface OllamaChatOptions {
  baseUrl?: string
  model?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
  temperature?: number
  /** Ollama constrains generation to valid JSON when set — far more reliable than repair. */
  format?: 'json'
  maxTokens?: number
  keepAlive?: string | number
}

// The daemon's uncensored drafting model — present on this machine, won't deflect
// adult personas into tame ones. Callers can override.
export const DEFAULT_DRAFT_MODEL = 'mannix/llama3.1-8b-abliterated:latest'
const DEFAULT_URL = 'http://127.0.0.1:11434'

export function createOllamaChat(options: OllamaChatOptions = {}): (prompt: string) => Promise<string> {
  const baseUrl = options.baseUrl ?? localEndpoint('ollama')
  const model = options.model ?? DEFAULT_DRAFT_MODEL
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? 120_000
  const temperature = options.temperature ?? 0.9
  const maxTokens = options.maxTokens ?? 768

  return async (prompt: string): Promise<string> => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetchImpl(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          messages: [{ role: 'user', content: prompt }],
          options: { temperature, num_ctx: helperContext(prompt, maxTokens), num_predict: maxTokens },
          keep_alive: options.keepAlive ?? '20s',
          ...(/qwen3/.test(model) ? { think: false } : {}),
          ...(options.format ? { format: options.format } : {}),
        }),
        signal: controller.signal,
      })
      if (!res.ok) throw new Error(`local model request failed (${res.status}) — is Ollama running with ${model}?`)
      const data = (await res.json()) as { message?: { content?: string } }
      // Some models wrap reasoning in <think>…</think>; keep only the answer.
      const text = (data.message?.content ?? '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
      if (text === '') throw new Error('the local model returned an empty reply')
      return text
    } finally {
      clearTimeout(timer)
    }
  }
}
