// Reading + trimming the character roster in workspace AGENTS.md. Companion to
// agents-file.ts (which INSERTS compact cards). Used by the GUI's Manage Characters
// view to show who's taking up the 12k budget and remove cards to reclaim space.
//
// The heading regex is deliberately lenient on the parens: hand-written cards use
// forms like "(19, young adult)" alongside the generated "(24)", and a stricter
// pattern silently miscounts (it once folded Linh's card into Shazza's size).

const CARD_HEADING_RE = /^##\s+(.+?)\s+\((\d+)[^)]*\)\s*$/
const isCardHeading = (line: string) => CARD_HEADING_RE.test(line)
const isTopHeading = (line: string) => /^# /.test(line)

export interface RosterCard {
  /** The full heading line, e.g. "## Shazza — Sharni Mackenzie (24)" — the removal key. */
  heading: string
  name: string
  age: number
  /** Size of this card's block (heading through the line before the next card/top heading). */
  chars: number
}

/** A card block runs from its heading to just before the next card or top-level heading. */
function blockEnd(lines: string[], start: number): number {
  for (let i = start + 1; i < lines.length; i++) {
    if (isCardHeading(lines[i]!) || isTopHeading(lines[i]!)) return i
  }
  return lines.length
}

export function parseRoster(agentsMd: string): RosterCard[] {
  const lines = agentsMd.split('\n')
  const cards: RosterCard[] = []
  for (let i = 0; i < lines.length; i++) {
    const m = CARD_HEADING_RE.exec(lines[i]!)
    if (!m) continue
    const end = blockEnd(lines, i)
    cards.push({
      heading: lines[i]!.trim(),
      name: m[1]!.trim(),
      age: Number(m[2]),
      chars: lines.slice(i, end).join('\n').length,
    })
  }
  return cards
}

/** Remove one card's whole block by its heading; collapses the blank runs it leaves behind. */
export function removeCard(agentsMd: string, heading: string): string {
  const lines = agentsMd.split('\n')
  const start = lines.findIndex((l) => l.trim() === heading.trim())
  if (start === -1) return agentsMd
  const end = blockEnd(lines, start)
  const kept = [...lines.slice(0, start), ...lines.slice(end)].join('\n')
  return kept.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
}
