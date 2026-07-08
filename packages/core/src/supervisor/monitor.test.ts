import { describe, expect, it } from 'vitest'
import type { ServiceDefinition } from '../services/definitions'
import type { OwnedView } from './lifecycle'
import { makeFakeSystem } from '../test/fake-system'
import { parseOpenclawLine } from '../logs/parse'
import { createMonitor } from './monitor'

const HOUR = 3_600_000
const NOW = 1_800_000_000_000

interface World {
  portOpen: boolean
  logMtime: number | null
  procs: string
  owned?: OwnedView | null
}

function fakeSystem(w: World) {
  return makeFakeSystem({
    runPowerShell: async () => w.procs,
    statMtimeMs: async () => w.logMtime,
    probeTcp: async () => w.portOpen,
    now: () => NOW,
  })
}

const gatewayDef: ServiceDefinition = {
  id: 'gateway',
  name: 'OpenClaw Gateway',
  port: 18789,
  startTier: 1,
  strayPolicy: 'strict',
  readyTimeoutMs: 90_000,
  quietAfterMs: 15 * 60_000,
  wedgedAfterMs: 60 * 60_000,
  detectInstall: async () => ({ path: 'C:\\oc', version: '2026.6.11', mode: 'adopted' }),
  matchProcess: (p) => p.name === 'node.exe',
  spawn: async () => null,
  resolveLogFile: async () => 'C:\\logs\\openclaw.log',
  parseLine: parseOpenclawLine,
}

const GATEWAY_PROC = JSON.stringify([{ ProcessId: 42, Name: 'node.exe', CommandLine: 'gateway' }])

function monitorFor(w: World) {
  return createMonitor({
    system: fakeSystem(w),
    definitions: [gatewayDef],
    owned: () => w.owned ?? null,
  })
}

describe('createMonitor', () => {
  it('detects the silent hang: port open, process up, log mtime hours old', async () => {
    const monitor = monitorFor({ portOpen: true, logMtime: NOW - 16 * HOUR, procs: GATEWAY_PROC })
    await monitor.refresh()
    const s = monitor.statuses()[0]!
    expect(s.health).toBe('wedged')
    expect(s.process?.pid).toBe(42)
    expect(s.install?.version).toBe('2026.6.11')
  })

  it('emits a status event only when something changed', async () => {
    const world: World = { portOpen: true, logMtime: NOW - 10_000, procs: GATEWAY_PROC }
    const monitor = monitorFor(world)
    const events: string[] = []
    monitor.on('status', (s) => events.push(s.health))

    await monitor.refresh()
    await monitor.refresh() // unchanged — no second event
    expect(events).toEqual(['live'])

    world.logMtime = NOW - 20 * 60_000
    await monitor.refresh()
    expect(events).toEqual(['live', 'quiet'])
  })

  it('reports stopped when the machine shows nothing running', async () => {
    const monitor = monitorFor({ portOpen: false, logMtime: null, procs: '[]' })
    await monitor.refresh()
    expect(monitor.statuses()[0]!.health).toBe('stopped')
  })

  it('overlays owned state: backoff shows as crashed, our pid is flagged', async () => {
    const world: World = {
      portOpen: false,
      logMtime: null,
      procs: '[]',
      owned: { state: 'backoff', pid: null, detail: 'crashed (code 1) — restarting in 5 s' },
    }
    const monitor = monitorFor(world)
    await monitor.refresh()
    const s = monitor.statuses()[0]!
    expect(s.health).toBe('crashed')
    expect(s.detail).toContain('restarting')

    world.owned = { state: 'running', pid: 42, detail: 'running (pid 42)' }
    world.procs = GATEWAY_PROC
    world.portOpen = true
    world.logMtime = NOW - 5000
    await monitor.refresh()
    const s2 = monitor.statuses()[0]!
    expect(s2.health).toBe('live')
    expect(s2.process?.ownedByUs).toBe(true)
  })
})
