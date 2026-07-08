import crypto from 'node:crypto'

/**
 * OpenClaw gateway WS auth. Reverse-engineered from the bundled client and
 * proven against the live gateway 2026-07-07. The connect challenge must be
 * signed with the device's ed25519 key over this exact pipe-joined payload
 * (buildDeviceAuthPayloadV3 in the OpenClaw dist).
 */
export interface DevicePrincipal {
  deviceId: string
  clientId: string // must match the paired record, e.g. "cli"
  clientMode: string // e.g. "cli"
  role: string // e.g. "operator"
  scopes: string[] // must match the approved scopes exactly, or re-pairing triggers
  platform: string // must match the paired record, e.g. "win32"
  token: string
}

// Metadata is lowercased in the signed payload (normalizeDeviceMetadataForAuth).
const normalizeMeta = (v: string) => v.trim().replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32))

export function buildConnectPayloadV3(p: DevicePrincipal, nonce: string, signedAtMs: number): string {
  return [
    'v3',
    p.deviceId,
    p.clientId,
    p.clientMode,
    p.role,
    p.scopes.join(','),
    String(signedAtMs),
    p.token,
    nonce,
    normalizeMeta(p.platform),
    '', // deviceFamily — empty for a plain CLI-style principal
  ].join('|')
}

const b64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** ed25519 SPKI DER ends with the 32-byte raw key; the gateway wants it base64url. */
export function rawPublicKeyBase64Url(publicKeyPem: string): string {
  const der = crypto.createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' })
  return b64url(der.subarray(der.length - 32))
}

export function signConnectPayload(privateKeyPem: string, payload: string): string {
  return b64url(crypto.sign(null, Buffer.from(payload, 'utf8'), crypto.createPrivateKey(privateKeyPem)))
}
