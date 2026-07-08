import type { SystemPort } from '../system/system-port'
import type { DevicePrincipal } from './device-auth'

export interface DeviceIdentity extends DevicePrincipal {
  privateKeyPem: string
  publicKeyPem: string
}

interface DeviceJson {
  deviceId: string
  publicKeyPem: string
  privateKeyPem: string
}
interface PairedRecord {
  clientId?: string
  clientMode?: string
  platform?: string
  role?: string
  approvedScopes?: string[]
  scopes?: string[]
  tokens?: Record<string, { token: string }>
}

/**
 * Load the CLI device identity OpenClaw already created and paired, and mirror
 * the *approved* metadata from paired.json exactly — requesting anything the
 * gateway hasn't approved (broader scopes, different platform) triggers a
 * re-pairing prompt instead of connecting.
 */
export async function loadDeviceIdentity(sys: SystemPort): Promise<DeviceIdentity | null> {
  const dir = `${sys.env('USERPROFILE') ?? ''}\\.openclaw\\identity`
  const device = await readJson<DeviceJson>(sys, `${dir}\\device.json`)
  if (device === null) return null

  const paired = await readPairedRecord(sys, device.deviceId)
  const token = paired?.tokens?.operator?.token ?? paired?.tokens?.node?.token
  if (token === undefined) return null

  return {
    deviceId: device.deviceId,
    privateKeyPem: device.privateKeyPem,
    publicKeyPem: device.publicKeyPem,
    clientId: paired?.clientId ?? 'cli',
    clientMode: paired?.clientMode ?? 'cli',
    role: paired?.role ?? 'operator',
    scopes: paired?.approvedScopes ?? paired?.scopes ?? ['operator.write'],
    platform: paired?.platform ?? 'win32',
    token,
  }
}

async function readPairedRecord(sys: SystemPort, deviceId: string): Promise<PairedRecord | null> {
  const home = `${sys.env('USERPROFILE') ?? ''}\\.openclaw`
  const paired = await readJson<Record<string, PairedRecord>>(sys, `${home}\\devices\\paired.json`)
  return paired?.[deviceId] ?? null
}

async function readJson<T>(sys: SystemPort, path: string): Promise<T | null> {
  try {
    return JSON.parse(await sys.readTextFile(path)) as T
  } catch {
    return null
  }
}
