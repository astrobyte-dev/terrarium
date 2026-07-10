import type { ProcessInfo, ServiceId } from '../types'
import type { SystemPort } from '../system/system-port'
import type { ServiceDefinition } from '../services/definitions'
import type { StartAllReport } from './lifecycle'
import { OPENCLAW_TASKS_QUERY, parseScheduledTasksJson } from '../detect/autostart'
import { safe } from '../util/safe'

export interface OwnershipLedger {
  migratedAt: string
  disabledTasks: { name: string; previousState: string }[]
  disabledStartupEntries: { from: string; to: string }[]
}

export interface MigrationReport {
  disabledTasks: { name: string; previousState: string }[]
  disabledStartupEntries: string[]
  killedPids: number[]
  startReport: StartAllReport
  /** Partial failures that need the user's attention — never swallowed. */
  warnings: string[]
}

export interface MigrationDeps {
  system: SystemPort
  definitions: ServiceDefinition[]
  listProcesses: () => Promise<ProcessInfo[]>
  lifecycle: {
    startAll(): Promise<StartAllReport>
    stopAll(): Promise<void>
  }
  /**
   * Rewrites openclaw.json for the new owner: 'migrate' → env-ref secrets
   * (Terrarium injects them at spawn), 'release' → inline secrets (the task
   * launchers set no env). Runs before the new owner starts anything.
   */
  prepareConfig?: (phase: 'migrate' | 'release') => Promise<void>
}

/** Suffix used by the pre-2026-07-10 rename-in-place scheme; still swept up. */
const DISABLED_SUFFIX = '.terrarium-disabled'

const esc = (name: string) => name.replace(/'/g, "''")
const ledgerPath = (sys: SystemPort) => `${sys.env('LOCALAPPDATA') ?? ''}\\Terrarium\\ownership.json`
const startupDir = (sys: SystemPort) =>
  `${sys.env('APPDATA') ?? ''}\\Microsoft\\Windows\\Start Menu\\Programs\\Startup`
/** Parked launchers live outside Startup — see the note in migrate() step 2. */
const parkedDir = (sys: SystemPort) => `${sys.env('LOCALAPPDATA') ?? ''}\\Terrarium\\startup-disabled`

const isLauncher = (name: string) => /openclaw/i.test(name) && /\.(cmd|bat|lnk)$/i.test(name)
const isStray = (name: string) => name.endsWith(DISABLED_SUFFIX)

export async function readOwnership(sys: SystemPort): Promise<OwnershipLedger | null> {
  try {
    return JSON.parse(await sys.readTextFile(ledgerPath(sys))) as OwnershipLedger
  } catch {
    return null
  }
}

/**
 * Take ownership of the stack: silence every competing autostart path
 * (a task-launched second gateway is the documented session-poison trap),
 * stop what is running, record how to undo all of it, then start owned.
 */
export async function migrate(deps: MigrationDeps): Promise<MigrationReport> {
  const { system, definitions } = deps

  // 1. Scheduled tasks: stop + disable (watchdog first-class: it would resurrect services we stop).
  const tasks = parseScheduledTasksJson(await safe(() => system.runPowerShell(OPENCLAW_TASKS_QUERY), ''))
  const disabledTasks: OwnershipLedger['disabledTasks'] = []
  const warnings: string[] = []
  for (const task of tasks) {
    await safe(
      () => system.runPowerShell(`Stop-ScheduledTask -TaskName '${esc(task.name)}' -ErrorAction SilentlyContinue`),
      '',
    )
    await safe(() => system.runPowerShell(`Disable-ScheduledTask -TaskName '${esc(task.name)}' | Out-Null`), '')
    disabledTasks.push({ name: task.name, previousState: task.state })
  }
  // Trust nothing: some task ACLs deny modification (live find, 2026-07-07 —
  // "OpenClaw Gateway" returns Access is denied from a non-elevated shell).
  const afterStates = parseScheduledTasksJson(
    await safe(() => system.runPowerShell(OPENCLAW_TASKS_QUERY), ''),
  )
  for (const task of afterStates) {
    if (task.state === 'Disabled') continue
    warnings.push(
      `task "${task.name}" could not be disabled (state: ${task.state}). At next logon it may launch its own copy. ` +
        `Fix once from an admin PowerShell: Disable-ScheduledTask -TaskName '${task.name}'`,
    )
  }

  // 2. Startup-folder launchers (legacy duplicate-gateway source): move them
  // OUT of the folder, reversibly. Renaming in place does not disable a Startup
  // entry — Windows shell-executes every file in the folder whatever its
  // extension, so a `.terrarium-disabled` launcher turns into an "open this
  // file with?" dialog at every logon (live find, 2026-07-10: two of them).
  // Leaving the folder is the only thing that actually silences a launcher.
  const dir = startupDir(system)
  const parked = parkedDir(system)
  const disabledStartupEntries: OwnershipLedger['disabledStartupEntries'] = []
  const entries = await safe(() => system.listDir(dir), [])
  const claimed = new Set<string>()
  // Live launchers first, so a leftover stray can never clobber the real file.
  const ordered = [...entries].sort((a, b) => Number(isStray(a.name)) - Number(isStray(b.name)))
  for (const entry of ordered) {
    const stray = isStray(entry.name)
    const original = stray ? entry.name.slice(0, -DISABLED_SUFFIX.length) : entry.name
    if (!isLauncher(original)) continue
    await safe(() => system.ensureDir(parked), undefined)
    // A stray whose original name is already parked keeps its suffix: it is a
    // duplicate, so evict it from Startup but do not overwrite the real one.
    const collides = claimed.has(original.toLowerCase())
    const from = `${dir}\\${entry.name}`
    const to = `${parked}\\${collides ? entry.name : original}`
    try {
      await system.moveFile(from, to)
    } catch (err) {
      warnings.push(
        `could not move startup launcher "${entry.name}" out of the Startup folder ` +
          `(${err instanceof Error ? err.message : String(err)}). It will start a second, ` +
          `session-poisoning gateway at your next logon. Move it out of "${dir}" by hand.`,
      )
      continue
    }
    if (collides) continue
    claimed.add(original.toLowerCase())
    // Restore target is always the un-suffixed name, so release() heals strays.
    disabledStartupEntries.push({ from: `${dir}\\${original}`, to })
  }

  // 3. Kill running strays, dependents first (daemon → gateway → backends).
  const killedPids: number[] = []
  const byTierDesc = [...definitions].sort((a, b) => b.startTier - a.startTier)
  for (const def of byTierDesc) {
    const strays = (await deps.listProcesses()).filter((p) => def.matchProcess(p))
    for (const stray of strays) {
      await system.killTree(stray.pid)
      killedPids.push(stray.pid)
    }
  }
  await waitUntilGone(deps, killedPids)

  // 4. Ledger before starting anything: if startup fails, release still works.
  const ledger: OwnershipLedger = {
    migratedAt: new Date(system.now()).toISOString(),
    disabledTasks,
    disabledStartupEntries,
  }
  await system.ensureDir(`${system.env('LOCALAPPDATA') ?? ''}\\Terrarium`)
  await system.writeTextFile(ledgerPath(system), JSON.stringify(ledger, null, 2))

  // 5. Secrets leave the config file; our spawns provide them via env.
  if (deps.prepareConfig !== undefined) {
    try {
      await deps.prepareConfig('migrate')
    } catch (err) {
      warnings.push(
        `config rewrite failed (${err instanceof Error ? err.message : String(err)}) — continuing with the existing config`,
      )
    }
  }

  // 6. Bring the stack up under our ownership.
  const startReport = await deps.lifecycle.startAll()

  return {
    disabledTasks,
    disabledStartupEntries: disabledStartupEntries.map((e) => e.from),
    killedPids,
    startReport,
    warnings,
  }
}

/** Hand the stack back to the scheduled tasks — the exact inverse of migrate(). */
export async function release(deps: MigrationDeps): Promise<void> {
  const { system } = deps
  const ledger = await readOwnership(system)
  if (ledger === null) throw new Error('not migrated — nothing to release')

  await deps.lifecycle.stopAll()

  // Sweep leftovers (e.g. children orphaned by a crashed supervisor session)
  // so the returning scheduled tasks never face a duplicate gateway.
  const leftoverPids: number[] = []
  for (const def of [...deps.definitions].sort((a, b) => b.startTier - a.startTier)) {
    for (const proc of (await deps.listProcesses()).filter((p) => def.matchProcess(p))) {
      await system.killTree(proc.pid)
      leftoverPids.push(proc.pid)
    }
  }
  await waitUntilGone(deps, leftoverPids)

  // The task launchers set no env, so secrets must be back inline before the
  // tasks start a gateway. A failure here must NOT strand the bot: restore
  // the tasks regardless, then surface the error.
  let configError: unknown = null
  if (deps.prepareConfig !== undefined) {
    try {
      await deps.prepareConfig('release')
    } catch (err) {
      configError = err
    }
  }

  // A failed restore leaves the launcher parked outside Startup — inert, not a
  // logon dialog — but the user's autostart is then silently missing, so say so.
  const notRestored: string[] = []
  for (const entry of ledger.disabledStartupEntries) {
    try {
      await system.moveFile(entry.to, entry.from)
    } catch {
      notRestored.push(entry.to)
    }
  }
  for (const task of ledger.disabledTasks) {
    await safe(() => system.runPowerShell(`Enable-ScheduledTask -TaskName '${esc(task.name)}' | Out-Null`), '')
    // Start every re-enabled task: gateway/daemon come back now; the watchdog
    // run revives Ollama/ComfyUI immediately instead of on its 5-min schedule.
    await safe(() => system.runPowerShell(`Start-ScheduledTask -TaskName '${esc(task.name)}'`), '')
  }

  await system.deleteFile(ledgerPath(system))

  if (configError !== null) {
    throw new Error(
      `released, but the config rewrite failed — the tasks may be running with a config that lacks secrets: ${
        configError instanceof Error ? configError.message : String(configError)
      }`,
    )
  }
  if (notRestored.length > 0) {
    throw new Error(
      `released, but these startup launchers could not be put back and remain parked: ${notRestored.join(', ')}`,
    )
  }
}

async function waitUntilGone(deps: MigrationDeps, pids: number[]): Promise<void> {
  if (pids.length === 0) return
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    const alive = await deps.listProcesses()
    if (!alive.some((p) => pids.includes(p.pid))) return
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
}
