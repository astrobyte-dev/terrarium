import { afterAll, describe, expect, it } from 'vitest'
import { createWindowsSystem } from '../system/windows'
import { createDpapiSecretStore } from './store'

// Integration: real PowerShell, real DPAPI, real %LOCALAPPDATA%\Terrarium.
// Uses a throwaway secret name and cleans up after itself.
const system = createWindowsSystem()
const store = createDpapiSecretStore(system)
const NAME = 'terrarium-selftest'

describe('DPAPI store on the real machine', () => {
  afterAll(async () => {
    await store.delete(NAME)
  })

  it('round-trips a value with special characters through real DPAPI', async () => {
    const value = 'x9!$%&()=?*+#-_.:,;<>|@{}[]äé 1234567890:AAAA'
    await store.set(NAME, value)
    expect(await store.get(NAME)).toBe(value)
  }, 30_000)
})
