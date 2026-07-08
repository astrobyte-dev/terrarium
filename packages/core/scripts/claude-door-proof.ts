/** M5d proof: the Claude gate follows the REAL store state on this machine. */
import { MODEL_CATALOG } from '../src/catalog/models'
import { resolveBrainChoice } from '../src/catalog/brain'
import { createDpapiSecretStore, SECRET_NAMES } from '../src/secrets/store'
import { createWindowsSystem } from '../src/system/windows'

const store = createDpapiSecretStore(createWindowsSystem())
const key = await store.get(SECRET_NAMES.anthropicApiKey)
const configured = key !== null
console.log(`anthropic-api-key in store: ${configured ? 'yes' : 'no'}`)

const claude = MODEL_CATALOG.find((m) => m.id === 'claude-sonnet')!
const gate = resolveBrainChoice(claude, { anthropicConfigured: configured })
console.log(`claude-sonnet gate: ${gate.ok ? `OPEN → ${gate.primaryModel}` : `refused — ${gate.reason}`}`)

const arli = resolveBrainChoice(MODEL_CATALOG.find((m) => m.id === 'arliai/Mistral-Medium-3.5-128B')!, {
  anthropicConfigured: configured,
})
console.log(`production brain unaffected: ${arli.ok ? 'ok' : 'BROKEN'}`)
