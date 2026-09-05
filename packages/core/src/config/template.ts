import { ARLIAI_MODELS, DISABLED_PLUGINS, DISABLED_SKILLS, OLLAMA_MODELS } from './provider-models'
import { applyUserTuning, type UserTuning } from './user-tuning'
import { VENICE_BASE_URL, VENICE_MODELS } from '../inference/venice'
import { INFERENCE_URL } from '../inference/settings'

export type SecretsMode = 'env-refs' | 'inline'

export interface TemplateSecrets {
  telegramBotToken: string
  arliaiApiKey: string
  ollamaApiKey: string
  gatewayAuthToken: string
  /** null when the Claude door hasn't been opened — the provider is omitted. */
  anthropicApiKey: string | null
  veniceApiKey?: string | null
}

export interface TemplateCarryover {
  meta?: unknown
  wizard?: unknown
  /** Brain selection: overrides the default primary model + fallbacks. */
  primaryModel?: string
  fallbacks?: string[]
  /** The Claude door: emit the built-in anthropic provider (key captured). */
  anthropicEnabled?: boolean
  veniceEnabled?: boolean
  coordinated?: boolean
  /**
   * Hand-tuning lifted from the live config (extractUserTuning). Laid over the
   * fresh build last; the model domain is user-owned, so it beats the
   * brain-store primaryModel/fallbacks above. apiKeys are never carried.
   */
  tuning?: UserTuning
}

const envRef = (id: string) => ({ source: 'env', provider: 'default', id })

/**
 * The app-owned openclaw.json (design decision 5: generate, don't hand-edit).
 * Structure and values transcribed from the proven live config.
 *
 * - 'env-refs': no secret appears in the file. Provider keys are SecretRefs
 *   resolved from env vars; the Telegram token rides TELEGRAM_BOT_TOKEN.
 *   Only valid while Terrarium spawns the gateway (it injects that env).
 * - 'inline': secrets embedded — for scheduled-task ownership (task launchers
 *   set no env). Written on release().
 */
export function buildOpenclawConfig(
  mode: SecretsMode,
  secrets: TemplateSecrets | null,
  carry: TemplateCarryover = {},
): Record<string, unknown> {
  if (mode === 'inline' && secrets === null) {
    throw new Error('inline mode requires secrets (run secret capture first)')
  }
  const inline = mode === 'inline' ? secrets : null

  const providers: Record<string, unknown> = {
    arliai: {
      baseUrl: 'https://api.arliai.com/v1',
      api: 'openai-completions',
      apiKey: inline === null ? envRef('ARLIAI_API_KEY') : inline.arliaiApiKey,
      models: ARLIAI_MODELS,
      timeoutSeconds: 120, // aborts stalled SSE streams (16-h silent-hang fix)
    },
    ollama: {
      baseUrl: 'http://127.0.0.1:11434',
      api: 'ollama',
      apiKey: inline === null ? envRef('OLLAMA_API_KEY') : inline.ollamaApiKey,
      params: { num_ctx: 16384 },
      models: OLLAMA_MODELS,
    },
  }
  // The Claude door. Anthropic is an OpenClaw built-in (auth = ANTHROPIC_API_KEY,
  // refs anthropic/claude-*) — only the key needs wiring, no endpoint/models.
  if (carry.anthropicEnabled === true) {
    if (inline !== null && inline.anthropicApiKey === null) {
      throw new Error('anthropic enabled but no anthropic-api-key in the store — capture it first')
    }
    providers.anthropic = {
      apiKey: inline === null ? envRef('ANTHROPIC_API_KEY') : inline.anthropicApiKey,
    }
  }

  if (carry.veniceEnabled) {
    if (inline && !inline.veniceApiKey && !carry.coordinated) throw new Error('Venice enabled without its stored API key')
    providers.venice = { baseUrl: VENICE_BASE_URL, api: 'openai-completions',
      apiKey: inline ? inline.veniceApiKey : envRef('VENICE_API_KEY'), models: VENICE_MODELS, timeoutSeconds: 120 }
  }
  const result = applyUserTuning({
    meta: carry.meta ?? { lastTouchedVersion: '2026.6.11', lastTouchedAt: '2026-07-05T14:00:14.997Z' },
    commands: {
      native: 'auto',
      nativeSkills: 'auto',
      restart: true,
      ownerDisplay: 'raw',
      ownerAllowFrom: ['telegram:6713827051'],
    },
    agents: {
      defaults: {
        model: {
          primary: carry.primaryModel ?? 'arliai/Mistral-Medium-3.5-128B',
          fallbacks: carry.fallbacks ?? ['ollama/dolphin3:8b'],
        },
        // keepRecentTokens 2048 is THE anti-wedge lever (compaction postmortem)
        compaction: { keepRecentTokens: 2048, reserveTokensFloor: 6000, memoryFlush: { enabled: false } },
      },
    },
    models: { providers },
    tools: {
      media: {
        image: {
          enabled: true,
          maxChars: 500,
          maxBytes: 10485760,
          timeoutSeconds: 300,
          models: [{ provider: 'ollama', model: 'qwen2.5vl:3b', timeoutSeconds: 300 }],
        },
      },
    },
    auth: { profiles: { 'ollama:manual': { provider: 'ollama', mode: 'token' } } },
    plugins: {
      entries: Object.fromEntries(DISABLED_PLUGINS.map((id) => [id, { enabled: false }])),
    },
    channels: {
      telegram:
        inline === null ? { enabled: true } : { enabled: true, botToken: inline.telegramBotToken },
    },
    gateway: {
      auth: inline === null ? { mode: 'none' } : { mode: 'none', token: inline.gatewayAuthToken },
      mode: 'local',
    },
    skills: {
      entries: Object.fromEntries(DISABLED_SKILLS.map((id) => [id, { enabled: false }])),
    },
    wizard: carry.wizard ?? {
      lastRunAt: '2026-07-05T14:00:14.677Z',
      lastRunVersion: '2026.6.11',
      lastRunCommand: 'doctor',
      lastRunMode: 'local',
    },
  }, carry.tuning)
  if (carry.coordinated) {
    const configured = (result.models as { providers: Record<string, Record<string, unknown>> }).providers
    for (const name of ['ollama', 'arliai', 'venice']) {
      if (!configured[name]) continue
      configured[name].baseUrl = `${INFERENCE_URL}/chat/${name}${name === 'ollama' ? '' : '/v1'}`
      // Coordinator reads DPAPI itself, so no hosted credential needs to be in this config.
      if (name !== 'ollama') configured[name].apiKey = 'terrarium-coordinator'
    }
  }
  return result
}
