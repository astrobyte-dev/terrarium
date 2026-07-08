import { describe, expect, it } from 'vitest'
import { makeFakeSystem } from '../test/fake-system'
import { diffPaths } from './diff'
import { applyConfig } from './apply'
import { buildOpenclawConfig, type TemplateSecrets } from './template'
import type { SecretStore } from '../secrets/store'

const SECRETS: TemplateSecrets = {
  telegramBotToken: 'TG-1',
  arliaiApiKey: 'AR-1',
  ollamaApiKey: 'OL-1',
  gatewayAuthToken: 'GW-1',
  anthropicApiKey: null,
}

const fakeStore = (values: Record<string, string>): SecretStore => ({
  get: async (n) => values[n] ?? null,
  set: async () => {},
  delete: async () => {},
  list: async () => Object.keys(values),
})

const STORE = fakeStore({
  'telegram-bot-token': 'TG-1',
  'arliai-api-key': 'AR-1',
  'ollama-api-key': 'OL-1',
  'gateway-auth-token': 'GW-1',
})

function world(liveConfig: unknown) {
  const files = new Map<string, string>([
    ['C:\\U\\.openclaw\\openclaw.json', JSON.stringify(liveConfig)],
  ])
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

describe('diffPaths', () => {
  it('reports the paths that differ, not values', () => {
    const a = { x: 1, nested: { y: 'a', z: [1, 2] }, only: true }
    const b = { x: 1, nested: { y: 'b', z: [1, 3] } }
    const paths = diffPaths(a, b)
    expect(paths).toContain('nested.y')
    expect(paths).toContain('nested.z')
    expect(paths).toContain('only')
    expect(paths).not.toContain('x')
  })
})

describe('applyConfig', () => {
  it('is a no-op when the live config already matches (inline parity)', async () => {
    const live = buildOpenclawConfig('inline', SECRETS)
    const { system, files } = world(live)
    const before = files.get('C:\\U\\.openclaw\\openclaw.json')
    const result = await applyConfig({ system, store: STORE, mode: 'inline' })
    expect(result.changed).toBe(false)
    expect(result.diffs).toEqual([])
    expect(files.get('C:\\U\\.openclaw\\openclaw.json')).toBe(before)
  })

  it('rewrites to env-refs with a backup, preserving live meta/wizard', async () => {
    const live = {
      ...buildOpenclawConfig('inline', SECRETS),
      meta: { lastTouchedVersion: 'live-meta' },
    }
    const { system, files } = world(live)
    const result = await applyConfig({ system, store: STORE, mode: 'env-refs' })
    expect(result.changed).toBe(true)
    expect(result.backupPath).toMatch(/openclaw\.json\.bak\.terrarium-/)
    expect(files.get(result.backupPath!)).toBe(JSON.stringify(live))

    const written = JSON.parse(files.get('C:\\U\\.openclaw\\openclaw.json')!)
    expect(JSON.stringify(written)).not.toContain('TG-1')
    expect(written.meta.lastTouchedVersion).toBe('live-meta')
    expect(written.channels.telegram.botToken).toBeUndefined()
  })

  it('dryRun reports diffs without touching anything', async () => {
    const live = buildOpenclawConfig('inline', SECRETS)
    const { system, files } = world(live)
    const sizeBefore = files.size
    const result = await applyConfig({ system, store: STORE, mode: 'env-refs', dryRun: true })
    expect(result.changed).toBe(true)
    expect(result.diffs.length).toBeGreaterThan(0)
    expect(files.size).toBe(sizeBefore)
  })

  it('inline mode with missing secrets fails loudly', async () => {
    const live = buildOpenclawConfig('inline', SECRETS)
    const { system } = world(live)
    await expect(
      applyConfig({ system, store: fakeStore({}), mode: 'inline' }),
    ).rejects.toThrow(/telegram-bot-token/)
  })
})
