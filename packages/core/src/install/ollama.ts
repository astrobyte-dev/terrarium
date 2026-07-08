import type { SystemPort } from '../system/system-port'
import type { ComponentInstaller } from './types'
import { safe } from '../util/safe'

// --source winget is required: a fresh Windows machine's msstore source often
// cert-fails (0x8a15005e), which makes an unsourced install ambiguous and abort
// (found live on a clean VM, 2026-07-08). Pinning the source avoids msstore.
const WINGET_INSTALL =
  'winget install --id Ollama.Ollama --source winget --exact --silent --accept-package-agreements --accept-source-agreements --disable-interactivity'

export function createOllamaInstaller(system: SystemPort): ComponentInstaller {
  const exePath = () => `${system.env('LOCALAPPDATA') ?? ''}\\Programs\\Ollama\\ollama.exe`
  const wingetAvailable = async () =>
    (await safe(() => system.runPowerShell('winget --version'), '')).trim() !== ''

  return {
    id: 'ollama',

    async plan() {
      if (await system.fileExists(exePath())) {
        return {
          id: 'ollama',
          installed: { version: null, path: exePath() },
          actions: [],
          downloadMb: 0,
          diskNeededMb: 0,
          blockers: [],
        }
      }
      const blockers = (await wingetAvailable())
        ? []
        : ['winget is not available — install Ollama manually from ollama.com/download']
      return {
        id: 'ollama',
        installed: null,
        actions: ['winget install Ollama.Ollama (silent)'],
        downloadMb: 700,
        diskNeededMb: 2000,
        blockers,
      }
    },

    async install(onProgress) {
      if (await system.fileExists(exePath())) return { ok: true, message: 'ollama already installed' }
      onProgress?.({ component: 'ollama', phase: 'winget install Ollama.Ollama', percent: null })
      await system.runPowerShell(WINGET_INSTALL)
      const ok = await system.fileExists(exePath())
      return { ok, message: ok ? 'ollama installed' : 'winget finished but ollama.exe not found' }
    },

    verify: () => system.fileExists(exePath()),
  }
}
