import { describe, expect, it } from 'vitest'
import { buildDoctorReport, repairConfig, type DoctorFacts } from './doctor'
import { makeFakeSystem } from '../test/fake-system'
import { buildOpenclawConfig, type TemplateSecrets } from '../config/template'
import type { SecretStore } from '../secrets/store'

const GOOD: DoctorFacts = {
  configExists: true,
  configDiffs: [],
  missingSecrets: [],
  owned: true,
  taskStates: [{ name: 'OpenClaw Gateway', state: 'Disabled' }],
  brainPrimary: 'arliai/Mistral-Medium-3.5-128B',
}

const check = (facts: Partial<DoctorFacts>, id: string) =>
  buildDoctorReport({ ...GOOD, ...facts }).checks.find((c) => c.id === id)!

describe('buildDoctorReport', () => {
  it('reports healthy when everything matches the known-good state', () => {
    const report = buildDoctorReport(GOOD)
    expect(report.healthy).toBe(true)
    expect(report.checks.every((c) => c.status === 'ok')).toBe(true)
  })

  it('fails and offers a regenerate fix when the config is missing', () => {
    const c = check({ configExists: false }, 'config')
    expect(c.status).toBe('fail')
    expect(c.fix).toBe('regenerate-config')
    expect(buildDoctorReport({ ...GOOD, configExists: false }).healthy).toBe(false)
  })

  it('warns and offers a regenerate fix when the config has drifted', () => {
    const c = check({ configDiffs: ['channels.telegram.botToken', 'agents.defaults.model.primary'] }, 'config')
    expect(c.status).toBe('warn')
    expect(c.fix).toBe('regenerate-config')
    expect(c.detail).toMatch(/2/)
  })

  it('fails when a required secret is missing', () => {
    const c = check({ missingSecrets: ['telegram-bot-token'] }, 'secrets')
    expect(c.status).toBe('fail')
    expect(c.detail).toMatch(/telegram-bot-token/)
    expect(c.fix).toBeNull()
  })

  it('warns when Terrarium owns the stack but a scheduled task is still enabled', () => {
    const c = check({ owned: true, taskStates: [{ name: 'OpenClaw Gateway', state: 'Ready' }] }, 'ownership')
    expect(c.status).toBe('warn')
    expect(c.detail).toMatch(/fight|enabled/i)
  })

  it('warns when released but the scheduled tasks are left disabled', () => {
    const c = check({ owned: false, taskStates: [{ name: 'OpenClaw Gateway', state: 'Disabled' }] }, 'ownership')
    expect(c.status).toBe('warn')
    expect(c.detail).toMatch(/on its own|autostart|won't start/i)
  })

  it('is ok when released and the scheduled tasks are enabled', () => {
    const c = check({ owned: false, taskStates: [{ name: 'OpenClaw Gateway', state: 'Ready' }] }, 'ownership')
    expect(c.status).toBe('ok')
  })

  it('always reports the active brain for visibility', () => {
    const c = check({}, 'brain')
    expect(c.status).toBe('ok')
    expect(c.detail).toContain('arliai/Mistral-Medium-3.5-128B')
  })
})

const SECRETS: TemplateSecrets = {
  telegramBotToken: 'TG', arliaiApiKey: 'AR', ollamaApiKey: 'OL', gatewayAuthToken: 'GW', anthropicApiKey: null,
}
const STORE: SecretStore = {
  get: async (n) => ({ 'telegram-bot-token': 'TG', 'arliai-api-key': 'AR', 'ollama-api-key': 'OL', 'gateway-auth-token': 'GW' })[n] ?? null,
  set: async () => {}, delete: async () => {}, list: async () => [],
}

function world(liveConfig: unknown) {
  const files = new Map<string, string>([['C:\\U\\.openclaw\\openclaw.json', JSON.stringify(liveConfig)]])
  const system = makeFakeSystem({
    env: (n) => ({ USERPROFILE: 'C:\\U', LOCALAPPDATA: 'C:\\LAD' })[n],
    now: () => Date.parse('2026-07-09T10:00:00Z'),
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

describe('repairConfig', () => {
  it('is a no-op when the live config already matches (released → inline)', async () => {
    const { system } = world(buildOpenclawConfig('inline', SECRETS))
    const r = await repairConfig(system, STORE)
    expect(r.repaired).toBe(false)
    expect(r.changed).toBe(false)
    expect(r.message).toMatch(/already matches/i)
  })

  it('regenerates (with a backup) when the config has drifted, preserving hand-tuning', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const live = buildOpenclawConfig('inline', SECRETS) as any
    live.agents.defaults.model.primary = 'arliai/Gemma-4-31B-it' // hand-tuned
    delete live.tools // a genuine app-domain drift the template will restore
    const { system, files } = world(live)

    const r = await repairConfig(system, STORE)
    expect(r.repaired).toBe(true)
    expect(r.backupPath).toMatch(/openclaw\.json\.bak\.terrarium-/)

    const written = JSON.parse(files.get('C:\\U\\.openclaw\\openclaw.json')!)
    expect(written.tools).toBeDefined() // app domain restored
    expect(written.agents.defaults.model.primary).toBe('arliai/Gemma-4-31B-it') // tuning preserved
  })
})
