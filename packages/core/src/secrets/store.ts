import type { SystemPort } from '../system/system-port'

export interface SecretStore {
  get(name: string): Promise<string | null>
  set(name: string, value: string): Promise<void>
  delete(name: string): Promise<void>
  list(): Promise<string[]>
}

/** Canonical secret names used across Terrarium. */
export const SECRET_NAMES = {
  telegramBotToken: 'telegram-bot-token',
  arliaiApiKey: 'arliai-api-key',
  ollamaApiKey: 'ollama-api-key',
  gatewayAuthToken: 'gateway-auth-token',
  anthropicApiKey: 'anthropic-api-key', // optional — captured only when the user opens the Claude door
} as const

// Values travel via env vars (never command lines); DPAPI binds the blobs to
// this Windows user + machine, so secrets.json is useless copied elsewhere.
const ENCRYPT_CMD =
  'ConvertTo-SecureString -String $env:TERRARIUM_SECRET -AsPlainText -Force | ConvertFrom-SecureString'
const DECRYPT_CMD =
  '$ss = ConvertTo-SecureString -String $env:TERRARIUM_BLOB; ' +
  '[Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($ss))'

export function createDpapiSecretStore(system: SystemPort): SecretStore {
  const dir = () => `${system.env('LOCALAPPDATA') ?? ''}\\Terrarium`
  const path = () => `${dir()}\\secrets.json`

  async function readAll(): Promise<Record<string, string>> {
    try {
      return JSON.parse(await system.readTextFile(path())) as Record<string, string>
    } catch {
      return {}
    }
  }

  async function writeAll(all: Record<string, string>): Promise<void> {
    await system.ensureDir(dir())
    await system.writeTextFile(path(), JSON.stringify(all, null, 2))
  }

  return {
    async get(name) {
      const blob = (await readAll())[name]
      if (blob === undefined) return null
      const out = await system.runPowerShell(DECRYPT_CMD, { env: { TERRARIUM_BLOB: blob } })
      return out.replace(/[\r\n]+$/, '')
    },

    async set(name, value) {
      const out = await system.runPowerShell(ENCRYPT_CMD, { env: { TERRARIUM_SECRET: value } })
      const all = await readAll()
      all[name] = out.trim()
      await writeAll(all)
    },

    async delete(name) {
      const all = await readAll()
      delete all[name]
      await writeAll(all)
    },

    async list() {
      return Object.keys(await readAll())
    },
  }
}
