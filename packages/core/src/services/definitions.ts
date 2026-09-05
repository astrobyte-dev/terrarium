import type { InstallInfo, ProcessInfo, ServiceId } from '../types'
import type { SpawnSpec, SystemPort } from '../system/system-port'
import { pickNewest } from '../logs/newest-file'
import { parseDaemonLine, parseOpenclawLine, parsePlainLine, type ParsedLine } from '../logs/parse'
import { COMFYUI_VERSION, managedComfySpawn } from '../install/comfyui'

export type EnvReader = (name: string) => string | undefined

/** Read-only view of the secret store (definitions must not write secrets). */
export interface SecretReader {
  get(name: string): Promise<string | null>
}

export interface ServiceDefinition {
  id: ServiceId
  name: string
  port: number | null
  /** Services start tier by tier: 0 (backends) → 1 (gateway) → 2 (daemon). */
  startTier: number
  /** 'adopt': a healthy stray on our port is fine. 'strict': duplicates are dangerous. */
  strayPolicy: 'adopt' | 'strict'
  readyTimeoutMs: number
  readySettleMs?: number
  restartCooldownMs?: number
  quietAfterMs: number | null
  wedgedAfterMs: number | null
  detectInstall(sys: SystemPort): Promise<InstallInfo | null>
  matchProcess(p: ProcessInfo): boolean
  spawn(sys: SystemPort): Promise<SpawnSpec | null>
  resolveLogFile: ((sys: SystemPort) => Promise<string | null>) | null
  parseLine: (raw: string) => ParsedLine | null
}

const MIN = 60_000
// Machine-specific paths; the manifest makes these configurable in M3.
const COMFY_DIR = 'C:\\ComfyUI'
const PYTHON = 'C:\\Python314\\python.exe'
// Terrarium's assembled portable (install/comfyui.ts + assemble). Like the
// pinned gateway, it wins over an existing C:\ComfyUI once present — and it
// serves on the SAME port so the pic pipeline's URL never changes.
const MANAGED_COMFY_DIR = 'C:\\Terrarium\\comfyui'
const MANAGED_COMFY_MAIN = `${MANAGED_COMFY_DIR}\\ComfyUI_windows_portable\\ComfyUI\\main.py`

export function serviceDefinitions(
  env: EnvReader,
  secrets: SecretReader | null = null,
): ServiceDefinition[] {
  const localAppData = env('LOCALAPPDATA') ?? ''
  const appData = env('APPDATA') ?? ''
  const userProfile = env('USERPROFILE') ?? ''

  // Secrets ride the child environment — never command lines, never config
  // (the env-refs openclaw.json resolves these exact variable names).
  async function secretEnv(names: Record<string, string>): Promise<Record<string, string>> {
    if (secrets === null) return {}
    const out: Record<string, string> = {}
    for (const [envName, secretName] of Object.entries(names)) {
      const value = await secrets.get(secretName)
      if (value !== null) out[envName] = value
    }
    return out
  }
  const openclawPkgDir = `${appData}\\npm\\node_modules\\openclaw`
  // Terrarium's own pinned copy (install/openclaw.ts) wins over the global
  // npm install — version pinning is only real when we own the files.
  const pinnedOpenclawDir = `${localAppData}\\Terrarium\\runtime\\node_modules\\openclaw`
  const openclawLogDir = `${localAppData}\\Temp\\openclaw`
  const daemonDir = `${userProfile}\\.openclaw\\workspace\\skills\\comfyui-imagegen`

  return [
    {
      id: 'inference', name: 'Inference Coordinator', port: 18790, startTier: 0.5,
      strayPolicy: 'adopt', readyTimeoutMs: 30_000, quietAfterMs: null, wedgedAfterMs: null,
      detectInstall: async (sys) => {
        const path = `${localAppData}\\Terrarium\\runtime\\inference-server.cjs`
        return await sys.fileExists(path) ? { path, version: '1', mode: 'managed' } : null
      },
      matchProcess: p => p.commandLine.includes('inference-server.cjs'),
      spawn: async sys => {
        const script = `${localAppData}\\Terrarium\\runtime\\inference-server.cjs`
        if (!await sys.fileExists(script)) return null
        return { command: process.execPath, args: [script], env: { ELECTRON_RUN_AS_NODE: '1' } }
      },
      resolveLogFile: null, parseLine: parsePlainLine,
    },
    {
      id: 'gateway',
      name: 'OpenClaw Gateway',
      port: 18789,
      startTier: 1,
      strayPolicy: 'strict', // duplicate gateways = session poison
      readyTimeoutMs: 90_000, // port binds ~15-20 s after process start
      restartCooldownMs: 5000, // rapid restarts mid-reply have poisoned sessions
      quietAfterMs: 15 * MIN,
      wedgedAfterMs: 60 * MIN,
      detectInstall: async (sys) => {
        const pinnedPkg = `${pinnedOpenclawDir}\\package.json`
        if (await sys.fileExists(pinnedPkg)) {
          return { path: pinnedOpenclawDir, version: await readPkgVersion(sys, pinnedPkg), mode: 'managed' }
        }
        const pkgPath = `${openclawPkgDir}\\package.json`
        if (!(await sys.fileExists(pkgPath))) return null
        return { path: openclawPkgDir, version: await readPkgVersion(sys, pkgPath), mode: 'adopted' }
      },
      matchProcess: (p) =>
        p.name.toLowerCase() === 'node.exe' &&
        p.commandLine.toLowerCase().includes('openclaw') &&
        p.commandLine.toLowerCase().includes('gateway'),
      spawn: async (sys) => {
        const pinnedScript = `${pinnedOpenclawDir}\\dist\\index.js`
        const script = (await sys.fileExists(pinnedScript))
          ? pinnedScript
          : `${openclawPkgDir}\\dist\\index.js`
        if (!(await sys.fileExists(script))) return null
        return {
          command: process.execPath,
          args: [script, 'gateway', '--port', '18789'],
          env: {
            // TMPDIR keeps the JSONL log where the tailer watches (gateway.cmd parity).
            TMPDIR: `${localAppData}\\Temp`,
            OPENCLAW_GATEWAY_PORT: '18789',
            ...(await secretEnv({
              TELEGRAM_BOT_TOKEN: 'telegram-bot-token',
              ARLIAI_API_KEY: 'arliai-api-key',
              OLLAMA_API_KEY: 'ollama-api-key',
              ANTHROPIC_API_KEY: 'anthropic-api-key', // absent from the store → omitted
              VENICE_API_KEY: 'venice-api-key',
            })),
          },
        }
      },
      resolveLogFile: async (sys) => {
        const name = pickNewest(await sys.listDir(openclawLogDir), /^openclaw-.*\.log$/)
        return name === null ? null : `${openclawLogDir}\\${name}`
      },
      parseLine: parseOpenclawLine,
    },
    {
      id: 'ollama',
      name: 'Ollama',
      port: 11434,
      startTier: 0,
      strayPolicy: 'adopt', // e.g. the Ollama tray app re-bound the port after reboot
      readyTimeoutMs: 60_000,
      quietAfterMs: null,
      wedgedAfterMs: null,
      detectInstall: async (sys) => {
        const exe = `${localAppData}\\Programs\\Ollama\\ollama.exe`
        if (!(await sys.fileExists(exe))) return null
        return { path: exe, version: null, mode: 'adopted' }
      },
      matchProcess: (p) => p.name.toLowerCase().startsWith('ollama'),
      spawn: async (sys) => {
        const exe = `${localAppData}\\Programs\\Ollama\\ollama.exe`
        if (!(await sys.fileExists(exe))) return null
        let tuned = false
        try { tuned = JSON.parse(await sys.readTextFile(`${localAppData}\\Terrarium\\performance.json`)).enabled === true } catch { /* default profile */ }
        return { command: exe, args: ['serve'], ...(tuned ? { env: {
          OLLAMA_FLASH_ATTENTION: '1', OLLAMA_KV_CACHE_TYPE: 'q8_0', OLLAMA_NUM_PARALLEL: '1', OLLAMA_MAX_LOADED_MODELS: '1',
        } } : {}) }
      },
      resolveLogFile: async () => `${localAppData}\\Ollama\\server.log`,
      parseLine: parsePlainLine,
    },
    {
      id: 'comfyui',
      name: 'ComfyUI',
      port: 8188,
      startTier: 0,
      strayPolicy: 'adopt', // restart costs a ~30 s checkpoint reload; adopt if healthy
      readyTimeoutMs: 240_000, // cold start loads models
      quietAfterMs: null,
      wedgedAfterMs: null,
      detectInstall: async (sys) => {
        if (await sys.fileExists(MANAGED_COMFY_MAIN)) {
          return { path: MANAGED_COMFY_DIR, version: COMFYUI_VERSION, mode: 'managed' }
        }
        if (!(await sys.fileExists(`${COMFY_DIR}\\main.py`))) return null
        return { path: COMFY_DIR, version: null, mode: 'adopted' }
      },
      // Its command line has no "comfyui" substring (cwd-relative main.py launch).
      matchProcess: (p) =>
        p.name.toLowerCase().startsWith('python') &&
        p.commandLine.includes('main.py') &&
        p.commandLine.includes('8188'),
      spawn: async (sys) => {
        let tuned = false
        try { tuned = JSON.parse(await sys.readTextFile(`${localAppData}\\Terrarium\\performance.json`)).enabled === true } catch { /* opt in */ }
        if (await sys.fileExists(MANAGED_COMFY_MAIN)) {
          const spec = managedComfySpawn(MANAGED_COMFY_DIR, 8188)
          if (tuned) { spec.args[spec.args.indexOf('--reserve-vram') + 1] = '1.5'; spec.args.push('--cache-ram', '6') }
          return spec
        }
        if (!(await sys.fileExists(`${COMFY_DIR}\\main.py`))) return null
        return {
          command: PYTHON,
          args: ['main.py', '--listen', '127.0.0.1', '--port', '8188', '--reserve-vram', tuned ? '1.5' : '1.0', ...(tuned ? ['--cache-ram', '6'] : [])],
          cwd: COMFY_DIR,
          env: { PYTHONUTF8: '1', PYTHONUNBUFFERED: '1' },
        }
      },
      resolveLogFile: null, // no log file; owned mode pipes its stdout instead
      parseLine: parsePlainLine,
    },
    {
      id: 'picDaemon',
      name: 'Pic Daemon',
      port: null,
      startTier: 2,
      strayPolicy: 'strict', // two daemons would double-send photos
      readyTimeoutMs: 10_000,
      readySettleMs: 2000,
      quietAfterMs: null,
      wedgedAfterMs: null,
      detectInstall: async (sys) => {
        const script = `${daemonDir}\\pic_daemon.py`
        if (!(await sys.fileExists(script))) return null
        return { path: script, version: null, mode: 'adopted' }
      },
      matchProcess: (p) =>
        p.name.toLowerCase().startsWith('python') && p.commandLine.includes('pic_daemon.py'),
      spawn: async (sys) => {
        const script = `${daemonDir}\\pic_daemon.py`
        if (!(await sys.fileExists(script))) return null
        // python (not pythonw): as our hidden child, stdout feeds the log pane.
        return {
          command: PYTHON,
          args: [script],
          cwd: daemonDir,
          env: {
            PYTHONUNBUFFERED: '1',
            ...(await secretEnv({ TELEGRAM_BOT_TOKEN: 'telegram-bot-token' })),
          },
        }
      },
      resolveLogFile: async () => `${daemonDir}\\daemon.log`,
      parseLine: parseDaemonLine,
    },
  ]
}

async function readPkgVersion(sys: SystemPort, pkgPath: string): Promise<string | null> {
  try {
    const pkg = JSON.parse(await sys.readTextFile(pkgPath)) as { version?: string }
    return typeof pkg.version === 'string' ? pkg.version : null
  } catch {
    return null
  }
}
