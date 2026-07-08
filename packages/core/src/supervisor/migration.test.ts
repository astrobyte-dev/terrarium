import { describe, expect, it } from 'vitest'
import type { ProcessInfo } from '../types'
import { makeFakeSystem } from '../test/fake-system'
import { serviceDefinitions } from '../services/definitions'
import { migrate, readOwnership, release } from './migration'

const TASKS_JSON = JSON.stringify([
  { TaskName: 'OpenClaw Gateway', State: 4 },
  { TaskName: 'OpenClaw Service Watchdog', State: 3 },
  { TaskName: 'OpenClaw Pic Daemon', State: 4 },
])

function world() {
  const psCommands: string[] = []
  const moved: Array<[string, string]> = []
  const written = new Map<string, string>()
  const deleted: string[] = []
  const killed: number[] = []
  const procs: ProcessInfo[] = [
    { pid: 11, name: 'node.exe', commandLine: 'node openclaw dist gateway --port 18789' },
    { pid: 12, name: 'pythonw.exe', commandLine: 'pythonw pic_daemon.py' },
  ]

  // Tasks whose Disable-ScheduledTask is denied (ACL), mirroring the live
  // "OpenClaw Gateway" task that returned Access is denied on 2026-07-07.
  const deniedTasks = new Set<string>()
  const disabledNames = new Set<string>()
  const system = makeFakeSystem({
    env: (n) => ({ LOCALAPPDATA: 'C:\\LAD', APPDATA: 'C:\\RAD', USERPROFILE: 'C:\\U' })[n],
    runPowerShell: async (cmd) => {
      psCommands.push(cmd)
      if (cmd.includes('Disable-ScheduledTask')) {
        const name = /TaskName '([^']+)'/.exec(cmd)?.[1] ?? ''
        if (deniedTasks.has(name)) throw new Error('Access is denied.')
        disabledNames.add(name)
        return ''
      }
      if (cmd.includes('Get-ScheduledTask')) {
        const rows = (JSON.parse(TASKS_JSON) as Array<{ TaskName: string; State: number }>).map(
          (r) => ({ ...r, State: disabledNames.has(r.TaskName) ? 1 : r.State }),
        )
        return JSON.stringify(rows)
      }
      return ''
    },
    listDir: async (dir) =>
      dir.includes('Startup')
        ? [
            { name: 'OpenClaw Gateway.cmd', mtimeMs: 1 },
            { name: 'OpenClaw Node.cmd', mtimeMs: 2 },
            { name: 'desktop.ini', mtimeMs: 3 },
          ]
        : [],
    moveFile: async (from, to) => void moved.push([from, to]),
    writeTextFile: async (p, t) => void written.set(p, t),
    readTextFile: async (p) => {
      const t = written.get(p)
      if (t === undefined) throw new Error('missing')
      return t
    },
    deleteFile: async (p) => {
      deleted.push(p)
      written.delete(p)
    },
    killTree: async (pid) => {
      killed.push(pid)
      const i = procs.findIndex((p) => p.pid === pid)
      if (i >= 0) procs.splice(i, 1)
    },
  })

  const definitions = serviceDefinitions(system.env)
  const lifecycleCalls: string[] = []
  const lifecycle = {
    startAll: async () => {
      lifecycleCalls.push('startAll')
      return { started: ['gateway' as const], adopted: [], failed: [] }
    },
    stopAll: async () => void lifecycleCalls.push('stopAll'),
  }

  const deps = {
    system,
    definitions,
    lifecycle,
    listProcesses: async () => [...procs],
    prepareConfig: async (phase: 'migrate' | 'release') => void lifecycleCalls.push(`config:${phase}`),
  }
  return { deps, psCommands, moved, written, deleted, killed, lifecycleCalls, system, deniedTasks }
}

describe('migrate', () => {
  it('disables autostart, kills strays, writes the ledger, then starts owned services', async () => {
    const w = world()
    const report = await migrate(w.deps)

    const disables = w.psCommands.filter((c) => c.includes('Disable-ScheduledTask'))
    expect(disables.some((c) => c.includes('OpenClaw Gateway'))).toBe(true)
    expect(disables.some((c) => c.includes('OpenClaw Service Watchdog'))).toBe(true)
    expect(disables.some((c) => c.includes('OpenClaw Pic Daemon'))).toBe(true)

    expect(w.moved).toContainEqual([
      'C:\\RAD\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\OpenClaw Gateway.cmd',
      'C:\\RAD\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\OpenClaw Gateway.cmd.terrarium-disabled',
    ])
    expect(w.moved.some(([f]) => f.endsWith('desktop.ini'))).toBe(false)

    expect(w.killed).toEqual(expect.arrayContaining([11, 12]))
    expect(report.killedPids).toEqual(expect.arrayContaining([11, 12]))
    // env-refs config is written before the owned services boot
    expect(w.lifecycleCalls).toEqual(['config:migrate', 'startAll'])
    expect(report.disabledTasks.map((t) => t.name)).toHaveLength(3)

    const ledger = await readOwnership(w.deps.system)
    expect(ledger).not.toBeNull()
    expect(ledger!.disabledTasks.find((t) => t.name === 'OpenClaw Gateway')!.previousState).toBe(
      'Running',
    )
    expect(report.warnings).toEqual([])
  })

  it('verifies disables and reports a task whose modification is denied', async () => {
    const w = world()
    w.deniedTasks.add('OpenClaw Gateway')
    const report = await migrate(w.deps)
    expect(report.warnings).toHaveLength(1)
    expect(report.warnings[0]).toMatch(/OpenClaw Gateway/)
    expect(report.warnings[0]).toMatch(/elevated|admin/i)
    // The other two really were disabled; migration still proceeded.
    expect(report.disabledTasks.map((t) => t.name)).toHaveLength(3)
    expect(w.lifecycleCalls).toEqual(['config:migrate', 'startAll'])
  })

  it('release restores everything in reverse and clears the ledger', async () => {
    const w = world()
    await migrate(w.deps)
    w.psCommands.length = 0

    await release(w.deps)

    // inline config is restored before the tasks are re-enabled
    expect(w.lifecycleCalls).toEqual(['config:migrate', 'startAll', 'stopAll', 'config:release'])
    const enables = w.psCommands.filter((c) => c.includes('Enable-ScheduledTask'))
    expect(enables).toHaveLength(3)
    const starts = w.psCommands.filter((c) => c.includes('Start-ScheduledTask'))
    expect(starts.length).toBeGreaterThanOrEqual(3)
    // startup entries restored: .terrarium-disabled → original
    expect(w.moved).toContainEqual([
      'C:\\RAD\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\OpenClaw Gateway.cmd.terrarium-disabled',
      'C:\\RAD\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\OpenClaw Gateway.cmd',
    ])
    expect(w.deleted.some((p) => p.endsWith('ownership.json'))).toBe(true)
    expect(await readOwnership(w.deps.system)).toBeNull()
  })

  it('release without a ledger refuses loudly', async () => {
    const w = world()
    await expect(release(w.deps)).rejects.toThrow(/not migrated/i)
  })

  it('release restores the tasks even when the config rewrite fails, then throws', async () => {
    const w = world()
    await migrate(w.deps)
    w.psCommands.length = 0
    w.deps.prepareConfig = async (phase) => {
      if (phase === 'release') throw new Error('store unreadable')
    }
    await expect(release(w.deps)).rejects.toThrow(/store unreadable/)
    // the bot is back on task ownership regardless
    expect(w.psCommands.filter((c) => c.includes('Enable-ScheduledTask'))).toHaveLength(3)
    expect(await readOwnership(w.deps.system)).toBeNull()
  })

  it('release sweeps orphaned processes before re-enabling tasks (crash recovery)', async () => {
    const w = world()
    await migrate(w.deps)
    // A previous supervisor session crashed and left its gateway child behind.
    const orphans = [{ pid: 33, name: 'node.exe', commandLine: 'node openclaw gateway' }]
    w.deps.listProcesses = async () => [...orphans]
    const sysKill = w.deps.system.killTree.bind(w.deps.system)
    w.deps.system.killTree = async (pid) => {
      if (pid === 33) orphans.length = 0
      await sysKill(pid)
    }
    await release(w.deps)
    expect(w.killed).toContain(33)
  })
})
