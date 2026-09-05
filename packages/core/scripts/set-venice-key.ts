import { createInterface } from 'node:readline'
import { createDpapiSecretStore, SECRET_NAMES } from '../src/secrets/store'
import { createWindowsSystem } from '../src/system/windows'

// stdin only: credentials never appear in process arguments or logs.
if (process.stdin.isTTY) process.stdin.setRawMode(true)
const rl = createInterface({ input: process.stdin, terminal: false })
console.log('Waiting for Venice inference key on stdin...')
const key = await new Promise<string>((resolve) => rl.once('line', (line) => { rl.close(); resolve(line.trim()) }))
if (process.stdin.isTTY) process.stdin.setRawMode(false)
if (!key) throw new Error('No key supplied')
const res = await fetch('https://api.venice.ai/api/v1/models?type=text', {
  headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20_000),
})
if (!res.ok) throw new Error(`Venice key verification failed: HTTP ${res.status}`)
const data = await res.json() as { data?: { id: string; model_spec?: unknown }[] }
await createDpapiSecretStore(createWindowsSystem()).set(SECRET_NAMES.veniceApiKey, key)
console.log('Venice key verified and stored with Windows DPAPI. No inference performed.')
console.log(JSON.stringify((data.data ?? []).filter(m => /uncensored|role.play/i.test(m.id)), null, 2))
