import { ipcMain } from 'electron'
import {
  createBot,
  createOllamaChat,
  createWindowsSystem,
  draftField,
  draftPersona,
  renderCompactCard,
  type BotSpec,
  type DraftField,
  type DraftSeed,
} from '@terrarium/core'
import type {
  BotCreateResult,
  BotPreview,
  BotSpecInput,
  DraftFieldKey,
  DraftFieldResult,
  DraftResult,
  DraftSeedInput,
} from '../shared/contract'

// The renderer sends a plain object; core's BotSpec has the same shape.
const toSpec = (input: BotSpecInput): BotSpec => input

export function setupBots(): void {
  const system = createWindowsSystem()

  ipcMain.handle('bots:preview', async (_e, input: BotSpecInput): Promise<BotPreview> => {
    const spec = toSpec(input)
    const r = await createBot({ system, spec, dryRun: true })
    let compactCard = ''
    try {
      compactCard = renderCompactCard(spec)
    } catch {
      compactCard = ''
    }
    const p = r.plan
    return {
      ok: r.ok,
      errors: r.errors,
      compactCard,
      currentChars: p?.currentChars ?? 0,
      cardChars: p?.cardChars ?? 0,
      resultChars: p?.resultChars ?? 0,
      headroom: p?.headroom ?? 0,
      fits: p?.fits ?? false,
    }
  })

  ipcMain.handle('bots:create', async (_e, input: BotSpecInput): Promise<BotCreateResult> => {
    const r = await createBot({ system, spec: toSpec(input), dryRun: false })
    return { ok: r.ok, errors: r.errors, wrote: r.wrote, backupPath: r.backupPath, fullCardPath: r.fullCardPath }
  })

  // AI-assist: a LOCAL uncensored model drafts the personality from a one-line concept.
  // format:'json' constrains generation to valid JSON; the usual 18+ / age-coded gate
  // still runs on preview/create — this only pre-fills fields the user then edits.
  ipcMain.handle('bots:draft', async (_e, seed: DraftSeedInput): Promise<DraftResult> => {
    try {
      const chat = createOllamaChat({ format: 'json' })
      const persona = await draftPersona(seed as DraftSeed, chat)
      return { ok: true, persona }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  // Re-roll a single field (the per-section dice button).
  ipcMain.handle('bots:draftField', async (_e, seed: DraftSeedInput, field: DraftFieldKey): Promise<DraftFieldResult> => {
    try {
      const chat = createOllamaChat({ format: 'json' })
      const value = await draftField(seed as DraftSeed, field as DraftField, chat)
      return { ok: true, value }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })
}
