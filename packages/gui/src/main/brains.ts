import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { ipcMain } from 'electron'
import type { BrainLiveness, BrainOpt, BrainsList } from '../shared/contract'

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
  return { current: cfg?.agents?.defaults?.model?.primary ?? '', models }
}

// SAFE swap: edit ONLY agents.defaults.model.primary in place, backup first.
// Never regenerates from a template (that would clobber hand-tuned config).
function setPrimary(ref: string): { ok: boolean; message: string } {
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
  return { ok: true, message: `Brain set to ${target.id} — restart the gateway to apply.` }
}

// Probe hosted models for liveness (Ollama models are local → 'local').
// Sequential + spaced: ArliAI's free tier caps at 1 request in flight.
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
        const r = await fetch(`${p.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${p.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: m.id, messages: [{ role: 'user', content: 'ping' }], max_tokens: 4 }),
          signal: AbortSignal.timeout(12000),
        })
        out[ref] = r.ok ? 'up' : 'down'
      } catch {
        out[ref] = 'down'
      }
      await new Promise((res) => setTimeout(res, 900))
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
