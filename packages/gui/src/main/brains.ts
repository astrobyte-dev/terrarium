import { trustedIpc as ipcMain } from './ipc'
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { BrainLiveness, BrainOpt, BrainsList } from '../shared/contract'
import { createChatClient, createWindowsSystem, performanceDir, performanceSettings } from '@terrarium/core'

const CFG = join(homedir(), '.openclaw', 'openclaw.json')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readCfg(): any {
  return JSON.parse(readFileSync(CFG, 'utf8'))
}

function listBrains(): BrainsList {
  const cfg = readCfg()
  const providers = cfg?.models?.providers ?? {}
  const models: BrainOpt[] = []
  for (const [prov, p] of Object.entries(providers) as [string, { models?: unknown[] }][]) {
    const kind: 'hosted' | 'local' = prov === 'ollama' ? 'local' : 'hosted'
    for (const raw of p.models ?? []) {
      const m = raw as { id?: string; contextWindow?: number; reasoning?: boolean }
      if (!m.id) continue
      models.push({
        ref: `${prov}/${m.id}`,
        provider: prov,
        id: m.id,
        contextWindow: m.contextWindow ?? null,
        reasoning: m.reasoning === true,
        kind,
      })
    }
  }
  let accountedUsd = 0
  try { accountedUsd = JSON.parse(readFileSync(join(performanceDir(), 'venice-usage.json'), 'utf8')).spentUsd ?? 0 } catch { /* no usage */ }
  return { current: cfg?.agents?.defaults?.model?.primary ?? '', models,
    ...(providers.venice ? { veniceBudget: { limitUsd: performanceSettings().veniceBudgetUsd, accountedUsd } } : {}) }
}

// SAFE swap: edit ONLY agents.defaults.model.primary in place, backup first.
// Never regenerates from a template (that would clobber hand-tuned config).
async function setPrimary(ref: string): Promise<{ ok: boolean; message: string }> {
  const cfg = readCfg()
  const models = listBrains().models
  const target = models.find((m) => m.ref === ref)
  if (!target) return { ok: false, message: `${ref} isn't a configured model` }
  if (target.reasoning) {
    return { ok: false, message: `${target.id} is a reasoning model — it breaks OpenClaw. Not switching.` }
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  copyFileSync(CFG, `${CFG}.bak.terrarium-brains-${stamp}`)
  cfg.agents ??= {}
  cfg.agents.defaults ??= {}
  cfg.agents.defaults.model ??= {}
  cfg.agents.defaults.model.primary = ref
  writeFileSync(CFG, `${JSON.stringify(cfg, null, 2)}\n`)
  const client = createChatClient({ system: createWindowsSystem(), deliverExternally: false })
  client.on('error', () => {})
  try {
    await client.connect()
    await client.selectModel(ref)
  } catch {
    return { ok: true, message: `Default set to ${target.id}. The current chat could not be updated; reconnect and select this brain again.` }
  } finally { client.close() }
  return { ok: true, message: `Brain set to ${target.id} — restart the gateway to apply.` }
}

// Read-only availability checks: diagnostics never consume a completion slot or credits.
async function probeLiveness(): Promise<BrainLiveness> {
  const cfg = readCfg()
  const out: BrainLiveness = {}
  const providers = cfg?.models?.providers ?? {}
  for (const [prov, p] of Object.entries(providers) as [string, { baseUrl?: string; apiKey?: string; models?: unknown[] }][]) {
    for (const raw of p.models ?? []) {
      const m = raw as { id?: string }
      if (!m.id) continue
      const ref = `${prov}/${m.id}`
      if (prov === 'ollama') {
        out[ref] = 'local'
        continue
      }
      if (!p.baseUrl || !p.apiKey) {
        out[ref] = 'unknown'
        continue
      }
      try {
        const r = await fetch(`${p.baseUrl}/models`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${p.apiKey}`, 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(12000),
        })
        if (!r.ok) out[ref] = 'unknown'
        else {
          const list = await r.json() as { data?: { id: string }[] }
          out[ref] = list.data?.some(entry => entry.id === m.id) ? 'up' : 'unknown'
        }
      } catch {
        out[ref] = 'down'
      }
    }
  }
  return out
}

export function setupBrains(): void {
  ipcMain.handle('brains:list', async (): Promise<BrainsList> => {
    try {
      return listBrains()
    } catch {
      return { current: '', models: [] }
    }
  })
  ipcMain.handle('brains:probe', async (): Promise<BrainLiveness> => probeLiveness())
  ipcMain.handle('brains:set', async (_e, ref: string) => setPrimary(ref))
}
