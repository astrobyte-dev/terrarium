import type { SystemPort } from '../system/system-port'
import type { ComponentInstaller } from './types'

/**
 * The OpenClaw version Terrarium is built against. Pinning is real only when
 * we own the install — the user's global npm copy can drift with any
 * `npm update -g`, so ours lives in an app-owned prefix.
 */
export const OPENCLAW_PIN = '2026.6.11'

export const runtimePrefix = (sys: SystemPort) => `${sys.env('LOCALAPPDATA') ?? ''}\\Terrarium\\runtime`
export const pinnedOpenclawDir = (sys: SystemPort) => `${runtimePrefix(sys)}\\node_modules\\openclaw`

export function createOpenclawInstaller(system: SystemPort): ComponentInstaller {
  async function pinnedVersion(): Promise<string | null> {
    const pkgPath = `${pinnedOpenclawDir(system)}\\package.json`
    if (!(await system.fileExists(pkgPath))) return null
    try {
      const pkg = JSON.parse(await system.readTextFile(pkgPath)) as { version?: string }
      return pkg.version ?? null
    } catch {
      return null
    }
  }

  return {
    id: 'openclaw',

    async plan() {
      const version = await pinnedVersion()
      const upToDate = version === OPENCLAW_PIN
      return {
        id: 'openclaw',
        installed: version === null ? null : { version, path: pinnedOpenclawDir(system) },
        actions: upToDate
          ? []
          : [`npm install openclaw@${OPENCLAW_PIN} into the Terrarium runtime (global copy untouched)`],
        downloadMb: upToDate ? 0 : 25,
        diskNeededMb: upToDate ? 0 : 300,
        blockers: [],
      }
    },

    async install(onProgress) {
      onProgress?.({ component: 'openclaw', phase: `npm install openclaw@${OPENCLAW_PIN}`, percent: null })
      await system.ensureDir(runtimePrefix(system))
      await system.runPowerShell(
        `npm install openclaw@${OPENCLAW_PIN} --prefix "${runtimePrefix(system)}" --no-audit --no-fund --loglevel=error`,
      )
      const ok = (await pinnedVersion()) === OPENCLAW_PIN
      return {
        ok,
        message: ok
          ? `openclaw@${OPENCLAW_PIN} pinned in Terrarium runtime`
          : 'npm install finished but the pinned version does not verify',
      }
    },

    verify: async () => (await pinnedVersion()) === OPENCLAW_PIN,
  }
}
