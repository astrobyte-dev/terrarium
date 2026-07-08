import { describe, expect, it } from 'vitest'
import { buildOpenclawConfig, type TemplateSecrets } from './template'
import { extractUserTuning } from './user-tuning'

const SECRETS: TemplateSecrets = {
  telegramBotToken: 'TG-TOKEN-XYZ',
  arliaiApiKey: 'ARLI-KEY-XYZ',
  ollamaApiKey: 'OLLAMA-KEY-XYZ',
  gatewayAuthToken: 'GW-TOKEN-XYZ',
  anthropicApiKey: null,
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const at = (o: unknown, path: string): any =>
  path.split('.').reduce<any>((v, k) => (v as Record<string, unknown>)?.[k], o)

function allStrings(o: unknown, acc: string[] = []): string[] {
  if (typeof o === 'string') acc.push(o)
  else if (Array.isArray(o)) for (const v of o) allStrings(v, acc)
  else if (o !== null && typeof o === 'object') for (const v of Object.values(o)) allStrings(v, acc)
  return acc
}

/** The 2026-07-09 nuke victim, in miniature: a template build plus every hand-tune. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tunedLive(): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const live = buildOpenclawConfig('inline', SECRETS) as any
  live.agents.defaults.model = { primary: 'arliai/Gemma-4-31B-it', fallbacks: ['ollama/dolphin3:8b'] }
  live.agents.defaults.models = {
    'arliai/GLM-4.7': { params: { chat_template_kwargs: { enable_thinking: false } } },
  }
  live.models.providers.arliai.models = [
    ...live.models.providers.arliai.models,
    { id: 'GLM-4.7', name: 'GLM 4.7', contextWindow: 32768, maxTokens: 1024 },
    { id: 'Gemma-4-31B-it', name: 'Gemma-4 31B Instruct', contextWindow: 32768, maxTokens: 1024 },
  ]
  const dolphin = live.models.providers.ollama.models.find((m: { id: string }) => m.id === 'dolphin3:8b')
  dolphin.contextWindow = 40960
  dolphin.params = { num_ctx: 40960 }
  live.models.providers.ollama.params = { num_ctx: 40960 }
  return live
}

describe('extractUserTuning', () => {
  it('extracts the four user-owned slots from a hand-tuned live config', () => {
    const tuning = extractUserTuning(tunedLive())
    expect(tuning.model).toEqual({ primary: 'arliai/Gemma-4-31B-it', fallbacks: ['ollama/dolphin3:8b'] })
    expect(at(tuning.modelOverrides!['arliai/GLM-4.7'], 'params.chat_template_kwargs.enable_thinking')).toBe(false)
    expect(tuning.providerModels!.arliai!.map((m) => at(m, 'id'))).toContain('Gemma-4-31B-it')
    expect(at(tuning.providerModels!.ollama!.find((m) => at(m, 'id') === 'dolphin3:8b'), 'params.num_ctx')).toBe(40960)
    expect(tuning.providerParams).toEqual({ arliai: undefined, ollama: { num_ctx: 40960 } })
  })

  it('is tolerant of blank or malformed live configs', () => {
    expect(extractUserTuning({})).toEqual({})
    expect(extractUserTuning(null)).toEqual({})
    expect(extractUserTuning({ agents: { defaults: {} }, models: { providers: 'garbage' } })).toEqual({})
    // primary must be a string to count as a model selection
    expect(extractUserTuning({ agents: { defaults: { model: { primary: 42 } } } }).model).toBeUndefined()
  })

  it('omits slots the live config does not have', () => {
    const tuning = extractUserTuning({ agents: { defaults: { model: { primary: 'a/b' } } } })
    expect(tuning.model).toEqual({ primary: 'a/b', fallbacks: undefined })
    expect(tuning.modelOverrides).toBeUndefined()
    expect(tuning.providerModels).toBeUndefined()
    expect(tuning.providerParams).toBeUndefined()
  })

  it('never carries an apiKey, even one smuggled into params', () => {
    const live = tunedLive()
    live.models.providers.arliai.params = { apiKey: 'SNEAKY-KEY', temperature: 1 }
    const tuning = extractUserTuning(live)
    const carried = JSON.stringify(tuning)
    expect(carried).not.toContain('SNEAKY-KEY')
    expect(carried).not.toContain(SECRETS.arliaiApiKey) // provider.apiKey structurally not extracted
    expect(tuning.providerParams!.arliai).toEqual({ temperature: 1 })
  })
})

describe('buildOpenclawConfig with user tuning', () => {
  const tuning = extractUserTuning(tunedLive())

  it('live tuning beats the brain-store selection and the template default', () => {
    const cfg = buildOpenclawConfig('inline', SECRETS, {
      primaryModel: 'arliai/Mistral-Medium-3.5-128B', // stale brain-store — it has lied before
      fallbacks: ['ollama/llama3:latest'],
      tuning,
    })
    expect(at(cfg, 'agents.defaults.model.primary')).toBe('arliai/Gemma-4-31B-it')
    expect(at(cfg, 'agents.defaults.model.fallbacks')).toEqual(['ollama/dolphin3:8b'])
  })

  it('brain-store selection still applies when the tuning has no model', () => {
    const cfg = buildOpenclawConfig('inline', SECRETS, {
      primaryModel: 'ollama/dolphin3:8b',
      fallbacks: [],
      tuning: { ...tuning, model: undefined },
    })
    expect(at(cfg, 'agents.defaults.model.primary')).toBe('ollama/dolphin3:8b')
  })

  it('carries hand-added provider models, param bumps, and per-model overrides', () => {
    const cfg = buildOpenclawConfig('inline', SECRETS, { tuning })
    expect(at(cfg, 'models.providers.arliai.models').map((m: { id: string }) => m.id)).toContain('GLM-4.7')
    const dolphin = at(cfg, 'models.providers.ollama.models').find((m: { id: string }) => m.id === 'dolphin3:8b')
    expect(dolphin.params.num_ctx).toBe(40960)
    expect(at(cfg, 'models.providers.ollama.params')).toEqual({ num_ctx: 40960 })
    expect(at(at(cfg, 'agents.defaults.models')['arliai/GLM-4.7'], 'params.chat_template_kwargs.enable_thinking')).toBe(false)
  })

  it('regenerates apiKeys per mode — tuning from an inline live file cannot leak into env-refs', () => {
    const cfg = buildOpenclawConfig('env-refs', null, { tuning })
    expect(at(cfg, 'models.providers.arliai.apiKey')).toEqual({ source: 'env', provider: 'default', id: 'ARLIAI_API_KEY' })
    const strings = allStrings(cfg).join('\n')
    for (const v of Object.values(SECRETS)) if (v !== null) expect(strings).not.toContain(v)
  })

  it('ignores tuning for providers the template does not emit', () => {
    const cfg = buildOpenclawConfig('inline', SECRETS, {
      tuning: { providerModels: { rogue: [{ id: 'x' }] }, providerParams: { rogue: { a: 1 } } },
    })
    expect(at(cfg, 'models.providers.rogue')).toBeUndefined()
  })

  it('template structure stays authoritative — compaction and channel blocks untouched by tuning', () => {
    const cfg = buildOpenclawConfig('inline', SECRETS, { tuning })
    expect(at(cfg, 'agents.defaults.compaction.keepRecentTokens')).toBe(2048)
    expect(at(cfg, 'channels.telegram.botToken')).toBe(SECRETS.telegramBotToken)
  })
})
