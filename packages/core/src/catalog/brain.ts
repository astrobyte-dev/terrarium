import type { CatalogEntry } from './models'

const LOCAL_FALLBACK = 'ollama/dolphin3:8b'

// Providers the generated config always wires up. Anthropic joins the set
// once its API key is captured (the Claude door, M5d).
const ALWAYS_CONFIGURED = new Set(['ollama', 'arliai'])

export interface BrainChoice {
  ok: boolean
  primaryModel: string | null
  fallbacks: string[]
  reason: string
}

export interface BrainGateOptions {
  /** true once the anthropic API key is in the secret store. */
  anthropicConfigured?: boolean
  veniceConfigured?: boolean
}

export function resolveBrainChoice(entry: CatalogEntry, opts: BrainGateOptions = {}): BrainChoice {
  const no = (reason: string): BrainChoice => ({ ok: false, primaryModel: null, fallbacks: [], reason })

  if (entry.reasoning && !entry.nonThinkingVerified) return no('reasoning model — non-thinking compatibility has not been verified')
  if (entry.configRef === null) return no('guidance-only size placeholder, not an installable model')
  const configured = entry.provider === 'anthropic' ? opts.anthropicConfigured === true
    : entry.provider === 'venice' ? opts.veniceConfigured === true : ALWAYS_CONFIGURED.has(entry.provider)
  if (!configured) {
    return no(`${entry.provider} is not configured yet — add its API key first`)
  }
  return { ok: true, primaryModel: entry.configRef, fallbacks: resolveFallbacks(entry.configRef), reason: '' }
}

/** Local safety net so a provider outage degrades instead of dying — never self-referential. */
export function resolveFallbacks(primaryModel: string): string[] {
  return primaryModel === LOCAL_FALLBACK ? [] : [LOCAL_FALLBACK]
}
