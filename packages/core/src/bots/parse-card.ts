import type { BotSpec } from './spec'
import { universalRules } from './render'

// Parse a full character card (characters/<slug>.md, as written by renderFullCard)
// back into a BotSpec, so the Bot Builder can load an existing companion for editing.
// The inverse of renderFullCard: strips the injected age from Identity and drops the
// auto-appended universal hard rules + the boilerplate speech line, so re-saving
// doesn't duplicate them.

const labeled = (lines: string[], label: string): string => {
  const hit = lines.find((l) => l.startsWith(`**${label}:**`))
  return hit ? hit.slice(`**${label}:**`.length).trim() : ''
}

/** Bullets ("- x") directly under a "**Header...**" line, until the next blank line. */
function bulletsUnder(lines: string[], headerStartsWith: string): string[] {
  const at = lines.findIndex((l) => l.startsWith(`**${headerStartsWith}`))
  if (at === -1) return []
  const out: string[] = []
  for (let i = at + 1; i < lines.length; i++) {
    const l = lines[i]!
    if (l.trim() === '') break
    if (l.startsWith('- ')) out.push(l.slice(2).trim())
  }
  return out
}

/** `- Label: \`value\`` under the Photo prompts header → value inside the backticks. */
function photoLine(lines: string[], label: string): string {
  const hit = lines.find((l) => l.startsWith(`- ${label}:`))
  if (!hit) return ''
  const m = hit.match(/`([^`]*)`/)
  return (m ? m[1]! : hit.slice(hit.indexOf(':') + 1)).trim()
}

const stripInjectedAge = (identity: string) =>
  identity.replace(/,\s*\d+\s+years old/i, '').replace(/\s{2,}/g, ' ').replace(/^[,\s]+|[,\s]+$/g, '')

/** Returns a BotSpec, or null if this doesn't look like a character card at all. */
export function parseFullCard(md: string): BotSpec | null {
  const lines = md.split('\n').map((l) => l.replace(/\r$/, ''))
  const nameLine = lines.find((l) => /^#\s+/.test(l))
  if (!nameLine) return null
  const displayName = nameLine.replace(/^#\s+/, '').trim()

  const ageStr = labeled(lines, 'Age') // "36 (adult)"
  const age = Number.parseInt(ageStr, 10) || 0

  const speechStyle = bulletsUnder(lines, 'Speech').filter(
    (s) => !/^NO narration/i.test(s),
  )

  // Hard rules = the user's, minus the five auto-appended universal ones.
  const universal = new Set(universalRules(age, displayName))
  const hardRules = bulletsUnder(lines, 'Hard rules').filter((r) => !universal.has(r))

  const openers = labeled(lines, 'Opener ideas (vary)')
    .replace(/\.$/, '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)

  return {
    slug: '',
    displayName,
    age,
    look: labeled(lines, 'Look'),
    vibe: labeled(lines, 'Vibe'),
    loves: labeled(lines, 'Loves'),
    relationship: labeled(lines, 'Relationship with Corey'),
    backstory: labeled(lines, 'Backstory'),
    speechStyle,
    hardRules,
    openerIdeas: openers,
    photo: {
      identity: stripInjectedAge(photoLine(lines, 'Identity')),
      outfit: photoLine(lines, 'Outfit'),
      shot: photoLine(lines, 'Shot'),
    },
  }
}
