import { describe, expect, it } from 'vitest'
import { makeFakeSystem } from '../test/fake-system'
import { createDpapiSecretStore } from './store'

/**
 * Fake DPAPI: "encryption" is reversible base64 so the test can verify the
 * plumbing — secrets travel via env vars (never command lines), blobs land
 * in secrets.json, decryption round-trips.
 */
function fakeWorld() {
  const files = new Map<string, string>()
  const commandLines: string[] = []
  const system = makeFakeSystem({
    env: (n) => (n === 'LOCALAPPDATA' ? 'C:\\LAD' : undefined),
    readTextFile: async (p) => {
      const f = files.get(p)
      if (f === undefined) throw new Error('missing')
      return f
    },
    writeTextFile: async (p, t) => void files.set(p, t),
    runPowerShell: async (cmd, opts) => {
      commandLines.push(cmd)
      if (cmd.includes('ConvertFrom-SecureString')) {
        return Buffer.from(opts?.env?.TERRARIUM_SECRET ?? '').toString('base64') + '\r\n'
      }
      return Buffer.from(opts?.env?.TERRARIUM_BLOB ?? '', 'base64').toString() + '\r\n'
    },
  })
  return { store: createDpapiSecretStore(system), files, commandLines }
}

describe('createDpapiSecretStore', () => {
  it('round-trips a secret through encrypt → file → decrypt', async () => {
    const { store, files } = fakeWorld()
    await store.set('telegram-bot-token', '12345:AAbbCC')
    expect(await store.get('telegram-bot-token')).toBe('12345:AAbbCC')

    const stored = files.get('C:\\LAD\\Terrarium\\secrets.json')!
    expect(stored).not.toContain('12345:AAbbCC') // never plaintext at rest
  })

  it('never puts the secret value in a PowerShell command line', async () => {
    const { store, commandLines } = fakeWorld()
    await store.set('k', 'hunter2-super-secret')
    await store.get('k')
    expect(commandLines.join('\n')).not.toContain('hunter2-super-secret')
  })

  it('returns null for unknown names and lists what it holds', async () => {
    const { store } = fakeWorld()
    expect(await store.get('nope')).toBeNull()
    await store.set('a', '1')
    await store.set('b', '2')
    expect((await store.list()).sort()).toEqual(['a', 'b'])
    await store.delete('a')
    expect(await store.get('a')).toBeNull()
    expect(await store.list()).toEqual(['b'])
  })
})
