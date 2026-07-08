import { ipcMain } from 'electron'
import { createBot, createWindowsSystem, renderCompactCard, type BotSpec } from '@terrarium/core'
import type { BotCreateResult, BotPreview, BotSpecInput } from '../shared/contract'

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
}
