import crypto from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  buildConnectPayloadV3,
  rawPublicKeyBase64Url,
  signConnectPayload,
  type DevicePrincipal,
} from './device-auth'

const P: DevicePrincipal = {
  deviceId: 'dev123',
  clientId: 'cli',
  clientMode: 'cli',
  role: 'operator',
  scopes: ['operator.write'],
  platform: 'Win32', // deliberately mixed-case to prove normalization
  token: 'tok_abc',
}

describe('buildConnectPayloadV3', () => {
  it('produces the exact pipe-joined v3 layout with lowercased metadata', () => {
    expect(buildConnectPayloadV3(P, 'NONCE', 1700)).toBe(
      'v3|dev123|cli|cli|operator|operator.write|1700|tok_abc|NONCE|win32|',
    )
  })

  it('joins multiple scopes with commas', () => {
    const payload = buildConnectPayloadV3({ ...P, scopes: ['operator.read', 'operator.write'] }, 'N', 1)
    expect(payload).toContain('|operator.read,operator.write|')
  })
})

describe('ed25519 signing round-trips', () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
  const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
  const publicPem = publicKey.export({ type: 'spki', format: 'pem' }) as string

  it('rawPublicKeyBase64Url yields 32 bytes of base64url', () => {
    const raw = rawPublicKeyBase64Url(publicPem)
    expect(Buffer.from(raw, 'base64url')).toHaveLength(32)
  })

  it('a signature made by signConnectPayload verifies against the raw key', () => {
    const payload = buildConnectPayloadV3(P, 'nonce-xyz', 9999)
    const sig = signConnectPayload(privatePem, payload)
    const ok = crypto.verify(
      null,
      Buffer.from(payload, 'utf8'),
      publicKey,
      Buffer.from(sig, 'base64url'),
    )
    expect(ok).toBe(true)
  })
})
