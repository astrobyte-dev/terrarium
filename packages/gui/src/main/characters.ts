import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { ipcMain } from 'electron'
import {
  AGENTS_LIMIT,
  SAFETY_MARGIN,
  createWindowsSystem,
  parseFullCard,
  parseRoster,
  removeCard,
  updateBot,
} from '@terrarium/core'
import type { BotSpecInput, CharGetResult, CharRemoveResult, CharUpdateResult, RosterView } from '../shared/contract'

// Workspace AGENTS.md is the shared character file OpenClaw injects each turn; it
// hard-truncates at AGENTS_LIMIT, so removing a card reclaims budget for new ones.
const WORKSPACE = join(homedir(), '.openclaw', 'workspace')
const AGENTS_PATH = join(WORKSPACE, 'AGENTS.md')
const cardPath = (slug: string) => join(WORKSPACE, 'characters', `${slug}.md`)

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

  // Load a Terrarium-authored character back into the Bot Builder for editing. Only
  // works for cards that still have their full card file (hand-written legacy cards
  // may not) — returns ok:false gracefully otherwise.
  ipcMain.handle('characters:get', async (_e, slug: string): Promise<CharGetResult> => {
    try {
      const path = cardPath(slug)
      if (!existsSync(path)) {
        return { ok: false, message: `no full card file for “${slug}” on disk — this one can't be edited here` }
      }
      const spec = parseFullCard(readFileSync(path, 'utf8'))
      if (!spec) return { ok: false, message: 'her card file could not be parsed' }
      return { ok: true, slug, spec: { ...spec, slug } as BotSpecInput }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) }
    }
  })

  // Save edits: rewrite the full card + swap her compact card in AGENTS.md. Keeps the
  // original slug/file so a rename never orphans her card or face reference.
  ipcMain.handle(
    'characters:update',
    async (_e, spec: BotSpecInput, originalSlug: string, originalHeading: string): Promise<CharUpdateResult> => {
      try {
        const system = createWindowsSystem()
        const r = await updateBot({
          system,
          spec,
          originalSlug,
          originalHeading,
          dryRun: false,
          workspaceDir: WORKSPACE,
        })
        return {
          ok: r.ok,
          errors: r.errors,
          wrote: r.wrote,
          backupPath: r.backupPath,
          message: r.ok
            ? 'Saved — takes effect on her next message (OpenClaw re-reads AGENTS.md each turn). Backup saved.'
            : r.errors.join(' · '),
        }
      } catch (e) {
        return { ok: false, errors: [], wrote: false, backupPath: null, message: e instanceof Error ? e.message : String(e) }
      }
    },
  )

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
