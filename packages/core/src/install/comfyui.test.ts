import { describe, expect, it, vi } from 'vitest'
import { makeFakeSystem } from '../test/fake-system'
import { COMFYUI_VERSION, MANAGED_COMFY_PORT, createComfyuiInstaller, managedComfySpawn } from './comfyui'
import type { DownloadResult } from './download'

const MANAGED_MAIN = 'C:\\Terrarium\\comfyui\\ComfyUI_windows_portable\\ComfyUI\\main.py'
const ADOPTED_MAIN = 'C:\\ComfyUI\\main.py'

function world(present: string[], opts: { freeMb?: number } = {}) {
  const ps: string[] = []
  const system = makeFakeSystem({
    env: (n) => (n === 'LOCALAPPDATA' ? 'C:\\LAD' : undefined),
    fileExists: async (p) => present.includes(p),
    freeDiskMb: async () => opts.freeMb ?? 500_000,
    runPowerShell: async (cmd) => {
      ps.push(cmd)
      return ''
    },
  })
  return { system, ps }
}

describe('createComfyuiInstaller.plan', () => {
  it('reports a managed portable install when present', async () => {
    const { system } = world([MANAGED_MAIN])
    const plan = await createComfyuiInstaller({ system }).plan()
    expect(plan.installed?.path).toBe('C:\\Terrarium\\comfyui')
    expect(plan.actions).toEqual([])
  })

  it('adopts an existing C:\\ComfyUI when there is no managed install', async () => {
    const { system } = world([ADOPTED_MAIN])
    const plan = await createComfyuiInstaller({ system }).plan()
    expect(plan.installed?.path).toBe('C:\\ComfyUI')
    expect(plan.actions).toEqual([])
  })

  it('plans a portable download with honest ~2 GB size when nothing exists', async () => {
    const { system } = world([])
    const plan = await createComfyuiInstaller({ system }).plan()
    expect(plan.installed).toBeNull()
    expect(plan.downloadMb).toBeGreaterThan(1500)
    expect(plan.actions.join(' ')).toMatch(/portable/i)
    expect(plan.blockers).toEqual([])
  })

  it('blocks when disk is too tight', async () => {
    const { system } = world([], { freeMb: 3000 })
    const plan = await createComfyuiInstaller({ system }).plan()
    expect(plan.blockers.join(' ')).toMatch(/GB free/)
  })
})

describe('createComfyuiInstaller.install', () => {
  it('downloads, ensures 7-Zip, extracts, and verifies main.py appears', async () => {
    // main.py is absent at plan/download time, present after "extraction".
    let extracted = false
    const ps: string[] = []
    const system = makeFakeSystem({
      env: (n) => (n === 'LOCALAPPDATA' ? 'C:\\LAD' : undefined),
      fileExists: async (p) => {
        if (p === MANAGED_MAIN) return extracted
        if (p === 'C:\\Program Files\\7-Zip\\7z.exe') return true
        return false
      },
      runPowerShell: async (cmd) => {
        ps.push(cmd)
        if (cmd.includes('7z.exe') || cmd.includes('7z ')) extracted = true
        return ''
      },
    })
    const deleted: string[] = []
    system.deleteFile = async (p) => void deleted.push(p)
    const download = vi.fn(async (): Promise<DownloadResult> => ({ ok: true, bytes: 1, message: 'ok' }))
    const outcome = await createComfyuiInstaller({ system, downloadImpl: download as never }).install()
    expect(download).toHaveBeenCalledOnce()
    expect(ps.some((c) => c.includes('7z.exe') && c.includes(' x '))).toBe(true)
    expect(outcome.ok).toBe(true)
    expect(outcome.message).toMatch(new RegExp(COMFYUI_VERSION))
    expect(deleted.some((p) => p.endsWith('.7z'))).toBe(true) // archive reclaimed
  })

  it('fails clearly when the download fails', async () => {
    const { system } = world([])
    const download = vi.fn(async (): Promise<DownloadResult> => ({ ok: false, bytes: 0, message: 'HTTP 500' }))
    const outcome = await createComfyuiInstaller({ system, downloadImpl: download as never }).install()
    expect(outcome.ok).toBe(false)
    expect(outcome.message).toMatch(/download failed/)
  })

  it('installs 7-Zip by direct download (never winget) when it is absent', async () => {
    // winget's 7zip.7zip hangs forever on fresh machines — must be avoided.
    let extracted = false
    let sevenZip = false
    const ps: string[] = []
    const system = makeFakeSystem({
      env: (n) => (n === 'LOCALAPPDATA' ? 'C:\\LAD' : undefined),
      fileExists: async (p) => {
        if (p === MANAGED_MAIN) return extracted
        if (p === 'C:\\Program Files\\7-Zip\\7z.exe') return sevenZip
        return false
      },
      runPowerShell: async (cmd) => {
        ps.push(cmd)
        if (cmd.includes('7z-setup.exe')) sevenZip = true // silent 7-Zip install succeeded
        if (cmd.includes('7z.exe') && cmd.includes(' x ')) extracted = true
        return ''
      },
    })
    system.deleteFile = async () => {}
    const urls: string[] = []
    const download = vi.fn(async (url: string): Promise<DownloadResult> => {
      urls.push(url)
      return { ok: true, bytes: 1, message: 'ok' }
    })
    const outcome = await createComfyuiInstaller({ system, downloadImpl: download as never }).install()

    expect(outcome.ok).toBe(true)
    expect(ps.some((c) => /winget/i.test(c))).toBe(false) // regression: no flaky winget
    expect(urls.some((u) => u.includes('7-zip.org'))).toBe(true) // direct 7-Zip download
    expect(ps.some((c) => c.includes('7z-setup.exe') && c.includes('/S'))).toBe(true) // silent install
  })
})

describe('managedComfySpawn', () => {
  it('runs the embedded python on the non-colliding managed port', () => {
    const spec = managedComfySpawn()
    expect(spec.command).toContain('python_embeded\\python.exe')
    expect(spec.args).toContain(String(MANAGED_COMFY_PORT))
    expect(spec.args.some((a) => a.includes('main.py'))).toBe(true)
  })
})
