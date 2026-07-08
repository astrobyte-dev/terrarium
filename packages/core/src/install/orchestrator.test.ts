import { describe, expect, it } from 'vitest'
import type { ComponentId, ComponentInstaller, ComponentPlan, InstallOutcome } from './types'
import { runInstallSequence, summarizeInstallPlan } from './orchestrator'

const plan = (over: Partial<ComponentPlan> & { id: ComponentId }): ComponentPlan => ({
  installed: null,
  actions: [],
  downloadMb: 0,
  diskNeededMb: 0,
  blockers: [],
  ...over,
})

/** A fake installer that flips to "installed" after a successful install (idempotency). */
function fake(
  id: ComponentId,
  opts: { actions?: string[]; downloadMb?: number; diskNeededMb?: number; blockers?: string[]; installOk?: boolean; verifyOk?: boolean } = {},
): ComponentInstaller & { installs: number } {
  let done = (opts.actions ?? []).length === 0 && (opts.blockers ?? []).length === 0
  const state = {
    id,
    installs: 0,
    async plan(): Promise<ComponentPlan> {
      return plan({ id, actions: done ? [] : (opts.actions ?? ['do it']), downloadMb: opts.downloadMb ?? 0, diskNeededMb: opts.diskNeededMb ?? 0, blockers: opts.blockers ?? [] })
    },
    async install(): Promise<InstallOutcome> {
      state.installs += 1
      if (opts.installOk === false) return { ok: false, message: 'install failed' }
      done = true
      return { ok: true, message: `${id} installed` }
    },
    async verify(): Promise<boolean> {
      return opts.verifyOk ?? true
    },
  }
  return state
}

describe('summarizeInstallPlan', () => {
  it('aggregates download/disk over only the steps that need work', () => {
    const s = summarizeInstallPlan([
      plan({ id: 'ollama', actions: ['install ollama'], downloadMb: 700, diskNeededMb: 1500 }),
      plan({ id: 'comfyui', actions: [], downloadMb: 0, diskNeededMb: 0 }), // already installed
      plan({ id: 'openclaw', actions: ['npm i'], downloadMb: 90, diskNeededMb: 90 }),
    ])
    expect(s.totalDownloadMb).toBe(790)
    expect(s.totalDiskNeededMb).toBe(1590)
    expect(s.steps.find((x) => x.id === 'comfyui')!.needed).toBe(false)
    expect(s.ready).toBe(true)
  })

  it('labels blockers by component and is not ready', () => {
    const s = summarizeInstallPlan([
      plan({ id: 'ollama', blockers: ['winget not found'] }),
      plan({ id: 'openclaw', actions: ['npm i'] }),
    ])
    expect(s.blockers).toContain('ollama: winget not found')
    expect(s.ready).toBe(false)
  })
})

describe('runInstallSequence', () => {
  it('skips already-installed components', async () => {
    const results = await runInstallSequence([fake('ollama', {}), fake('openclaw', {})])
    expect(results.every((r) => r.status === 'skipped')).toBe(true)
  })

  it('installs and verifies a needed component', async () => {
    const oll = fake('ollama', { actions: ['install'] })
    const [r] = await runInstallSequence([oll])
    expect(r!.status).toBe('installed')
    expect(oll.installs).toBe(1)
  })

  it('marks a blocked component failed and stops the sequence by default', async () => {
    const oll = fake('ollama', { blockers: ['winget not found'] })
    const opencl = fake('openclaw', { actions: ['npm i'] })
    const results = await runInstallSequence([oll, opencl])
    expect(results).toHaveLength(1)
    expect(results[0]!.status).toBe('failed')
    expect(opencl.installs).toBe(0)
  })

  it('reports a failed install and stops', async () => {
    const results = await runInstallSequence([fake('ollama', { actions: ['x'], installOk: false }), fake('openclaw', { actions: ['y'] })])
    expect(results).toHaveLength(1)
    expect(results[0]!.status).toBe('failed')
  })

  it('reports installed-but-unverified as failed', async () => {
    const [r] = await runInstallSequence([fake('comfyui', { actions: ['x'], verifyOk: false })])
    expect(r!.status).toBe('failed')
    expect(r!.message).toMatch(/verify/i)
  })

  it('can continue past a failure when asked', async () => {
    const opencl = fake('openclaw', { actions: ['y'] })
    const results = await runInstallSequence([fake('ollama', { actions: ['x'], installOk: false }), opencl], { stopOnFailure: false })
    expect(results).toHaveLength(2)
    expect(opencl.installs).toBe(1)
  })

  it('reports a thrown install error as failed instead of crashing the run', async () => {
    const thrower: ComponentInstaller = {
      id: 'ollama',
      async plan() { return plan({ id: 'ollama', actions: ['x'] }) },
      async install(): Promise<InstallOutcome> { throw new Error('winget exited 1') },
      async verify() { return true },
    }
    const opencl = fake('openclaw', { actions: ['y'] })
    const results = await runInstallSequence([thrower, opencl])
    expect(results).toHaveLength(1)
    expect(results[0]!.status).toBe('failed')
    expect(results[0]!.message).toMatch(/winget exited 1/)
    expect(opencl.installs).toBe(0) // stopped, dependents untouched
  })

  it('is idempotent: a second run skips everything the first installed', async () => {
    const oll = fake('ollama', { actions: ['install'] })
    await runInstallSequence([oll])
    const second = await runInstallSequence([oll])
    expect(second[0]!.status).toBe('skipped')
    expect(oll.installs).toBe(1) // not re-installed
  })
})
