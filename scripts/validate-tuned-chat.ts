import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createChatClient, createWindowsSystem } from '../packages/core/src/index'
import { performanceDir } from '../packages/core/src/inference/settings'
const sessionKey = `agent:main:performance-validation-${randomUUID()}`
const client = createChatClient({ system: createWindowsSystem(), sessionKey,
  deliverExternally: false, replyPollAttempts: 36 })
let first = 0
client.on('error', () => {})
client.on('reply', message => { if (message.role === 'assistant' && !first) first = Date.now() })
const started = Date.now()
try {
  await client.connect()
  const connected = Date.now()
  const turns = []
  for (let turn = 0; turn < 2; turn++) {
  first = 0
  const turnStarted = Date.now()
  await client.send('For this local connection check, reply exactly TERRARIUM_TUNED_OK. Do not use tools or send messages to other channels.')
  const history = await client.history()
  const reply = history.findLast(m => m.role === 'assistant')
  if (!reply?.text.includes('TERRARIUM_TUNED_OK')) throw new Error('Expected validation response did not arrive')
  const replyCompleted = Date.now()
  let metadata: any
  for (let i = 0; i < 20; i++) {
    const sessions = JSON.parse(readFileSync(join(homedir(), '.openclaw/agents/main/sessions/sessions.json'), 'utf8'))
    metadata = sessions[sessionKey]
    if (metadata?.modelProvider) break
    await new Promise(r => setTimeout(r, 250))
  }
  const result = { ok: true, model: metadata?.model, provider: metadata?.modelProvider,
    turn, connectMs: connected - started, firstReplyMs: first - turnStarted, totalMs: replyCompleted - turnStarted, externalDelivery: false }
  if (result.provider !== 'venice') throw new Error(`Primary provider validation used fallback: ${result.provider}`)
  const dir = join(performanceDir(), 'benchmarks'); mkdirSync(dir, { recursive: true })
  turns.push(result)
  writeFileSync(join(dir, 'gateway.json'), JSON.stringify({ date: new Date().toISOString(), turns }, null, 2))
  console.log(JSON.stringify(result))
  }
} finally { client.close() }
