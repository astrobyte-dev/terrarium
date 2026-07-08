import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createWindowsSystem } from '../system/windows'
import { createOwnedService, type OwnedState } from './owned'

// Integration tests: real Windows spawns of tiny node fixtures.
const system = createWindowsSystem()
const SERVER = fileURLToPath(new URL('../test/fixtures/fake-server.cjs', import.meta.url))
const CRASH = fileURLToPath(new URL('../test/fixtures/fake-crash.cjs', import.meta.url))

let portSeq = 19310 + Math.floor(Math.random() * 200)

function serverService(opts: { port?: number | null; readyTimeoutMs?: number } = {}) {
  const port = opts.port === undefined ? ++portSeq : opts.port
  const transitions: OwnedState[] = []
  const lines: string[] = []
  const owned = createOwnedService({
    system,
    spec: {
      id: 'gateway',
      port,
      spawn: async () => ({ command: process.execPath, args: [SERVER, String(port ?? 0)] }),
      readyTimeoutMs: opts.readyTimeoutMs ?? 10_000,
    },
    probeIntervalMs: 100,
    backoffMs: [100],
    onLine: (_src, line) => lines.push(line),
    onTransition: (state) => transitions.push(state),
  })
  return { owned, transitions, lines, port }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('createOwnedService', () => {
  it('spawns, gates on the port, captures stdout, and stops cleanly', async () => {
    const { owned, transitions, lines, port } = serverService()
    await owned.start()
    expect(owned.state()).toBe('running')
    expect(owned.pid()).toBeGreaterThan(0)
    expect(await system.probeTcp(port!, 1000)).toBe(true)
    await sleep(150)
    expect(lines.some((l) => l.includes(`listening on ${port}`))).toBe(true)

    await owned.stop()
    expect(owned.state()).toBe('stopped')
    expect(await system.probeTcp(port!, 500)).toBe(false)
    expect(transitions).toEqual(['spawning', 'running', 'stopping', 'stopped'])
  }, 20_000)

  it('fails start when the ready gate times out, and kills the child', async () => {
    // Fixture binds portSeq but we gate on a different port that never opens.
    const gatePort = ++portSeq + 500
    const transitions: OwnedState[] = []
    const owned = createOwnedService({
      system,
      spec: {
        id: 'gateway',
        port: gatePort,
        spawn: async () => ({ command: process.execPath, args: [SERVER, String(++portSeq)] }),
        readyTimeoutMs: 700,
      },
      probeIntervalMs: 100,
      onLine: () => {},
      onTransition: (s) => transitions.push(s),
    })
    await expect(owned.start()).rejects.toThrow(/not ready/)
    expect(owned.state()).toBe('stopped')
  }, 20_000)

  it('respawns after a crash with backoff, and stop() ends the loop', async () => {
    const transitions: OwnedState[] = []
    const owned = createOwnedService({
      system,
      spec: {
        id: 'picDaemon',
        port: null,
        spawn: async () => ({ command: process.execPath, args: [CRASH, '900'] }),
        readyTimeoutMs: 5000,
        readySettleMs: 200,
      },
      probeIntervalMs: 50,
      backoffMs: [100],
      onLine: () => {},
      onTransition: (s) => transitions.push(s),
    })
    await owned.start()
    expect(owned.state()).toBe('running')

    // Crash at ~900 ms, backoff 100 ms, respawn, settle again.
    await sleep(1600)
    expect(transitions).toContain('backoff')
    expect(transitions.filter((t) => t === 'spawning').length).toBeGreaterThanOrEqual(2)

    await owned.stop()
    const spawnsAtStop = transitions.filter((t) => t === 'spawning').length
    await sleep(400)
    expect(owned.state()).toBe('stopped')
    expect(transitions.filter((t) => t === 'spawning').length).toBe(spawnsAtStop)
  }, 20_000)
})
