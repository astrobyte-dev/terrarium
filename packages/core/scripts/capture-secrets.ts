/**
 * One-time (idempotent) secret capture: read the plaintext secrets from the
 * live openclaw.json into the DPAPI store, then prove the config template
 * reproduces the live file exactly (dry run — writes nothing to the config).
 */
import { applyConfig, createDpapiSecretStore, createWindowsSystem, getBotIdentity, SECRET_NAMES } from '../src/index'

const system = createWindowsSystem()
const store = createDpapiSecretStore(system)
const configPath = `${system.env('USERPROFILE') ?? ''}\\.openclaw\\openclaw.json`
const live = JSON.parse(await system.readTextFile(configPath)) as Record<string, never>

const at = (path: string): unknown =>
  path.split('.').reduce<unknown>((v, k) => (v as Record<string, unknown> | undefined)?.[k], live)

const sources: Array<[string, string]> = [
  [SECRET_NAMES.telegramBotToken, 'channels.telegram.botToken'],
  [SECRET_NAMES.arliaiApiKey, 'models.providers.arliai.apiKey'],
  [SECRET_NAMES.ollamaApiKey, 'models.providers.ollama.apiKey'],
  [SECRET_NAMES.gatewayAuthToken, 'gateway.auth.token'],
]

for (const [name, path] of sources) {
  const value = at(path)
  if (typeof value !== 'string' || value === '') {
    console.log(`skip     ${name} (${path} not present in live config)`)
    continue
  }
  await store.set(name, value)
  console.log(`captured ${name} ← ${path} (${value.length} chars, DPAPI-encrypted)`)
}

console.log('\nTemplate parity check (dry run, config untouched):')
const parity = await applyConfig({ system, store, mode: 'inline', dryRun: true })
if (!parity.changed) {
  console.log('  PARITY OK — generated inline config is identical to the live file.')
} else {
  console.log('  DIFFERS at these paths (template needs review before any write):')
  for (const p of parity.diffs) console.log(`   - ${p}`)
}

const token = await store.get(SECRET_NAMES.telegramBotToken)
if (token !== null) {
  const identity = await getBotIdentity(token)
  console.log(
    identity === null
      ? '\nBot identity: getMe failed (offline or bad token?)'
      : `\nBot identity: ${identity.firstName} (@${identity.username}, id ${identity.id})`,
  )
}
process.exit(0)
