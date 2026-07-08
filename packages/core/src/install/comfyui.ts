import type { SystemPort } from '../system/system-port'
import type { ComponentInstaller, ComponentPlan, InstallOutcome, OnProgress } from './types'
import { downloadFile } from './download'
import { safe } from '../util/safe'

// Pinned portable build (bundled Python + CUDA torch) — reproducible on any
// NVIDIA machine, unlike a git clone against whatever system Python exists.
export const COMFYUI_VERSION = 'v0.27.0'
const PORTABLE_ASSET = 'ComfyUI_windows_portable_nvidia.7z'
const PORTABLE_URL = `https://github.com/comfyanonymous/ComfyUI/releases/download/${COMFYUI_VERSION}/${PORTABLE_ASSET}`
const PORTABLE_BYTES = 2_090_000_000 // ~2.09 GB, for the disk precheck and progress
export const MANAGED_COMFY_PORT = 8189 // never collides with an adopted C:\ComfyUI on 8188

// 7-Zip's official silent (NSIS /S) installer, pinned. Installed by direct
// download rather than via winget, whose 7zip.7zip package can hang forever with
// no error on a fresh machine (found live on a clean VM, 2026-07-08).
const SEVENZIP_URL = 'https://www.7-zip.org/a/7z2408-x64.exe'

export interface ComfyuiInstallerOptions {
  system: SystemPort
  /** Managed install root; defaults to C:\Terrarium\comfyui (needs real disk, not %LOCALAPPDATA%). */
  managedDir?: string
  downloadImpl?: typeof downloadFile
}

export function createComfyuiInstaller(opts: ComfyuiInstallerOptions): ComponentInstaller {
  const { system } = opts
  const managedDir = opts.managedDir ?? 'C:\\Terrarium\\comfyui'
  const download = opts.downloadImpl ?? downloadFile
  const archivePath = `${managedDir}\\${PORTABLE_ASSET}`
  const runtimeMain = `${managedDir}\\ComfyUI_windows_portable\\ComfyUI\\main.py`
  const embeddedPython = `${managedDir}\\ComfyUI_windows_portable\\python_embeded\\python.exe`

  const adoptedMain = 'C:\\ComfyUI\\main.py'

  async function sevenZipExe(): Promise<string | null> {
    for (const p of [
      'C:\\Program Files\\7-Zip\\7z.exe',
      `${system.env('LOCALAPPDATA') ?? ''}\\Microsoft\\WinGet\\Links\\7z.exe`,
    ]) {
      if (await system.fileExists(p)) return p
    }
    return null
  }

  return {
    id: 'comfyui',

    async plan(): Promise<ComponentPlan> {
      // A managed portable install wins; else adopt an existing C:\ComfyUI.
      if (await system.fileExists(runtimeMain)) {
        return zeroPlan(managedDir, 'managed')
      }
      if (await system.fileExists(adoptedMain)) {
        return zeroPlan('C:\\ComfyUI', 'adopted')
      }
      const freeMb = await safe(() => system.freeDiskMb('C:'), 0)
      const diskNeededMb = 8000 // archive + extraction headroom (models added later)
      const blockers = freeMb < diskNeededMb ? [`only ${Math.round(freeMb / 1000)} GB free on C: — need ~8 GB`] : []
      return {
        id: 'comfyui',
        installed: null,
        actions: [
          `download ComfyUI portable ${COMFYUI_VERSION} (bundled Python + CUDA) — ~2 GB`,
          'ensure 7-Zip (winget) and extract to the managed dir',
          `boot on port ${MANAGED_COMFY_PORT} and verify`,
          'models + custom nodes are a follow-up step',
        ],
        downloadMb: Math.round(PORTABLE_BYTES / 1_000_000),
        diskNeededMb,
        blockers,
      }
    },

    async install(onProgress?: OnProgress): Promise<InstallOutcome> {
      if (await system.fileExists(runtimeMain)) return { ok: true, message: 'managed ComfyUI already installed' }

      await system.ensureDir(managedDir)
      onProgress?.({ component: 'comfyui', phase: 'downloading portable', percent: 0 })
      const dl = await download(PORTABLE_URL, archivePath, {
        expectedBytes: PORTABLE_BYTES,
        onProgress: (p) => onProgress?.({ component: 'comfyui', phase: 'downloading portable', percent: p.percent }),
      })
      if (!dl.ok) return { ok: false, message: `portable download failed: ${dl.message}` }

      const sevenZip = await ensureSevenZip(system, onProgress)
      if (sevenZip === null) {
        return { ok: false, message: '7-Zip is required to extract the portable archive and could not be installed' }
      }

      onProgress?.({ component: 'comfyui', phase: 'extracting (embedded torch is large)', percent: null })
      await system.runPowerShell(`& '${sevenZip}' x '${archivePath}' -o'${managedDir}' -y`)
      if (!(await system.fileExists(runtimeMain))) {
        return { ok: false, message: 'extraction finished but ComfyUI\\main.py is missing' }
      }
      // Reclaim the ~2 GB archive once the extraction is verified.
      await safe(() => system.deleteFile(archivePath), undefined)
      return { ok: true, message: `ComfyUI portable ${COMFYUI_VERSION} installed to ${managedDir}` }
    },

    verify: () => system.fileExists(runtimeMain),
  }

  function zeroPlan(path: string, _mode: 'managed' | 'adopted'): ComponentPlan {
    return { id: 'comfyui', installed: { version: COMFYUI_VERSION, path }, actions: [], downloadMb: 0, diskNeededMb: 0, blockers: [] }
  }

  async function ensureSevenZip(sys: SystemPort, onProgress?: OnProgress): Promise<string | null> {
    const existing = await sevenZipExe()
    if (existing !== null) return existing
    // Direct download + silent install. winget's 7zip.7zip hangs indefinitely on
    // fresh machines, so it is deliberately not used here.
    onProgress?.({ component: 'comfyui', phase: 'installing 7-Zip', percent: null })
    const installerPath = `${managedDir}\\7z-setup.exe`
    const dl = await download(SEVENZIP_URL, installerPath)
    if (!dl.ok) return null
    await safe(() => sys.runPowerShell(`Start-Process -FilePath '${installerPath}' -ArgumentList '/S' -Wait`), '')
    await safe(() => sys.deleteFile(installerPath), undefined)
    return sevenZipExe()
  }
}

/**
 * Spawn spec for the managed portable runtime. Verification scripts use the
 * default port 8189 (never collides with a live 8188); once ADOPTED as the
 * real service it runs on 8188 so the pic pipeline's URL keeps working.
 */
export function managedComfySpawn(managedDir = 'C:\\Terrarium\\comfyui', port: number = MANAGED_COMFY_PORT) {
  const base = `${managedDir}\\ComfyUI_windows_portable`
  return {
    command: `${base}\\python_embeded\\python.exe`,
    args: ['-s', 'ComfyUI\\main.py', '--listen', '127.0.0.1', '--port', String(port), '--reserve-vram', '1.0'],
    cwd: base,
    env: { PYTHONUTF8: '1', PYTHONUNBUFFERED: '1' },
  }
}
