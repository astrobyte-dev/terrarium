import { describe, expect, it } from 'vitest'
import { buildOpenclawConfig, type TemplateSecrets } from './template'

const SECRETS: TemplateSecrets = {
  telegramBotToken: 'TG-TOKEN-XYZ',
  arliaiApiKey: 'ARLI-KEY-XYZ',
  ollamaApiKey: 'OLLAMA-KEY-XYZ',
  gatewayAuthToken: 'GW-TOKEN-XYZ',
  anthropicApiKey: 'ANTH-KEY-XYZ',
}

function allStrings(o: unknown, acc: string[] = []): string[] {
  if (typeof o === 'string') acc.push(o)
  else if (Array.isArray(o)) for (const v of o) allStrings(v, acc)
  else if (o !== null && typeof o === 'object') for (const v of Object.values(o)) allStrings(v, acc)
  return acc
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const at = (o: unknown, path: string): any =>
  path.split('.').reduce<any>((v, k) => (v as Record<string, unknown>)?.[k], o)

describe('buildOpenclawConfig', () => {
  it('env-refs mode contains no secret values anywhere', () => {
    const cfg = buildOpenclawConfig('env-refs', SECRETS)
    const strings = allStrings(cfg).join('\n')
    for (const v of Object.values(SECRETS)) expect(strings).not.toContain(v)
  })

  it('env-refs mode uses SecretRefs and env-var sources', () => {
    const cfg = buildOpenclawConfig('env-refs', null)
    expect(at(cfg, 'models.providers.arliai.apiKey')).toEqual({
      source: 'env',
      provider: 'default',
      id: 'ARLIAI_API_KEY',
    })
    // Telegram reads TELEGRAM_BOT_TOKEN from the gateway process env.
    expect(at(cfg, 'channels.telegram')).toEqual({ enabled: true })
    expect(at(cfg, 'gateway.auth')).toEqual({ mode: 'none' })
  })

  it('inline mode embeds the secrets at the exact live paths', () => {
    const cfg = buildOpenclawConfig('inline', SECRETS)
    expect(at(cfg, 'channels.telegram.botToken')).toBe('TG-TOKEN-XYZ')
    expect(at(cfg, 'models.providers.arliai.apiKey')).toBe('ARLI-KEY-XYZ')
    expect(at(cfg, 'models.providers.ollama.apiKey')).toBe('OLLAMA-KEY-XYZ')
    expect(at(cfg, 'gateway.auth.token')).toBe('GW-TOKEN-XYZ')
  })

  it('inline mode without secrets refuses', () => {
    expect(() => buildOpenclawConfig('inline', null)).toThrow(/secrets/i)
  })

  it('carries the hard-won operational values in both modes', () => {
    for (const mode of ['env-refs', 'inline'] as const) {
      const cfg = buildOpenclawConfig(mode, SECRETS)
      expect(at(cfg, 'agents.defaults.compaction.keepRecentTokens')).toBe(2048)
      expect(at(cfg, 'agents.defaults.model.primary')).toBe('arliai/Mistral-Medium-3.5-128B')
      expect(at(cfg, 'agents.defaults.model.fallbacks')).toEqual(['ollama/dolphin3:8b'])
      expect(at(cfg, 'models.providers.arliai.timeoutSeconds')).toBe(120)
      expect(at(cfg, 'tools.media.image.models')).toEqual([
        { provider: 'ollama', model: 'qwen2.5vl:3b', timeoutSeconds: 300 },
      ])
      expect(at(cfg, 'plugins.entries.talk-voice.enabled')).toBe(false)
      expect(at(cfg, 'commands.ownerAllowFrom')).toEqual(['telegram:6713827051'])
    }
  })

  it('omits the anthropic provider (and never leaks its key) unless enabled', () => {
    for (const mode of ['env-refs', 'inline'] as const) {
      const cfg = buildOpenclawConfig(mode, SECRETS)
      expect(at(cfg, 'models.providers.anthropic')).toBeUndefined()
      expect(allStrings(cfg).join('\n')).not.toContain('ANTH-KEY-XYZ')
    }
  })

  it('the Claude door: anthropicEnabled adds the provider as a SecretRef in env-refs mode', () => {
    const cfg = buildOpenclawConfig('env-refs', null, { anthropicEnabled: true })
    expect(at(cfg, 'models.providers.anthropic.apiKey')).toEqual({
      source: 'env',
      provider: 'default',
      id: 'ANTHROPIC_API_KEY',
    })
  })

  it('the Claude door: anthropicEnabled embeds the key inline for task ownership', () => {
    const cfg = buildOpenclawConfig('inline', SECRETS, { anthropicEnabled: true })
    expect(at(cfg, 'models.providers.anthropic.apiKey')).toBe('ANTH-KEY-XYZ')
  })

  it('refuses anthropicEnabled inline when no key was captured', () => {
    expect(() =>
      buildOpenclawConfig('inline', { ...SECRETS, anthropicApiKey: null }, { anthropicEnabled: true }),
    ).toThrow(/anthropic/i)
  })

  it('preserves live meta/wizard blocks when provided', () => {
    const cfg = buildOpenclawConfig('inline', SECRETS, {
      meta: { lastTouchedVersion: 'x' },
      wizard: { lastRunMode: 'y' },
    })
    expect(at(cfg, 'meta.lastTouchedVersion')).toBe('x')
    expect(at(cfg, 'wizard.lastRunMode')).toBe('y')
  })
})
