import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { externalTrainingActive } from '../packages/core/src/inference/external-gpu'
import { performanceDir } from '../packages/core/src/inference/settings'
const root = 'http://127.0.0.1:18790'
const health = await fetch(root + '/health').then(r => r.json()) as any
const training = await externalTrainingActive()
let trainingGuardVerified = false
if (training) {
  const response = await fetch(root + '/comfy/prompt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"prompt":{}}' })
  const body = await response.text()
  if (response.status !== 503 || !body.includes('training')) throw new Error('External training guard did not reject local work')
  trainingGuardVerified = true
}
const config = JSON.parse(readFileSync(join(homedir(), '.openclaw/openclaw.json'), 'utf8'))
const sessions = JSON.parse(readFileSync(join(homedir(), '.openclaw/agents/main/sessions/sessions.json'), 'utf8'))
const main = sessions['agent:main:main']
const models = await fetch(root + '/venice/v1/models').then(r => r.json()) as any
if (!models.data?.some((m: any) => m.id === 'gemma-4-uncensored')) throw new Error('Venice model catalog check failed')
const result = { date: new Date().toISOString(), coordinator: health.service, veniceAllowance: health.venice,
  primary: config.agents.defaults.model.primary, fallbacks: config.agents.defaults.model.fallbacks,
  conversationOverride: main?.modelOverride ?? null, trainingActive: training, trainingGuardVerified,
  veniceModelAvailable: true }
writeFileSync(join(performanceDir(), 'benchmarks/live-check.json'), JSON.stringify(result, null, 2))
console.log(JSON.stringify(result))
