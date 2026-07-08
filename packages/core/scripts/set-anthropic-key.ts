/**
 * Open the Claude door: capture an Anthropic API key into the DPAPI store.
 * The key is read from stdin (NEVER a command-line argument — command lines
 * are visible machine-wide) and verified against the live API before storing.
 * Usage: npm run set-anthropic-key   (then paste the key + enter)
 */
import { createInterface } from 'node:readline'
import { createDpapiSecretStore, SECRET_NAMES } from '../src/secrets/store'
import { createWindowsSystem } from '../src/system/windows'

const rl = createInterface({ input: process.stdin, output: process.stdout })
const key = await new Promise<string>((resolve) => {
  rl.question('Anthropic API key (sk-ant-…): ', (answer) => {
    rl.close()
    resolve(answer.trim())
  })
})

if (key === '') {
  console.log('no key entered — nothing stored')
  process.exit(1)
}
if (!key.startsWith('sk-ant-')) {
  console.log('that does not look like an Anthropic API key (they start with sk-ant-) — nothing stored')
  process.exit(1)
}

console.log('verifying against api.anthropic.com…')
const res = await fetch('https://api.anthropic.com/v1/models', {
  headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
}).catch((err: unknown) => {
  console.log(`could not reach the Anthropic API: ${err instanceof Error ? err.message : String(err)}`)
  return null
})
if (res === null) process.exit(1)
if (res.status === 401 || res.status === 403) {
  console.log(`the API rejected this key (HTTP ${res.status}) — nothing stored`)
  process.exit(1)
}
if (!res.ok) {
  console.log(`unexpected API response (HTTP ${res.status}) — nothing stored`)
  process.exit(1)
}
const models = ((await res.json()) as { data?: { id: string }[] }).data ?? []
console.log(`key is valid — account can see ${models.length} model(s)`)

const store = createDpapiSecretStore(createWindowsSystem())
await store.set(SECRET_NAMES.anthropicApiKey, key)
console.log('stored (DPAPI). The Claude brain unlocks in the picker; the next config')
console.log('regeneration (migrate / brain switch) wires the anthropic provider in.')
