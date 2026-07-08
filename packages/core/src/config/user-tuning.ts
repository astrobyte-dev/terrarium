/**
 * The user's hand-tuning of openclaw.json — the model domain is USER-OWNED.
 *
 * applyConfig regenerates the file from the template; before this module that
 * wiped every hand-edit (the 2026-07-09 Migrate nuke). extractUserTuning pulls
 * the user-owned slots out of the live file so buildOpenclawConfig can lay
 * them back over the fresh build. The template stays the authority on
 * structure and secret placement: apiKey fields are NEVER carried, so a
 * carried block can't smuggle a plaintext key into env-refs mode.
 */

export interface UserModelSelection {
  primary: string
  fallbacks?: string[]
}

export interface UserTuning {
  /** agents.defaults.model — the running primary + fallbacks. */
  model?: UserModelSelection
  /** agents.defaults.models — per-model param overrides (e.g. GLM enable_thinking). */
  modelOverrides?: Record<string, unknown>
  /** models.providers.<p>.models — the hand-added model lists. */
  providerModels?: Record<string, unknown[]>
  /** models.providers.<p>.params — e.g. ollama num_ctx bumps. */
  providerParams?: Record<string, Record<string, unknown>>
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

/** Pull the user-owned slots from a live config. Tolerant: anything missing or malformed is omitted. */
export function extractUserTuning(live: unknown): UserTuning {
  if (!isRecord(live)) return {}
  const tuning: UserTuning = {}

  const defaults = isRecord(live.agents) ? live.agents.defaults : undefined
  if (isRecord(defaults)) {
    const model = defaults.model
    if (isRecord(model) && typeof model.primary === 'string') {
      const fallbacks = Array.isArray(model.fallbacks)
        ? model.fallbacks.filter((f): f is string => typeof f === 'string')
        : undefined
      tuning.model = { primary: model.primary, fallbacks }
    }
    if (isRecord(defaults.models)) tuning.modelOverrides = defaults.models
  }

  const providers = isRecord(live.models) ? live.models.providers : undefined
  if (isRecord(providers)) {
    for (const [name, block] of Object.entries(providers)) {
      if (!isRecord(block)) continue
      if (Array.isArray(block.models)) {
        tuning.providerModels ??= {}
        tuning.providerModels[name] = block.models
      }
      if (isRecord(block.params)) {
        // Belt-and-braces: params is free-form user data — never let a key ride in it.
        const { apiKey: _dropped, ...params } = block.params
        tuning.providerParams ??= {}
        tuning.providerParams[name] = params
      }
    }
  }
  return tuning
}

/**
 * Lay the tuning over a freshly built config. Only providers the template
 * emitted are touched (an unknown provider has no regenerable apiKey), and
 * apiKey fields are structurally out of reach — only models/params are set.
 */
export function applyUserTuning(
  config: Record<string, unknown>,
  tuning: UserTuning | undefined,
): Record<string, unknown> {
  if (tuning === undefined) return config

  const defaults = (config.agents as Record<string, unknown>).defaults as Record<string, unknown>
  if (tuning.model !== undefined) {
    const built = defaults.model as Record<string, unknown>
    defaults.model = { primary: tuning.model.primary, fallbacks: tuning.model.fallbacks ?? built.fallbacks }
  }
  if (tuning.modelOverrides !== undefined) defaults.models = tuning.modelOverrides

  const providers = (config.models as Record<string, unknown>).providers as Record<string, unknown>
  for (const [name, models] of Object.entries(tuning.providerModels ?? {})) {
    const block = providers[name]
    if (isRecord(block)) block.models = models
  }
  for (const [name, params] of Object.entries(tuning.providerParams ?? {})) {
    const block = providers[name]
    if (isRecord(block)) block.params = params
  }
  return config
}
