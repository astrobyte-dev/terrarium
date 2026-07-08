import { EventEmitter } from 'node:events'
import type { ServiceId, SystemReport } from '../types'
import type { SystemPort } from '../system/system-port'
import { createWindowsSystem } from '../system/windows'
import { serviceDefinitions } from '../services/definitions'
import { detectSystem } from '../detect/report'
import { createProcessLister } from '../detect/processes'
import { createDpapiSecretStore, SECRET_NAMES, type SecretStore } from '../secrets/store'
import { applyConfig } from '../config/apply'
import { MODEL_CATALOG } from '../catalog/models'
import { resolveBrainChoice } from '../catalog/brain'
import { readBrainSelection, writeBrainSelection } from '../catalog/brain-store'
import { getBotIdentity, type BotIdentity } from '../telegram/identity'
import { createLifecycle, type StartAllReport } from './lifecycle'
import { createMonitor, type Monitor } from './monitor'
import { migrate, readOwnership, release, type MigrationReport, type OwnershipLedger } from './migration'
import { buildDoctorReport, gatherDoctorFacts, type DoctorReport } from './doctor'
import { componentInstallers } from '../install/registry'
import { gatherOnboardingFacts, needsOnboarding, onboardingReason } from '../install/first-run'

export interface Supervisor extends Monitor {
  detectSystem(): Promise<SystemReport>
  start(id: ServiceId): Promise<'started' | 'adopted'>
  stop(id: ServiceId): Promise<void>
  restart(id: ServiceId): Promise<void>
  startAll(): Promise<StartAllReport>
  stopAll(): Promise<void>
  /** Disable OpenClaw autostart, stop strays, take ownership. Reversible. */
  migrate(): Promise<MigrationReport>
  /** The exact inverse: stop owned services, hand back to the scheduled tasks. */
  release(): Promise<void>
  ownership(): Promise<OwnershipLedger | null>
  secrets(): SecretStore
  /** getMe on the stored token — which bot is this, really? Null when unknown. */
  botIdentity(): Promise<BotIdentity | null>
  /** Currently selected primary brain ref (persisted choice, or template default). */
  currentBrain(): Promise<string>
  /** Switch the global brain by catalog id; regenerates config with a backup. */
  setBrain(catalogId: string): Promise<{ ok: boolean; message: string }>
  /** Diagnose drift from the known-good state (config, secrets, ownership). */
  doctor(): Promise<DoctorReport>
  /** Reset to working state: regenerate the config from the proven template. */
  repair(): Promise<{ repaired: boolean; message: string }>
  /** Is this a blank slate that should run first-run setup? */
  onboarding(): Promise<{ needed: boolean; reason: string }>
}

const DEFAULT_PRIMARY = 'arliai/Mistral-Medium-3.5-128B'

export function createSupervisor(system: SystemPort = createWindowsSystem()): Supervisor {
  const store = createDpapiSecretStore(system)
  const definitions = serviceDefinitions((name) => system.env(name), store)
  const emitter = new EventEmitter()
  const listProcesses = createProcessLister(system)

  let monitor: Monitor | undefined
  const lifecycle = createLifecycle({
    system,
    definitions,
    listProcesses,
    onLine: (id, _source, raw) => {
      const def = definitions.find((d) => d.id === id)!
      // Services with a log file are already tailed — emitting their piped
      // stdio too would double every line (observed live with the gateway).
      if (def.resolveLogFile !== null) return
      const parsed = def.parseLine(raw)
      if (parsed === null) return
      emitter.emit('log', { service: id, ts: parsed.ts ?? system.now(), level: parsed.level, line: parsed.line })
    },
    onTransition: () => void monitor?.refresh(),
  })

  monitor = createMonitor({
    system,
    definitions,
    emitter,
    listProcesses,
    owned: (id) => lifecycle.owned(id),
  })

  const migrationDeps = {
    system,
    definitions,
    listProcesses,
    lifecycle,
    prepareConfig: async (phase: 'migrate' | 'release') => {
      await applyConfig({ system, store, mode: phase === 'migrate' ? 'env-refs' : 'inline' })
    },
  }

  return {
    ...monitor,
    detectSystem: () => detectSystem(system, definitions),
    start: (id) => lifecycle.start(id),
    stop: (id) => lifecycle.stop(id),
    restart: (id) => lifecycle.restart(id),
    startAll: () => lifecycle.startAll(),
    stopAll: () => lifecycle.stopAll(),
    migrate: () => migrate(migrationDeps),
    release: () => release(migrationDeps),
    ownership: () => readOwnership(system),
    secrets: () => store,
    async botIdentity() {
      const token = await store.get(SECRET_NAMES.telegramBotToken)
      return token === null ? null : getBotIdentity(token)
    },
    async currentBrain() {
      return (await readBrainSelection(system))?.primaryModel ?? DEFAULT_PRIMARY
    },
    async setBrain(catalogId) {
      const entry = MODEL_CATALOG.find((m) => m.id === catalogId)
      if (entry === undefined) return { ok: false, message: `unknown brain: ${catalogId}` }
      const anthropicConfigured = (await store.get(SECRET_NAMES.anthropicApiKey)) !== null
      const choice = resolveBrainChoice(entry, { anthropicConfigured })
      if (!choice.ok || choice.primaryModel === null) return { ok: false, message: choice.reason }

      await writeBrainSelection(system, { primaryModel: choice.primaryModel, fallbacks: choice.fallbacks })
      // Config mode follows ownership: env-refs while we own it, inline for tasks.
      const mode = (await readOwnership(system)) === null ? 'inline' : 'env-refs'
      const result = await applyConfig({ system, store, mode })
      const note = result.changed ? ` (backup: ${result.backupPath})` : ' (already active)'
      return {
        ok: true,
        message: `brain set to ${choice.primaryModel}${note} — restart the gateway to apply`,
      }
    },
    async doctor() {
      return buildDoctorReport(await gatherDoctorFacts(system, store))
    },
    async repair() {
      // The one safe reset: regenerate the config from the proven template
      // (mode follows ownership), which rotates a backup first.
      const mode = (await readOwnership(system)) === null ? 'inline' : 'env-refs'
      const result = await applyConfig({ system, store, mode })
      if (!result.changed) return { repaired: false, message: 'config already matches the known-good template' }
      return {
        repaired: true,
        message: `config regenerated (backup: ${result.backupPath}) — restart the gateway to apply`,
      }
    },
    async onboarding() {
      const facts = await gatherOnboardingFacts(componentInstallers(system), store)
      return { needed: needsOnboarding(facts), reason: onboardingReason(facts) }
    },
  }
}
