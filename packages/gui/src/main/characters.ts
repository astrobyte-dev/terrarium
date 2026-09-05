import { trustedIpc as ipcMain } from './ipc'
import { copyFileSync, existsSync, readFileSync, writeFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { activateCharacter } from './character-activation'
import { join } from 'node:path'
import {
  AGENTS_LIMIT,
  SAFETY_MARGIN,
  createWindowsSystem,
  parseFullCard,
  parseRoster,
  removeCard,
  updateBot,
} from '@terrarium/core'
import type { BotSpecInput, CharActivateResult, CharDeleteResult, CharGetResult, CharRemoveResult, CharUpdateResult, RosterView } from '../shared/contract'

// Workspace AGENTS.md is the shared character file OpenClaw injects each turn; it
// hard-truncates at AGENTS_LIMIT, so removing a card reclaims budget for new ones.
const WORKSPACE = join(homedir(), '.openclaw', 'workspace')
const AGENTS_PATH = join(WORKSPACE, 'AGENTS.md')
const cardPath = (slug: string) => join(WORKSPACE, 'characters', `${slug}.md`)
const CARDS_DIR = join(WORKSPACE, 'characters')
const REFS_DIR = join(CARDS_DIR, 'refs')
const SESSIONS_DIR = join(homedir(), '.openclaw', 'agents', 'main', 'sessions')
const TERRARIUM_DIR = join(process.env['LOCALAPPDATA'] || '', 'Terrarium')

function rosterOf(md: string): RosterView {
  return {
    cards: parseRoster(md),
    totalChars: md.length,
    limit: AGENTS_LIMIT,
    headroom: AGENTS_LIMIT - SAFETY_MARGIN - md.length,
  }
}

function libraryRoster(agentsMd: string): RosterView {
  const cards = existsSync(CARDS_DIR)
    ? readdirSync(CARDS_DIR).filter((f) => f.endsWith('.md')).flatMap((f) => {
        const spec = parseFullCard(readFileSync(join(CARDS_DIR, f), 'utf8'))
        return spec ? [{ slug: f.slice(0, -3), heading: `library:${f.slice(0, -3)}`, name: spec.displayName, age: spec.age, chars: statSync(join(CARDS_DIR, f)).size }] : []
      })
    : []
  // The card list is the unbounded library; these figures remain the *live
  // prompt* budget, which contains only the currently activated compact card.
  return { cards, totalChars: agentsMd.length, limit: AGENTS_LIMIT, headroom: AGENTS_LIMIT - SAFETY_MARGIN - agentsMd.length }
}

function stamp(): string {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-')
}

export function setupCharacters(): void {
  ipcMain.handle('characters:list', async (): Promise<RosterView> => {
    try {
      const agentsMd = readFileSync(AGENTS_PATH, 'utf8')
      const library = libraryRoster(agentsMd)
      return library.cards.length > 0 ? library : rosterOf(agentsMd)
    } catch {
      return { cards: [], totalChars: 0, limit: AGENTS_LIMIT, headroom: 0 }
    }
  })

  // Keep the whole library on disk; inject only the selected companion into the
  // shared prompt so the 12k AGENTS budget never caps the roster size.
  ipcMain.handle('characters:activate', async (_e, slug: string): Promise<CharActivateResult> => {
    return activateCharacter(WORKSPACE, slug)
  })

  ipcMain.handle('characters:deletePermanently', async (_e, slug: string): Promise<CharDeleteResult> => {
    try {
      // This handler is intentionally reachable only from the typed UI confirmation.
      // It is never called while browsing, selecting, or activating a character.
      rmSync(cardPath(slug), { force: true })
      rmSync(join(REFS_DIR, `${slug}.png`), { force: true })
      rmSync(join(TERRARIUM_DIR, 'portraits', `${slug}.png`), { force: true })
      // Full-reset scope chosen by the user: every shared OpenClaw transcript and
      // Terrarium chat/image history is removed, not just this character's turns.
      if (existsSync(SESSIONS_DIR)) for (const f of readdirSync(SESSIONS_DIR)) if (f !== 'skills-prompts') rmSync(join(SESSIONS_DIR, f), { recursive: true, force: true })
      for (const f of ['gallery.json', 'pic-history.json']) rmSync(join(TERRARIUM_DIR, f), { force: true })
      return { ok: true, message: 'Character deleted. All shared conversation and local image history was permanently cleared.', roster: libraryRoster(readFileSync(AGENTS_PATH, 'utf8')) }
    } catch (e) { return { ok: false, message: e instanceof Error ? e.message : String(e) } }
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
          libraryOnly: true,
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
