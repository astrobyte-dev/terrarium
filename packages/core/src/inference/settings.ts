import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const INFERENCE_PORT = 18790
export const INFERENCE_URL = `http://127.0.0.1:${INFERENCE_PORT}`
export const performanceDir = () => join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'Terrarium')
export interface PerformanceSettings {
  enabled: boolean
  compactPrompt: boolean
  localContext: number
  veniceBudgetUsd: number
}
export function performanceSettings(): PerformanceSettings {
  const defaults = { enabled: false, compactPrompt: false, localContext: 16384, veniceBudgetUsd: 1 }
  try {
    const raw = JSON.parse(readFileSync(join(performanceDir(), 'performance.json'), 'utf8'))
    return { enabled: raw.enabled === true, compactPrompt: raw.compactPrompt === true,
      localContext: [8192, 16384, 24576].includes(raw.localContext) ? raw.localContext : defaults.localContext,
      veniceBudgetUsd: typeof raw.veniceBudgetUsd === 'number' && raw.veniceBudgetUsd >= 0 && raw.veniceBudgetUsd <= 100 ? raw.veniceBudgetUsd : 1 }
  } catch { return defaults }
}
export const localEndpoint = (kind: 'ollama' | 'comfy') => performanceSettings().enabled
  ? `${INFERENCE_URL}/${kind}` : kind === 'ollama' ? 'http://127.0.0.1:11434' : 'http://127.0.0.1:8188'

/** Conservative UTF-8 byte bound, including output and chat-template headroom. */
export function helperContext(prompt: string, outputTokens = 512): number {
  const required = Buffer.byteLength(prompt, 'utf8') + outputTokens + 256
  const context = [4096, 8192, 16384, 24576].find(n => n >= required)
  if (!context) throw new Error('Helper input exceeds its context budget; shorten the request before retrying.')
  return context
}
