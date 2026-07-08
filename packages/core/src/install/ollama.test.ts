import { describe, expect, it } from 'vitest'
import { makeFakeSystem } from '../test/fake-system'
import { createOllamaInstaller } from './ollama'

function world(opts: { exeExists: boolean; winget: boolean }) {
  const psCommands: string[] = []
  const system = makeFakeSystem({
    env: (n) => (n === 'LOCALAPPDATA' ? 'C:\\LAD' : undefined),
    fileExists: async (p) => p.includes('ollama.exe') && opts.exeExists,
    runPowerShell: async (cmd) => {
      psCommands.push(cmd)
      if (cmd.includes('winget --version')) {
        if (!opts.winget) throw new Error('not recognized')
        return 'v1.29\r\n'
      }
      return ''
    },
  })
  return { installer: createOllamaInstaller(system), psCommands }
}

describe('createOllamaInstaller', () => {
  it('plans nothing when the exe is present', async () => {
    const { installer } = world({ exeExists: true, winget: true })
    const plan = await installer.plan()
    expect(plan.installed).not.toBeNull()
    expect(plan.actions).toEqual([])
    expect(await installer.verify()).toBe(true)
  })

  it('plans a silent winget install when absent', async () => {
    const { installer } = world({ exeExists: false, winget: true })
    const plan = await installer.plan()
    expect(plan.installed).toBeNull()
    expect(plan.actions.join(' ')).toContain('winget')
    expect(plan.blockers).toEqual([])
    expect(plan.downloadMb).toBeGreaterThan(100)
  })

  it('blocks when winget is unavailable', async () => {
    const { installer } = world({ exeExists: false, winget: false })
    const plan = await installer.plan()
    expect(plan.blockers.join(' ')).toMatch(/winget/i)
  })

  it('install runs winget silently with agreements accepted', async () => {
    const { installer, psCommands } = world({ exeExists: false, winget: true })
    await installer.install()
    const cmd = psCommands.find((c) => c.includes('winget install'))!
    expect(cmd).toContain('Ollama.Ollama')
    expect(cmd).toContain('--silent')
    expect(cmd).toContain('--accept-package-agreements')
    // Must pin the winget source or a fresh machine's msstore cert failure aborts it.
    expect(cmd).toContain('--source winget')
  })
})
