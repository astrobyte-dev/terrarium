import type { SystemPort } from '../system/system-port'
import type { SecretStore } from '../secrets/store'
import { SECRET_NAMES } from '../secrets/store'
import { buildOpenclawConfig, type SecretsMode, type TemplateSecrets } from './template'
import { extractUserTuning } from './user-tuning'
import { readBrainSelection } from '../catalog/brain-store'
import { diffPaths } from './diff'

export interface ApplyResult {
  changed: boolean
  backupPath: string | null
  /** Differing key paths (never values). */
  diffs: string[]
}

export interface ApplyOptions {
  system: SystemPort
  store: SecretStore
  mode: SecretsMode
  dryRun?: boolean
  configPath?: string
}

const KEEP_BACKUPS = 5

/**
 * Generate openclaw.json from the template and write it (with a rotated
 * backup) if it differs from what is live. meta/wizard blocks are carried
 * over from the live file — OpenClaw rewrites those itself — and so is the
 * user's hand-tuning of the model domain (primary/fallbacks, per-model
 * overrides, provider model lists and params): the 2026-07-09 Migrate nuke
 * must never repeat. Secret placement is still regenerated per mode.
 */
export async function applyConfig(opts: ApplyOptions): Promise<ApplyResult> {
  const { system } = opts
  const configPath = opts.configPath ?? `${system.env('USERPROFILE') ?? ''}\\.openclaw\\openclaw.json`

  const live = JSON.parse(await system.readTextFile(configPath)) as Record<string, unknown>
  const anthropicKey = await opts.store.get(SECRET_NAMES.anthropicApiKey) // optional (the Claude door)
  const secrets = opts.mode === 'inline' ? await requireSecrets(opts.store, anthropicKey) : null
  const brain = await readBrainSelection(system) // persisted brain choice survives regen
  const target = buildOpenclawConfig(opts.mode, secrets, {
    meta: live.meta,
    wizard: live.wizard,
    primaryModel: brain?.primaryModel,
    fallbacks: brain?.fallbacks,
    anthropicEnabled: anthropicKey !== null,
    tuning: extractUserTuning(live), // live hand-tuning wins over the brain store
  })

  const diffs = diffPaths(live, target)
  if (diffs.length === 0) return { changed: false, backupPath: null, diffs: [] }
  if (opts.dryRun === true) return { changed: true, backupPath: null, diffs }

  const backupPath = await rotateBackup(system, configPath)
  await system.writeTextFile(configPath, JSON.stringify(target, null, 2))
  return { changed: true, backupPath, diffs }
}

async function requireSecrets(store: SecretStore, anthropicKey: string | null): Promise<TemplateSecrets> {
  const read = async (name: string) => {
    const value = await store.get(name)
    if (value === null) throw new Error(`secret "${name}" missing from the store — run secret capture first`)
    return value
  }
  return {
    telegramBotToken: await read(SECRET_NAMES.telegramBotToken),
    arliaiApiKey: await read(SECRET_NAMES.arliaiApiKey),
    ollamaApiKey: await read(SECRET_NAMES.ollamaApiKey),
    gatewayAuthToken: await read(SECRET_NAMES.gatewayAuthToken),
    anthropicApiKey: anthropicKey, // optional — only wired when the Claude door is open
  }
}

async function rotateBackup(system: SystemPort, configPath: string): Promise<string> {
  const stamp = new Date(system.now())
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\..+$/, '')
    .replace('T', '-')
  const backupPath = `${configPath}.bak.terrarium-${stamp}`
  await system.writeTextFile(backupPath, await system.readTextFile(configPath))

  const dir = configPath.slice(0, configPath.lastIndexOf('\\'))
  const base = configPath.slice(configPath.lastIndexOf('\\') + 1)
  const pattern = `${base}.bak.terrarium-`
  const backups = (await system.listDir(dir))
    .filter((e) => e.name.startsWith(pattern))
    .sort((a, b) => a.name.localeCompare(b.name)) // stamp sorts chronologically
  for (const old of backups.slice(0, Math.max(0, backups.length - KEEP_BACKUPS))) {
    await system.deleteFile(`${dir}\\${old.name}`)
  }
  return backupPath
}
