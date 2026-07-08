import type { ServiceId } from '../types'
import type { SpawnHandle, SpawnSpec, SystemPort } from '../system/system-port'

export type OwnedState = 'stopped' | 'spawning' | 'running' | 'backoff' | 'stopping'

export interface OwnedSpec {
  id: ServiceId
  port: number | null
  spawn: (sys: SystemPort) => Promise<SpawnSpec | null>
  readyTimeoutMs: number
  /** Portless services count as ready after staying alive this long. */
  readySettleMs?: number
}

export interface OwnedServiceOptions {
  system: SystemPort
  spec: OwnedSpec
  onLine: (source: 'stdout' | 'stderr', line: string) => void
  onTransition: (state: OwnedState, detail: string) => void
  backoffMs?: number[]
  probeIntervalMs?: number
  stableAfterMs?: number
}

export interface OwnedService {
  state(): OwnedState
  pid(): number | null
  /** Resolves once the ready gate passes; rejects (and cleans up) otherwise. */
  start(): Promise<void>
  stop(): Promise<void>
}

const DEFAULT_BACKOFF_MS = [2000, 5000, 15_000, 60_000]

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export function createOwnedService(opts: OwnedServiceOptions): OwnedService {
  const { system, spec } = opts
  const backoff = opts.backoffMs ?? DEFAULT_BACKOFF_MS
  const probeIntervalMs = opts.probeIntervalMs ?? 500

  let state: OwnedState = 'stopped'
  let handle: SpawnHandle | null = null
  let desired: 'up' | 'down' = 'down'
  let crashCount = 0
  let backoffTimer: NodeJS.Timeout | null = null
  let stableTimer: NodeJS.Timeout | null = null

  function transition(next: OwnedState, detail: string): void {
    state = next
    opts.onTransition(next, detail)
  }

  function clearTimers(): void {
    if (backoffTimer !== null) clearTimeout(backoffTimer)
    if (stableTimer !== null) clearTimeout(stableTimer)
    backoffTimer = null
    stableTimer = null
  }

  function scheduleRespawn(reason: string): void {
    const delay = backoff[Math.min(crashCount, backoff.length - 1)]!
    crashCount += 1
    transition('backoff', `${reason} — restarting in ${Math.max(1, Math.round(delay / 1000))} s`)
    backoffTimer = setTimeout(() => {
      backoffTimer = null
      if (desired === 'up') void respawn()
    }, delay)
    backoffTimer.unref?.()
  }

  async function respawn(): Promise<void> {
    try {
      await spawnOnce()
    } catch {
      if (desired === 'up') scheduleRespawn('relaunch failed')
    }
  }

  function onChildExit(h: SpawnHandle, code: number | null): void {
    if (handle !== h) return
    handle = null
    if (desired === 'down') {
      transition('stopped', 'stopped')
      return
    }
    if (state === 'spawning') return // waitReady surfaces the startup failure
    scheduleRespawn(`crashed (code ${code})`)
  }

  async function waitReady(h: SpawnHandle, hasExited: () => boolean): Promise<void> {
    if (spec.port === null) {
      await sleep(spec.readySettleMs ?? 1500)
      if (hasExited()) throw new Error(`${spec.id}: exited during startup`)
      return
    }
    const deadline = Date.now() + spec.readyTimeoutMs
    while (Date.now() < deadline) {
      if (hasExited()) throw new Error(`${spec.id}: exited during startup`)
      if (handle !== h) throw new Error(`${spec.id}: start aborted`)
      if (await system.probeTcp(spec.port, 1000)) return
      await sleep(probeIntervalMs)
    }
    throw new Error(`${spec.id}: not ready after ${spec.readyTimeoutMs} ms`)
  }

  async function spawnOnce(): Promise<void> {
    const spawnSpec = await spec.spawn(system)
    if (spawnSpec === null) throw new Error(`${spec.id}: nothing to spawn (not installed?)`)
    transition('spawning', 'spawning')
    const h = system.spawnProcess(spawnSpec)
    handle = h
    let exited = false
    h.onStdoutLine((line) => opts.onLine('stdout', line))
    h.onStderrLine((line) => opts.onLine('stderr', line))
    h.onExit((code) => {
      exited = true
      onChildExit(h, code)
    })
    await waitReady(h, () => exited)
    transition('running', `running (pid ${h.pid})`)
    stableTimer = setTimeout(() => {
      crashCount = 0
    }, opts.stableAfterMs ?? 600_000)
    stableTimer.unref?.()
  }

  return {
    state: () => state,
    pid: () => handle?.pid ?? null,

    async start() {
      if (state === 'running' || state === 'spawning') return
      desired = 'up'
      crashCount = 0
      clearTimers()
      try {
        await spawnOnce()
      } catch (err) {
        desired = 'down'
        const h = handle
        handle = null
        if (h !== null) await system.killTree(h.pid)
        transition('stopped', 'start failed')
        throw err
      }
    },

    async stop() {
      desired = 'down'
      clearTimers()
      const h = handle
      if (h === null) {
        if (state !== 'stopped') transition('stopped', 'stopped')
        return
      }
      transition('stopping', 'stopping')
      const exited = new Promise<void>((resolve) => h.onExit(() => resolve()))
      await system.killTree(h.pid)
      await Promise.race([exited, sleep(10_000)])
      if (handle === h) handle = null
      if (state !== 'stopped') transition('stopped', 'stopped')
    },
  }
}
