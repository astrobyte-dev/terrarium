import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { ipcMain } from 'electron'
import { AGENTS_LIMIT, SAFETY_MARGIN, parseRoster, removeCard } from '@terrarium/core'
import type { CharRemoveResult, RosterView } from '../shared/contract'

// Workspace AGENTS.md is the shared character file OpenClaw injects each turn; it
// hard-truncates at AGENTS_LIMIT, so removing a card reclaims budget for new ones.
const AGENTS_PATH = join(homedir(), '.openclaw', 'workspace', 'AGENTS.md')

function rosterOf(md: string): RosterView {
  return {
    cards: parseRoster(md),
    totalChars: md.length,
    limit: AGENTS_LIMIT,
    headroom: AGENTS_LIMIT - SAFETY_MARGIN - md.length,
  }
}

function stamp(): string {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-')
}

export function setupCharacters(): void {
  ipcMain.handle('characters:list', async (): Promise<RosterView> => {
    try {
      return rosterOf(readFileSync(AGENTS_PATH, 'utf8'))
    } catch {
      return { cards: [], totalChars: 0, limit: AGENTS_LIMIT, headroom: 0 }
    }
  })

  ipcMain.handle('characters:remove', async (_e, heading: string): Promise<CharRemoveResult> => {
    try {
      const md = readFileSync(AGENTS_PATH, 'utf8')
      const next = removeCard(md, heading)
      if (next === md) return { ok: false, message: 'character not found in AGENTS.md' }
      copyFileSync(AGENTS_PATH, `${AGENTS_PATH}.bak.terrarium-${stamp()}`) // reversible
      writeFileSync(AGENTS_PATH, next)
      return {
        ok: true,
        message: 'Removed — takes effect on the next message (OpenClaw re-reads AGENTS.md each turn). Backup saved.',
        roster: rosterOf(next),
      }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) }
    }
  })
}
