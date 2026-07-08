import { describe, expect, it } from 'vitest'
import type { ProcessInfo, ServiceId } from '../types'
import type { SpawnHandle } from '../system/system-port'
import type { ServiceDefinition } from '../services/definitions'
import { makeFakeSystem } from '../test/fake-system'
import { createLifecycle } from './lifecycle'

function makeDef(
  id: ServiceId,
  tier: number,
  port: number | null,
  policy: 'adopt' | 'strict',
): ServiceDefinition {
  return {
    id,
    name: id,
    port,
    startTier: tier,
    strayPolicy: policy,
    readyTimeoutMs: 5000,
    readySettleMs: 10,
    quietAfterMs: null,
    wedgedAfterMs: null,
    detectInstall: async () => ({ path: 'x', version: null, mode: 'adopted' }),
    matchProcess: (p) => p.name === id,
    spawn: async () => ({ command: id, args: [] }),
    resolveLogFile: null,
    parseLine: () => null,
  }
}

const DEFS = [
  makeDef('ollama', 0, 11434, 'adopt'),
  makeDef('comfyui', 0, 8188, 'adopt'),
  makeDef('gateway', 1, 18789, 'strict'),
  makeDef('picDaemon', 2, null, 'strict'),
]

/** Fake system whose spawned handles exit when killTree is called. */
function harness(procs: ProcessInfo[] = []) {
  const spawnOrder: string[] = []
  const killOrder: string[] = []
  const exitCbs = new Map<number, Array<(code: number | null) => void>>()
  const pidToCommand = new Map<number, string>()
  let nextPid = 100

  const system = makeFakeSystem({
    probeTcp: async () => true,
    spawnProcess: (spec): SpawnHandle => {
      const pid = nextPid++
      spawnOrder.push(spec.command)
      pidToCommand.set(pid, spec.command)
      exitCbs.set(pid, [])
      return {
        pid,
        onStdoutLine: () => {},
        onStderrLine: () => {},
        onExit: (cb) => exitCbs.get(pid)!.push(cb),
      }
    },
    killTree: async (pid) => {
      killOrder.push(pidToCommand.get(pid) ?? String(pid))
      for (const cb of exitCbs.get(pid) ?? []) cb(null)
      const strayIndex = procs.findIndex((p) => p.pid === pid)
      if (strayIndex >= 0) procs.splice(strayIndex, 1)
    },
  })

  const lifecycle = createLifecycle({
    system,
    definitions: DEFS,
    listProcesses: async () => procs,
    onLine: () => {},
    onTransition: () => {},
    probeIntervalMs: 10,
  })
  return { lifecycle, spawnOrder, killOrder }
}

describe('createLifecycle', () => {
  it('starts tier by tier and stops in reverse', async () => {
    const { lifecycle, spawnOrder, killOrder } = harness()
    const report = await lifecycle.startAll()
    expect(report.failed).toEqual([])
    expect(report.started).toHaveLength(4)

    expect(new Set(spawnOrder.slice(0, 2))).toEqual(new Set(['ollama', 'comfyui']))
    expect(spawnOrder[2]).toBe('gateway')
    expect(spawnOrder[3]).toBe('picDaemon')

    await lifecycle.stopAll()
    expect(killOrder[0]).toBe('picDaemon')
    expect(killOrder[1]).toBe('gateway')
    expect(new Set(killOrder.slice(2))).toEqual(new Set(['ollama', 'comfyui']))
  })

  it('refuses to start a strict service when a stray is running', async () => {
    const { lifecycle, spawnOrder } = harness([
      { pid: 9, name: 'gateway', commandLine: 'stray gateway' },
    ])
    await expect(lifecycle.start('gateway')).rejects.toThrow(/stray/i)
    expect(spawnOrder).toEqual([])
  })

  it('adopts a healthy stray instead of double-spawning (adopt policy)', async () => {
    const { lifecycle, spawnOrder } = harness([
      { pid: 9, name: 'ollama', commandLine: 'tray-app ollama' },
    ])
    await expect(lifecycle.start('ollama')).resolves.toBe('adopted')
    expect(spawnOrder).toEqual([])
  })

  it('kills matching strays and reports their pids', async () => {
    const procs: ProcessInfo[] = [{ pid: 9, name: 'gateway', commandLine: 'stray' }]
    const { lifecycle, killOrder } = harness(procs)
    const killed = await lifecycle.killStrays('gateway')
    expect(killed).toEqual([9])
    expect(killOrder).toEqual(['9'])
    expect(procs).toEqual([]) // killTree removed it from the machine
  })
})
