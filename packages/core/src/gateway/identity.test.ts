import { describe, expect, it } from 'vitest'
import { makeFakeSystem } from '../test/fake-system'
import { loadDeviceIdentity } from './identity'

const DEVICE = {
  deviceId: 'dev-abc',
  publicKeyPem: '-----BEGIN PUBLIC KEY-----\nX\n-----END PUBLIC KEY-----\n',
  privateKeyPem: '-----BEGIN PRIVATE KEY-----\nY\n-----END PRIVATE KEY-----\n',
}
const PAIRED = {
  'dev-abc': {
    clientId: 'cli',
    clientMode: 'cli',
    platform: 'win32',
    role: 'operator',
    approvedScopes: ['operator.write'],
    scopes: ['operator.read', 'operator.write'],
    tokens: { operator: { token: 'tok_op' } },
  },
}

function world(files: Record<string, unknown>) {
  return makeFakeSystem({
    env: (n) => (n === 'USERPROFILE' ? 'C:\\U' : undefined),
    readTextFile: async (p) => {
      const key = Object.keys(files).find((k) => p.endsWith(k))
      if (key === undefined) throw new Error('missing')
      return JSON.stringify(files[key])
    },
  })
}

describe('loadDeviceIdentity', () => {
  it('mirrors the approved paired metadata (not the broader token scopes)', async () => {
    const id = await loadDeviceIdentity(
      world({ 'identity\\device.json': DEVICE, 'devices\\paired.json': PAIRED }),
    )
    expect(id).not.toBeNull()
    expect(id!.platform).toBe('win32')
    expect(id!.scopes).toEqual(['operator.write']) // approved, not the wider token scopes
    expect(id!.token).toBe('tok_op')
    expect(id!.privateKeyPem).toContain('PRIVATE KEY')
  })

  it('returns null when the device is not paired yet', async () => {
    const id = await loadDeviceIdentity(world({ 'identity\\device.json': DEVICE }))
    expect(id).toBeNull()
  })

  it('returns null when there is no device identity at all', async () => {
    expect(await loadDeviceIdentity(world({}))).toBeNull()
  })
})
