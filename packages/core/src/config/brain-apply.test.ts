import { describe, expect, it } from 'vitest'
import { makeFakeSystem } from '../test/fake-system'
import { applyConfig } from './apply'
import { buildOpenclawConfig, type TemplateSecrets } from './template'
import { writeBrainSelection } from '../catalog/brain-store'
import type { SecretStore } from '../secrets/store'

const SECRETS: TemplateSecrets = {
  telegramBotToken: 'TG', arliaiApiKey: 'AR', ollamaApiKey: 'OL', gatewayAuthToken: 'GW',
  anthropicApiKey: null,
}
const STORE: SecretStore = {
  get: async (n) => ({ 'telegram-bot-token': 'TG', 'arliai-api-key': 'AR', 'ollama-api-key': 'OL', 'gateway-auth-token': 'GW' })[n] ?? null,
  set: async () => {}, delete: async () => {}, list: async () => [],
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const at = (o: unknown, path: string): any => path.split('.').reduce<any>((v, k) => v?.[k], o)

function world(liveConfig: unknown) {
  const files = new Map<string, string>([['C:\\U\\.openclaw\\openclaw.json', JSON.stringify(liveConfig)]])
  const system = makeFakeSystem({
    env: (n) => ({ USERPROFILE: 'C:\\U', LOCALAPPDATA: 'C:\\LAD' })[n],
    now: () => Date.parse('2026-07-07T10:00:00Z'),
    readTextFile: async (p) => {
      const f = files.get(p)
      if (f === undefined) throw new Error('missing: ' + p)
      return f
    },
    writeTextFile: async (p, t) => void files.set(p, t),
    listDir: async () => [...files.keys()].map((name) => ({ name: name.split('\\').pop()!, mtimeMs: 1 })),
  })
  return { system, files }
}

describe('brain selection flows into generated config', () => {
  it('template default primary is unchanged when no brain is stored', () => {
    const cfg = buildOpenclawConfig('inline', SECRETS)
    expect(at(cfg, 'agents.defaults.model.primary')).toBe('arliai/Mistral-Medium-3.5-128B')
  })

  // M8a precedence: live tuning > brain-store > template default. The live
  // config's model block is user-owned truth (the store has lied before), so
  // a stored brain only applies when the live file has no model block at all.

  it('applyConfig applies a stored brain when the live config has no model block', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const live = buildOpenclawConfig('inline', SECRETS) as any
    delete live.agents.defaults.model // fresh/blank install shape
    const { system, files } = world(live)
    await writeBrainSelection(system, { primaryModel: 'ollama/dolphin3:8b', fallbacks: [] })

    const result = await applyConfig({ system, store: STORE, mode: 'inline' })
    expect(result.changed).toBe(true)
    expect(result.diffs).toContain('agents.defaults.model')

    const written = JSON.parse(files.get('C:\\U\\.openclaw\\openclaw.json')!)
    expect(at(written, 'agents.defaults.model.primary')).toBe('ollama/dolphin3:8b')
    expect(at(written, 'agents.defaults.model.fallbacks')).toEqual([])
  })

  it('the live primary beats a stale brain-store across an env-refs regeneration (migrate)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const live = buildOpenclawConfig('inline', SECRETS) as any
    live.agents.defaults.model.primary = 'arliai/Gemma-4-31B-it' // hand-set in place (the GUI's safe writer)
    const { system, files } = world(live)
    await writeBrainSelection(system, { primaryModel: 'arliai/Gemma-4-31B-DarkIdol', fallbacks: ['ollama/dolphin3:8b'] })

    await applyConfig({ system, store: STORE, mode: 'env-refs' })
    const written = JSON.parse(files.get('C:\\U\\.openclaw\\openclaw.json')!)
    expect(at(written, 'agents.defaults.model.primary')).toBe('arliai/Gemma-4-31B-it')
    // still secretless in env-refs mode
    expect(JSON.stringify(written)).not.toContain('"TG"')
    expect(at(written, 'channels.telegram.botToken')).toBeUndefined()
  })
})
