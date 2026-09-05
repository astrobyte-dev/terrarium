import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createChatClient, createWindowsSystem } from '../packages/core/src/index'
const path = join(homedir(), '.openclaw/openclaw.json')
const config = JSON.parse(readFileSync(path, 'utf8'))
if (config.agents.defaults.model.primary !== 'venice/gemma-4-uncensored') throw new Error('Primary changed since validation; preserve the new choice')
copyFileSync(path, `${path}.bak.performance-fallback-${Date.now()}`)
config.agents.defaults.model.fallbacks = ['ollama/dolphin3:8b',
  ...(config.agents.defaults.model.fallbacks ?? []).filter((ref: string) => ref !== 'ollama/dolphin3:8b')]
writeFileSync(path, JSON.stringify(config, null, 2))
const client = createChatClient({ system: createWindowsSystem(), deliverExternally: false })
client.on('error', () => {})
try { await client.connect(); await client.selectModel(config.agents.defaults.model.primary); console.log('Current conversation selected Venice through the local /model command; local fallback comes first. External delivery disabled.') }
finally { client.close() }
