import { EventEmitter } from 'node:events'
import type { LogEvent, ProcessInfo, ServiceStatus, ServiceId } from '../types'
import type { SystemPort } from '../system/system-port'
import type { ServiceDefinition } from '../services/definitions'
import type { OwnedView } from './lifecycle'
import { computeHealth } from '../health/ladder'
import { createProcessLister } from '../detect/processes'
import { createTailer } from '../logs/tailer'
import { safe } from '../util/safe'

export interface MonitorEvents {
  status: (s: ServiceStatus) => void
  log: (e: LogEvent) => void
}

export interface Monitor {
  statuses(): ServiceStatus[]
  /** One status pass over every service (also the unit-test entry point). */
  refresh(): Promise<void>
  /** One tail pass over every log source. */
  pollLogs(): Promise<void>
  startMonitoring(): void
  stopMonitoring(): void
  on<K extends keyof MonitorEvents>(event: K, fn: MonitorEvents[K]): void
  off<K extends keyof MonitorEvents>(event: K, fn: MonitorEvents[K]): void
}

export interface MonitorOptions {
  system: SystemPort
  definitions: ServiceDefinition[]
  emitter?: EventEmitter
  listProcesses?: () => Promise<ProcessInfo[]>
  /** Owned-process state from the lifecycle, overlaid onto detected health. */
  owned?: (id: ServiceId) => OwnedView | null
  statusIntervalMs?: number
  logIntervalMs?: number
}

const PORT_PROBE_TIMEOUT_MS = 1500

export function createMonitor(opts: MonitorOptions): Monitor {
  const { system, definitions } = opts
  const emitter = opts.emitter ?? new EventEmitter()
  const listProcesses = opts.listProcesses ?? createProcessLister(system)
  const current = new Map<string, ServiceStatus>()
  let statusTimer: NodeJS.Timeout | null = null
  let logTimer: NodeJS.Timeout | null = null

  const tailers = definitions
    .filter((def) => def.resolveLogFile !== null)
    .map((def) =>
      createTailer({
        fs: system,
        resolvePath: () => def.resolveLogFile!(system),
        onLine: (raw) => {
          const parsed = def.parseLine(raw)
          if (parsed === null) return
          emitter.emit('log', {
            service: def.id,
            ts: parsed.ts ?? system.now(),
            level: parsed.level,
            line: parsed.line,
          } satisfies LogEvent)
        },
      }),
    )

  async function buildStatus(def: ServiceDefinition, procs: ProcessInfo[]): Promise<ServiceStatus> {
    const install = await safe(() => def.detectInstall(system), null)
    const proc = procs.find((p) => def.matchProcess(p)) ?? null
    const portOpen =
      def.port === null ? null : await safe(() => system.probeTcp(def.port!, PORT_PROBE_TIMEOUT_MS), false)
    const logPath = def.resolveLogFile === null ? null : await safe(() => def.resolveLogFile!(system), null)
    const lastLogAt = logPath === null ? null : await safe(() => system.statMtimeMs(logPath), null)

    let { health, detail } = computeHealth({
      installed: install !== null,
      processRunning: proc !== null,
      port: def.port,
      portOpen: portOpen ?? false,
      lastLogAgeMs: lastLogAt === null ? null : Math.max(0, system.now() - lastLogAt),
      quietAfterMs: def.quietAfterMs,
      wedgedAfterMs: def.wedgedAfterMs,
    })

    const owned = opts.owned?.(def.id) ?? null
    if (owned !== null && owned.state === 'spawning') {
      health = 'starting'
      detail = owned.detail
    } else if (owned !== null && owned.state === 'backoff') {
      health = 'crashed'
      detail = owned.detail
    } else if (owned !== null && owned.state === 'stopping') {
      detail = owned.detail
    }

    return {
      id: def.id,
      name: def.name,
      install,
      process:
        proc === null ? null : { pid: proc.pid, ownedByUs: owned !== null && owned.pid === proc.pid },
      portOpen,
      lastLogAt,
      health,
      detail,
    }
  }

  // Detail strings carry ages that tick on every pass; only re-emit on substance.
  function changed(prev: ServiceStatus, next: ServiceStatus): boolean {
    return (
      prev.health !== next.health ||
      prev.process?.pid !== next.process?.pid ||
      prev.process?.ownedByUs !== next.process?.ownedByUs ||
      prev.portOpen !== next.portOpen ||
      (prev.install === null) !== (next.install === null)
    )
  }

  async function refresh(): Promise<void> {
    const procs = await listProcesses()
    await Promise.all(
      definitions.map(async (def) => {
        const status = await buildStatus(def, procs)
        const prev = current.get(def.id)
        current.set(def.id, status)
        if (prev === undefined || changed(prev, status)) emitter.emit('status', status)
      }),
    )
  }

  async function pollLogs(): Promise<void> {
    await Promise.all(tailers.map((t) => t.poll()))
  }

  return {
    statuses: () =>
      definitions.map((d) => current.get(d.id)).filter((s): s is ServiceStatus => s !== undefined),
    refresh,
    pollLogs,
    startMonitoring() {
      if (statusTimer !== null) return
      statusTimer = setInterval(() => void refresh(), opts.statusIntervalMs ?? 5000)
      logTimer = setInterval(() => void pollLogs(), opts.logIntervalMs ?? 1000)
      statusTimer.unref()
      logTimer.unref()
      void refresh()
      void pollLogs()
    },
    stopMonitoring() {
      if (statusTimer !== null) clearInterval(statusTimer)
      if (logTimer !== null) clearInterval(logTimer)
      statusTimer = null
      logTimer = null
    },
    on: (event, fn) => void emitter.on(event, fn),
    off: (event, fn) => void emitter.off(event, fn),
  }
}
