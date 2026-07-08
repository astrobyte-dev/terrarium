import type { ProcessInfo, ServiceId } from '../types'
import type { SystemPort } from '../system/system-port'
import type { ServiceDefinition } from '../services/definitions'
import { createOwnedService, type OwnedService, type OwnedState } from './owned'

export interface OwnedView {
  state: OwnedState
  pid: number | null
  detail: string
}

export interface StartAllReport {
  started: ServiceId[]
  adopted: ServiceId[]
  failed: { id: ServiceId; error: string }[]
}

export interface Lifecycle {
  start(id: ServiceId): Promise<'started' | 'adopted'>
  stop(id: ServiceId): Promise<void>
  restart(id: ServiceId): Promise<void>
  startAll(): Promise<StartAllReport>
  stopAll(): Promise<void>
  owned(id: ServiceId): OwnedView
  /** Kill every matching process we do not own; wait until they are gone. */
  killStrays(id: ServiceId): Promise<number[]>
}

export interface LifecycleOptions {
  system: SystemPort
  definitions: ServiceDefinition[]
  listProcesses: () => Promise<ProcessInfo[]>
  onLine: (id: ServiceId, source: 'stdout' | 'stderr', line: string) => void
  onTransition: (id: ServiceId, state: OwnedState, detail: string) => void
  backoffMs?: number[]
  probeIntervalMs?: number
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export function createLifecycle(opts: LifecycleOptions): Lifecycle {
  const { system, definitions } = opts
  const services = new Map<ServiceId, OwnedService>()
  const details = new Map<ServiceId, string>()

  for (const def of definitions) {
    details.set(def.id, 'stopped')
    services.set(
      def.id,
      createOwnedService({
        system,
        spec: {
          id: def.id,
          port: def.port,
          spawn: (sys) => def.spawn(sys),
          readyTimeoutMs: def.readyTimeoutMs,
          readySettleMs: def.readySettleMs,
        },
        backoffMs: opts.backoffMs,
        probeIntervalMs: opts.probeIntervalMs,
        onLine: (source, line) => opts.onLine(def.id, source, line),
        onTransition: (state, detail) => {
          details.set(def.id, detail)
          opts.onTransition(def.id, state, detail)
        },
      }),
    )
  }

  function defOf(id: ServiceId): ServiceDefinition {
    const def = definitions.find((d) => d.id === id)
    if (def === undefined) throw new Error(`unknown service: ${id}`)
    return def
  }

  async function findStrays(id: ServiceId): Promise<ProcessInfo[]> {
    const def = defOf(id)
    const ownPid = services.get(id)!.pid()
    return (await opts.listProcesses()).filter((p) => def.matchProcess(p) && p.pid !== ownPid)
  }

  async function start(id: ServiceId): Promise<'started' | 'adopted'> {
    const def = defOf(id)
    const svc = services.get(id)!
    if (svc.state() === 'running' || svc.state() === 'spawning') return 'started'

    const strays = await findStrays(id)
    if (strays.length > 0) {
      const healthy = def.port === null ? false : await system.probeTcp(def.port, 1500)
      if (def.strayPolicy === 'adopt' && healthy) return 'adopted'
      throw new Error(
        `${id}: stray process running (pid ${strays[0]!.pid}) — migrate to take ownership, or stop it first`,
      )
    }
    await svc.start()
    return 'started'
  }

  async function stop(id: ServiceId): Promise<void> {
    await services.get(id)!.stop()
  }

  const tiers = [...new Set(definitions.map((d) => d.startTier))].sort((a, b) => a - b)

  return {
    start,
    stop,

    async restart(id) {
      await stop(id)
      await sleep(defOf(id).restartCooldownMs ?? 1000)
      await start(id)
    },

    async startAll() {
      const report: StartAllReport = { started: [], adopted: [], failed: [] }
      for (const tier of tiers) {
        const defs = definitions.filter((d) => d.startTier === tier)
        await Promise.all(
          defs.map(async (def) => {
            try {
              const outcome = await start(def.id)
              report[outcome === 'adopted' ? 'adopted' : 'started'].push(def.id)
            } catch (err) {
              report.failed.push({ id: def.id, error: err instanceof Error ? err.message : String(err) })
            }
          }),
        )
      }
      return report
    },

    async stopAll() {
      for (const tier of [...tiers].reverse()) {
        const defs = definitions.filter((d) => d.startTier === tier)
        await Promise.all(defs.map((def) => stop(def.id)))
      }
    },

    owned(id) {
      const svc = services.get(id)!
      return { state: svc.state(), pid: svc.pid(), detail: details.get(id) ?? '' }
    },

    async killStrays(id) {
      const strays = await findStrays(id)
      for (const stray of strays) await system.killTree(stray.pid)
      const deadline = Date.now() + 15_000
      while (Date.now() < deadline) {
        if ((await findStrays(id)).length === 0) break
        await sleep(250)
      }
      return strays.map((p) => p.pid)
    },
  }
}
