import { describe, expect, it } from 'vitest'
import type { DirEntry, SystemPort } from '../system/system-port'
import type { ProcessInfo } from '../types'
import { makeFakeSystem } from '../test/fake-system'
import { serviceDefinitions } from '../services/definitions'
import { createDpapiSecretStore, SECRET_NAMES } from '../secrets/store'
import { applyConfig } from '../config/apply'
import { buildOpenclawConfig, type TemplateSecrets } from '../config/template'
import { migrate, readOwnership, release, type MigrationDeps } from './migration'
import { buildDoctorReport, gatherDoctorFacts } from './doctor'

// Distinctive plaintext so "does the file leak a secret?" is a substring check.
const SEED: TemplateSecrets = {
  telegramBotToken: 'tg-SEEDTOKEN-111',
  arliaiApiKey: 'arli-SEEDKEY-222',
  ollamaApiKey: 'oll-SEEDKEY-333',
  gatewayAuthToken: 'gw-SEEDTOKEN-444',
  anthropicApiKey: null,
}
const ALL_PLAINTEXT = [SEED.telegramBotToken, SEED.arliaiApiKey, SEED.ollamaApiKey, SEED.gatewayAuthToken]

const ENV: Record<string, string> = { LOCALAPPDATA: 'C:\\LAD', APPDATA: 'C:\\RAD', USERPROFILE: 'C:\\U' }
const CONFIG_PATH = 'C:\\U\\.openclaw\\openclaw.json'
const STARTUP = 'C:\\RAD\\Microsoft\\Windows\\Start Menu\\Programs\\Startup'
const TASK_NAMES = ['OpenClaw Gateway', 'OpenClaw Service Watchdog', 'OpenClaw Pic Daemon']

/** One shared in-memory machine: filesystem, DPAPI, and scheduled tasks. */
async function makeWorld() {
  const files = new Map<string, string>()
  let seq = 0
  const order = new Map<string, number>()
  const put = (p: string, t: string) => {
    files.set(p, t)
    if (!order.has(p)) order.set(p, seq++)
  }
  const disabled = new Set<string>() // task names Terrarium disabled
  const lifecycleCalls: string[] = []
  const procs: ProcessInfo[] = [{ pid: 11, name: 'node.exe', commandLine: 'node openclaw gateway --port 18789' }]

  const system: SystemPort = makeFakeSystem({
    env: (n) => ENV[n],
    readTextFile: async (p) => {
      const t = files.get(p)
      if (t === undefined) throw new Error(`ENOENT ${p}`)
      return t
    },
    writeTextFile: async (p, t) => put(p, t),
    fileExists: async (p) => files.has(p),
    moveFile: async (from, to) => {
      const t = files.get(from)
      if (t !== undefined) {
        put(to, t)
        files.delete(from)
      }
    },
    deleteFile: async (p) => void files.delete(p),
    listDir: async (dir): Promise<DirEntry[]> => {
      const prefix = `${dir}\\`
      return [...files.keys()]
        .filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes('\\'))
        .map((k) => ({ name: k.slice(prefix.length), mtimeMs: order.get(k) ?? 0 }))
    },
    killTree: async (pid) => {
      const i = procs.findIndex((p) => p.pid === pid)
      if (i >= 0) procs.splice(i, 1)
    },
    runPowerShell: async (cmd, opts) => {
      // DPAPI stand-in: reversible, keyed off the same env channel the real store uses.
      if (cmd.includes('SecureStringToBSTR')) return (opts?.env?.TERRARIUM_BLOB ?? '').replace(/^ENC\((.*)\)$/, '$1')
      if (cmd.includes('ConvertFrom-SecureString')) return `ENC(${opts?.env?.TERRARIUM_SECRET ?? ''})`
      if (cmd.includes('Disable-ScheduledTask')) {
        disabled.add(/TaskName '([^']+)'/.exec(cmd)?.[1] ?? '')
        return ''
      }
      if (cmd.includes('Enable-ScheduledTask')) {
        disabled.delete(/TaskName '([^']+)'/.exec(cmd)?.[1] ?? '')
        return ''
      }
      if (cmd.includes('Get-ScheduledTask')) {
        return JSON.stringify(TASK_NAMES.map((name) => ({ TaskName: name, State: disabled.has(name) ? 1 : 4 })))
      }
      return '' // Stop-/Start-ScheduledTask etc.
    },
  })

  const store = createDpapiSecretStore(system)
  await store.set(SECRET_NAMES.telegramBotToken, SEED.telegramBotToken)
  await store.set(SECRET_NAMES.arliaiApiKey, SEED.arliaiApiKey)
  await store.set(SECRET_NAMES.ollamaApiKey, SEED.ollamaApiKey)
  await store.set(SECRET_NAMES.gatewayAuthToken, SEED.gatewayAuthToken)

  // Start from the scheduled-tasks world: an inline config + a startup launcher.
  // The config is HAND-TUNED the way the real one was when Migrate nuked it
  // (2026-07-09): swapped primary, extra arliai models, a per-model override,
  // and a num_ctx bump. M8a's contract: all of it survives every regen.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cfg = buildOpenclawConfig('inline', SEED) as any
  cfg.agents.defaults.model = { primary: 'arliai/Gemma-4-31B-it', fallbacks: ['ollama/dolphin3:8b'] }
  cfg.agents.defaults.models = {
    'arliai/GLM-4.7': { params: { chat_template_kwargs: { enable_thinking: false } } },
  }
  cfg.models.providers.arliai.models = [
    ...cfg.models.providers.arliai.models,
    { id: 'GLM-4.7', name: 'GLM 4.7', contextWindow: 32768, maxTokens: 1024 },
    { id: 'Gemma-4-31B-it', name: 'Gemma-4 31B Instruct', contextWindow: 32768, maxTokens: 1024 },
  ]
  const dolphin = cfg.models.providers.ollama.models.find((m: { id: string }) => m.id === 'dolphin3:8b')
  dolphin.contextWindow = 40960
  dolphin.params = { num_ctx: 40960 }
  cfg.models.providers.ollama.params = { num_ctx: 40960 }
  put(CONFIG_PATH, JSON.stringify(cfg, null, 2))
  put(`${STARTUP}\\OpenClaw Gateway.cmd`, '@echo off')

  const deps: MigrationDeps = {
    system,
    definitions: serviceDefinitions((n) => system.env(n), store),
    listProcesses: async () => [...procs],
    lifecycle: {
      startAll: async () => {
        lifecycleCalls.push('startAll')
        return { started: ['gateway' as const], adopted: [], failed: [] }
      },
      stopAll: async () => void lifecycleCalls.push('stopAll'),
    },
    // The real config rewrite — the piece migration.test.ts stubs out.
    prepareConfig: async (phase) => {
      await applyConfig({ system, store, mode: phase === 'migrate' ? 'env-refs' : 'inline' })
    },
  }

  const doctor = async () => buildDoctorReport(await gatherDoctorFacts(system, store))
  return { system, store, deps, doctor, files, lifecycleCalls }
}

const configText = (files: Map<string, string>) => files.get(CONFIG_PATH) ?? ''
const configJson = (files: Map<string, string>) => JSON.parse(configText(files)) as any

/** The M8a acceptance check: every hand-tune present, byte-meaningfully intact. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function expectTuningIntact(cfg: any) {
  expect(cfg.agents.defaults.model.primary).toBe('arliai/Gemma-4-31B-it')
  expect(cfg.agents.defaults.model.fallbacks).toEqual(['ollama/dolphin3:8b'])
  expect(cfg.agents.defaults.models['arliai/GLM-4.7']).toEqual({
    params: { chat_template_kwargs: { enable_thinking: false } },
  })
  const arliaiIds = cfg.models.providers.arliai.models.map((m: { id: string }) => m.id)
  expect(arliaiIds).toEqual(expect.arrayContaining(['GLM-4.7', 'Gemma-4-31B-it', 'Gemma-4-31B-DarkIdol']))
  const dolphin = cfg.models.providers.ollama.models.find((m: { id: string }) => m.id === 'dolphin3:8b')
  expect(dolphin.contextWindow).toBe(40960)
  expect(dolphin.params).toEqual({ num_ctx: 40960 })
  expect(cfg.models.providers.ollama.params).toEqual({ num_ctx: 40960 })
}

describe('migrate → doctor → release, fully wired', () => {
  it('flips secret handling env-refs ⇄ inline and stays healthy at every stage', async () => {
    const w = await makeWorld()

    // Stage 0 — scheduled tasks own it: inline config, all green.
    const before = await w.doctor()
    expect(before.healthy).toBe(true)
    expect(before.checks.find((c) => c.id === 'ownership')!.detail).toMatch(/scheduled tasks own/i)
    expect(configText(w.files)).toContain(SEED.telegramBotToken) // secrets inline for the task launchers

    // Stage 1 — migrate: config must go secretless, ledger written, owned services started.
    const report = await migrate(w.deps)
    expect(report.warnings).toEqual([])
    expect(w.lifecycleCalls).toContain('startAll')
    expect(await readOwnership(w.system)).not.toBeNull()

    const migrated = configJson(w.files)
    expect(migrated.models.providers.arliai.apiKey).toEqual({ source: 'env', provider: 'default', id: 'ARLIAI_API_KEY' })
    expect(migrated.channels.telegram).toEqual({ enabled: true }) // no botToken
    expect(migrated.gateway.auth).toEqual({ mode: 'none' }) // no token
    for (const secret of ALL_PLAINTEXT) expect(configText(w.files)).not.toContain(secret) // nothing leaked
    expectTuningIntact(migrated) // the 2026-07-09 nuke: never again

    const afterMigrate = await w.doctor()
    expect(afterMigrate.healthy).toBe(true)
    expect(afterMigrate.checks.find((c) => c.id === 'ownership')!.detail).toMatch(/Terrarium owns/i)
    expect(afterMigrate.checks.find((c) => c.id === 'config')!.status).toBe('ok') // env-refs file matches env-refs template

    // Stage 2 — release: exact inverse. Secrets inline again, ledger cleared.
    await release(w.deps)
    expect(w.lifecycleCalls).toContain('stopAll')
    expect(await readOwnership(w.system)).toBeNull()

    const released = configJson(w.files)
    expect(released.models.providers.arliai.apiKey).toBe(SEED.arliaiApiKey)
    expect(released.channels.telegram.botToken).toBe(SEED.telegramBotToken)
    expect(configText(w.files)).toContain(SEED.gatewayAuthToken)
    expectTuningIntact(released) // tuning survives the full round trip

    // Stage 3 — back where we started, still green.
    const after = await w.doctor()
    expect(after.healthy).toBe(true)
    expect(after.checks.find((c) => c.id === 'ownership')!.detail).toMatch(/scheduled tasks own/i)
  })

  it('when a task resists disabling, doctor surfaces the port-fight the migrate warning predicted', async () => {
    const w = await makeWorld()
    // The live "OpenClaw Gateway" ACL-denies Disable from a non-elevated shell (2026-07-07).
    const raw = w.system.runPowerShell
    w.system.runPowerShell = async (cmd, opts) => {
      if (cmd.includes("Disable-ScheduledTask") && cmd.includes('OpenClaw Gateway')) throw new Error('Access is denied.')
      return raw(cmd, opts)
    }

    const report = await migrate(w.deps)
    expect(report.warnings.some((warning) => /OpenClaw Gateway/.test(warning))).toBe(true)

    const doc = await w.doctor()
    const ownership = doc.checks.find((c) => c.id === 'ownership')!
    expect(ownership.status).toBe('warn')
    expect(ownership.detail).toMatch(/fight for the port/i)
    expect(doc.healthy).toBe(false)
  })
})
