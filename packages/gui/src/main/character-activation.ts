import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { AGENTS_LIMIT, SAFETY_MARGIN, parseFullCard, parseRoster, removeCard, insertCompactCard, renderCompactCard } from '@terrarium/core'
import { safeSlug } from './ipc-policy'
import type { CharActivateResult } from '../shared/contract'

/** Activate against an explicit workspace so real file behavior can be tested in isolation. */
export function activateCharacter(workspace: string, slug: string): CharActivateResult {
  if (!safeSlug(slug)) return { ok: false, message: 'Invalid character identity' }
  const agentsPath = join(workspace, 'AGENTS.md')
  try {
    const spec = parseFullCard(readFileSync(join(workspace, 'characters', `${slug}.md`), 'utf8'))
    if (!spec) return { ok: false, message: 'character card could not be read' }
    const current = readFileSync(agentsPath, 'utf8')
    const withoutCards = parseRoster(current).reduce((md, card) => removeCard(md, card.heading), current)
    const next = insertCompactCard(withoutCards, renderCompactCard(spec))
    if (next.length > AGENTS_LIMIT - SAFETY_MARGIN) return { ok: false, message: 'This character exceeds the active prompt budget. Shorten the card first.' }
    copyFileSync(agentsPath, `${agentsPath}.bak.terrarium-${randomUUID()}`)
    writeFileSync(agentsPath, next)
    writeFileSync(join(workspace, 'active-character.json'), JSON.stringify({ character: slug }))
    return { ok: true, message: `${spec.displayName} is now active` }
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : String(e) } }
}
