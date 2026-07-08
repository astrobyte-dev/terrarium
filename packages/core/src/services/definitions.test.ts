import { describe, expect, it } from 'vitest'
import type { ProcessInfo } from '../types'
import { serviceDefinitions } from './definitions'

// Command lines exactly as they appear on the live machine (Win32_Process).
const LIVE: ProcessInfo[] = [
  {
    pid: 1,
    name: 'node.exe',
    commandLine:
      '"C:\\Program Files\\nodejs\\node.exe" C:\\Users\\thr3e\\AppData\\Roaming\\npm\\node_modules\\openclaw\\dist\\index.js gateway --port 18789',
  },
  {
    pid: 2,
    name: 'python.exe',
    // note: no "ComfyUI" substring — launched cwd-relative by the watchdog
    commandLine: 'C:\\Python314\\python.exe main.py --listen 127.0.0.1 --port 8188 --reserve-vram 1.0',
  },
  {
    pid: 3,
    name: 'pythonw.exe',
    commandLine:
      'C:\\Python314\\pythonw.exe "C:\\Users\\thr3e\\.openclaw\\workspace\\skills\\comfyui-imagegen\\pic_daemon.py"',
  },
  { pid: 4, name: 'ollama app.exe', commandLine: '' },
  { pid: 5, name: 'node.exe', commandLine: 'node some-other-app.js' },
  { pid: 6, name: 'python.exe', commandLine: 'python train.py --port 6006' },
]

function match(id: string) {
  const env = (name: string) =>
    ({ LOCALAPPDATA: 'C:\\U\\l', APPDATA: 'C:\\U\\r', USERPROFILE: 'C:\\U' })[name]
  const def = serviceDefinitions(env).find((d) => d.id === id)!
  return LIVE.filter((p) => def.matchProcess(p)).map((p) => p.pid)
}

describe('pinned openclaw preference', () => {
  const env = (name: string) =>
    ({ LOCALAPPDATA: 'C:\\LAD', APPDATA: 'C:\\RAD', USERPROFILE: 'C:\\U' })[name]
  const PINNED = 'C:\\LAD\\Terrarium\\runtime\\node_modules\\openclaw'
  const GLOBAL = 'C:\\RAD\\npm\\node_modules\\openclaw'

  function sysWith(existing: string[]) {
    return {
      fileExists: async (p: string) => existing.some((e) => p.startsWith(e)),
      readTextFile: async () => JSON.stringify({ version: '2026.6.11' }),
    } as never
  }

  it('uses the Terrarium-pinned copy when present (managed)', async () => {
    const def = serviceDefinitions(env).find((d) => d.id === 'gateway')!
    const install = await def.detectInstall(sysWith([PINNED, GLOBAL]))
    expect(install?.mode).toBe('managed')
    expect(install?.path).toBe(PINNED)
    const spec = (await def.spawn(sysWith([PINNED, GLOBAL])))!
    expect(spec.args[0]).toContain('Terrarium\\runtime')
  })

  it('falls back to the global npm copy (adopted)', async () => {
    const def = serviceDefinitions(env).find((d) => d.id === 'gateway')!
    const install = await def.detectInstall(sysWith([GLOBAL]))
    expect(install?.mode).toBe('adopted')
    const spec = (await def.spawn(sysWith([GLOBAL])))!
    expect(spec.args[0]).toContain('npm\\node_modules')
  })
})

describe('managed comfyui preference (M4e adopt)', () => {
  const env = (name: string) =>
    ({ LOCALAPPDATA: 'C:\\U\\l', APPDATA: 'C:\\U\\r', USERPROFILE: 'C:\\U' })[name]
  const MANAGED = 'C:\\Terrarium\\comfyui\\ComfyUI_windows_portable'
  const LIVE_DIR = 'C:\\ComfyUI'

  function sysWith(existing: string[]) {
    return { fileExists: async (p: string) => existing.some((e) => p.startsWith(e)) } as never
  }

  it('uses the managed portable when present — embedded python, SAME port 8188', async () => {
    const def = serviceDefinitions(env).find((d) => d.id === 'comfyui')!
    const install = await def.detectInstall(sysWith([MANAGED, LIVE_DIR]))
    expect(install?.mode).toBe('managed')
    const spec = (await def.spawn(sysWith([MANAGED, LIVE_DIR])))!
    expect(spec.command).toContain('python_embeded')
    expect(spec.args).toContain('8188') // the pic pipeline's URL keeps working untouched
    expect(def.port).toBe(8188)
  })

  it('falls back to C:\\ComfyUI (adopted) when no managed install exists', async () => {
    const def = serviceDefinitions(env).find((d) => d.id === 'comfyui')!
    const install = await def.detectInstall(sysWith([LIVE_DIR]))
    expect(install?.mode).toBe('adopted')
    const spec = (await def.spawn(sysWith([LIVE_DIR])))!
    expect(spec.command).not.toContain('python_embeded')
    expect(spec.cwd).toBe(LIVE_DIR)
  })

  it('matches the managed portable process command line too', () => {
    const def = serviceDefinitions(env).find((d) => d.id === 'comfyui')!
    const managed: ProcessInfo = {
      pid: 9,
      name: 'python.exe',
      commandLine: `${MANAGED}\\python_embeded\\python.exe -s ComfyUI\\main.py --listen 127.0.0.1 --port 8188 --reserve-vram 1.0`,
    }
    expect(def.matchProcess(managed)).toBe(true)
  })
})

describe('secret injection into spawn env', () => {
  const env = (name: string) =>
    ({ LOCALAPPDATA: 'C:\\U\\l', APPDATA: 'C:\\U\\r', USERPROFILE: 'C:\\U' })[name]
  const store = {
    get: async (n: string) =>
      ({ 'telegram-bot-token': 'TG-X', 'arliai-api-key': 'AR-X', 'anthropic-api-key': 'ANT-X' })[n] ?? null,
  }
  const sys = { fileExists: async () => true } as never

  it('gateway spawn env carries the token and provider keys that exist', async () => {
    const def = serviceDefinitions(env, store).find((d) => d.id === 'gateway')!
    const spec = (await def.spawn(sys))!
    expect(spec.env?.TELEGRAM_BOT_TOKEN).toBe('TG-X')
    expect(spec.env?.ARLIAI_API_KEY).toBe('AR-X')
    expect(spec.env?.ANTHROPIC_API_KEY).toBe('ANT-X') // the Claude door rides the same channel
    expect(spec.env?.OLLAMA_API_KEY).toBeUndefined() // not in store — omitted
    expect(spec.args.join(' ')).not.toContain('TG-X') // never on the command line
  })

  it('daemon spawn env carries only the telegram token', async () => {
    const def = serviceDefinitions(env, store).find((d) => d.id === 'picDaemon')!
    const spec = (await def.spawn(sys))!
    expect(spec.env?.TELEGRAM_BOT_TOKEN).toBe('TG-X')
    expect(spec.env?.ARLIAI_API_KEY).toBeUndefined()
  })

  it('without a store, spawn env has no secret entries', async () => {
    const def = serviceDefinitions(env).find((d) => d.id === 'gateway')!
    const spec = (await def.spawn(sys))!
    expect(spec.env?.TELEGRAM_BOT_TOKEN).toBeUndefined()
  })
})

describe('service process matchers against live command lines', () => {
  it('finds exactly the gateway node process', () => {
    expect(match('gateway')).toEqual([1])
  })
  it('finds exactly the ComfyUI python process', () => {
    expect(match('comfyui')).toEqual([2])
  })
  it('finds exactly the pic daemon', () => {
    expect(match('picDaemon')).toEqual([3])
  })
  it('finds the ollama app', () => {
    expect(match('ollama')).toEqual([4])
  })
})
