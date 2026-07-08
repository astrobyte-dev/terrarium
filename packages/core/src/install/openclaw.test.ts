import { describe, expect, it } from 'vitest'
import { makeFakeSystem } from '../test/fake-system'
import { OPENCLAW_PIN, createOpenclawInstaller } from './openclaw'

const PINNED_PKG = 'C:\\LAD\\Terrarium\\runtime\\node_modules\\openclaw\\package.json'

function world(opts: { pinnedVersion?: string | null } = {}) {
  const psCommands: string[] = []
  const system = makeFakeSystem({
    env: (n) => (n === 'LOCALAPPDATA' ? 'C:\\LAD' : undefined),
    fileExists: async (p) => p === PINNED_PKG && opts.pinnedVersion != null,
    readTextFile: async (p) => {
      if (p === PINNED_PKG && opts.pinnedVersion != null) {
        return JSON.stringify({ version: opts.pinnedVersion })
      }
      throw new Error('missing')
    },
    runPowerShell: async (cmd) => {
      psCommands.push(cmd)
      return ''
    },
  })
  return { installer: createOpenclawInstaller(system), psCommands }
}

describe('createOpenclawInstaller', () => {
  it('plans nothing when the pinned version is already in place', async () => {
    const { installer } = world({ pinnedVersion: OPENCLAW_PIN })
    const plan = await installer.plan()
    expect(plan.installed?.version).toBe(OPENCLAW_PIN)
    expect(plan.actions).toEqual([])
    expect(await installer.verify()).toBe(true)
  })

  it('plans an install when absent, and when the pin drifted', async () => {
    for (const pinnedVersion of [null, '2026.5.20'] as const) {
      const { installer } = world({ pinnedVersion })
      const plan = await installer.plan()
      expect(plan.installed?.version ?? null).toBe(pinnedVersion)
      expect(plan.actions.join(' ')).toContain(OPENCLAW_PIN)
      expect(plan.blockers).toEqual([])
    }
  })

  it('installs via npm into the Terrarium runtime prefix, never globally', async () => {
    const { installer, psCommands } = world({})
    await installer.install()
    const npm = psCommands.find((c) => c.includes('npm install'))!
    expect(npm).toContain(`openclaw@${OPENCLAW_PIN}`)
    expect(npm).toContain('--prefix "C:\\LAD\\Terrarium\\runtime"')
    expect(npm).not.toContain('-g')
  })
})
