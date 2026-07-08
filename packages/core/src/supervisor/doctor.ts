import type { SystemPort } from '../system/system-port'
import type { SecretStore } from '../secrets/store'
import { SECRET_NAMES } from '../secrets/store'
import { applyConfig } from '../config/apply'
import { readBrainSelection } from '../catalog/brain-store'
import { OPENCLAW_TASKS_QUERY, parseScheduledTasksJson } from '../detect/autostart'
import { readOwnership } from './migration'
import { safe } from '../util/safe'

export type CheckStatus = 'ok' | 'warn' | 'fail'
export type RepairAction = 'regenerate-config' | null

export interface DoctorCheck {
  id: 'config' | 'secrets' | 'ownership' | 'brain'
  title: string
  status: CheckStatus
  detail: string
  fix: RepairAction
}

export interface DoctorReport {
  checks: DoctorCheck[]
  /** No check is worse than ok. */
  healthy: boolean
}

/** Everything the report needs, already gathered — keeps the report pure. */
export interface DoctorFacts {
  configExists: boolean
  /** Key paths that would change if we regenerated the config (never values). */
  configDiffs: string[]
  /** Required credentials not present in the store. */
  missingSecrets: string[]
  /** Terrarium currently owns the stack (ownership ledger present). */
  owned: boolean
  taskStates: { name: string; state: string }[]
  brainPrimary: string
}

// Secrets the stack cannot run without (anthropic is optional — the Claude door).
const REQUIRED_SECRETS = [
  SECRET_NAMES.telegramBotToken,
  SECRET_NAMES.arliaiApiKey,
  SECRET_NAMES.ollamaApiKey,
  SECRET_NAMES.gatewayAuthToken,
]

const DEFAULT_PRIMARY = 'arliai/Mistral-Medium-3.5-128B'

/** Turn gathered facts into an operator-facing checklist. Pure. */
export function buildDoctorReport(facts: DoctorFacts): DoctorReport {
  const checks: DoctorCheck[] = [
    configCheck(facts),
    secretsCheck(facts),
    ownershipCheck(facts),
    { id: 'brain', title: 'Brain', status: 'ok', detail: `active: ${facts.brainPrimary}`, fix: null },
  ]
  return { checks, healthy: checks.every((c) => c.status === 'ok') }
}

function configCheck(facts: DoctorFacts): DoctorCheck {
  if (!facts.configExists) {
    return { id: 'config', title: 'Config', status: 'fail', detail: 'openclaw.json is missing', fix: 'regenerate-config' }
  }
  if (facts.configDiffs.length > 0) {
    return {
      id: 'config',
      title: 'Config',
      status: 'warn',
      detail: `drifted from the known-good template (${facts.configDiffs.length} setting(s): ${facts.configDiffs.slice(0, 3).join(', ')})`,
      fix: 'regenerate-config',
    }
  }
  return { id: 'config', title: 'Config', status: 'ok', detail: 'matches the known-good template', fix: null }
}

function secretsCheck(facts: DoctorFacts): DoctorCheck {
  if (facts.missingSecrets.length > 0) {
    return {
      id: 'secrets',
      title: 'Credentials',
      status: 'fail',
      detail: `missing: ${facts.missingSecrets.join(', ')} — run npm run capture-secrets`,
      fix: null,
    }
  }
  return { id: 'secrets', title: 'Credentials', status: 'ok', detail: 'all required credentials stored', fix: null }
}

function ownershipCheck(facts: DoctorFacts): DoctorCheck {
  const anyEnabled = facts.taskStates.some((t) => t.state !== 'Disabled')
  if (facts.owned && anyEnabled) {
    return {
      id: 'ownership',
      title: 'Ownership',
      status: 'warn',
      detail: 'Terrarium owns the stack but an OpenClaw scheduled task is still enabled — they will fight for the port. Disable it from an admin PowerShell.',
      fix: null,
    }
  }
  if (!facts.owned && facts.taskStates.length > 0 && !anyEnabled) {
    return {
      id: 'ownership',
      title: 'Ownership',
      status: 'warn',
      detail: "released, but the OpenClaw scheduled tasks are disabled — the bot won't start on its own. Migrate, or re-enable the tasks.",
      fix: null,
    }
  }
  return {
    id: 'ownership',
    title: 'Ownership',
    status: 'ok',
    detail: facts.owned ? 'Terrarium owns the stack' : 'the scheduled tasks own the stack',
    fix: null,
  }
}

/** Gather the live facts the report needs. Never throws — a probe failure degrades to a fact. */
export async function gatherDoctorFacts(system: SystemPort, store: SecretStore): Promise<DoctorFacts> {
  const owned = (await readOwnership(system)) !== null
  const taskStates = parseScheduledTasksJson(await safe(() => system.runPowerShell(OPENCLAW_TASKS_QUERY), '')).map(
    (t) => ({ name: t.name, state: t.state }),
  )
  const brainPrimary = (await readBrainSelection(system))?.primaryModel ?? DEFAULT_PRIMARY

  const missingSecrets: string[] = []
  for (const name of REQUIRED_SECRETS) if ((await store.get(name)) === null) missingSecrets.push(name)

  const configPath = `${system.env('USERPROFILE') ?? ''}\\.openclaw\\openclaw.json`
  const configExists = await safe(async () => {
    await system.readTextFile(configPath)
    return true
  }, false)

  // Diffs need a generatable config: env-refs when owned (no secrets needed),
  // inline otherwise (needs the secrets — skip if any are missing).
  let configDiffs: string[] = []
  const mode = owned ? 'env-refs' : 'inline'
  if (configExists && (owned || missingSecrets.length === 0)) {
    configDiffs = await safe(async () => {
      const result = await applyConfig({ system, store, mode, dryRun: true })
      return result.diffs
    }, [])
  }

  return { configExists, configDiffs, missingSecrets, owned, taskStates, brainPrimary }
}
