/**
 * OpenClaw hard-truncates workspace AGENTS.md at 12,000 chars when injecting
 * context — exceeding it chops instructions mid-file and has broken the bot
 * before. Every insertion is planned against that cliff, with margin.
 */
export const AGENTS_LIMIT = 12_000
export const SAFETY_MARGIN = 200

export interface InsertPlan {
  fits: boolean
  currentChars: number
  cardChars: number
  resultChars: number
  /** Chars available for a card before hitting limit − margin. */
  headroom: number
}

export function planInsert(agentsMd: string, compactCard: string): InsertPlan {
  const currentChars = agentsMd.length
  const cardChars = compactCard.length + 1 // separating newline
  const resultChars = currentChars + cardChars
  const headroom = AGENTS_LIMIT - SAFETY_MARGIN - currentChars
  return { fits: resultChars <= AGENTS_LIMIT - SAFETY_MARGIN, currentChars, cardChars, resultChars, headroom }
}

const CARD_HEADING_RE = /^## .+ \(\d+\)\s*$/m

/** Insert after the last existing character card block; EOF if none exist. */
export function insertCompactCard(agentsMd: string, compactCard: string): string {
  const lines = agentsMd.split('\n')
  let lastCardStart = -1
  for (let i = 0; i < lines.length; i++) {
    if (CARD_HEADING_RE.test(lines[i]!)) lastCardStart = i
  }
  if (lastCardStart === -1) {
    return `${agentsMd.trimEnd()}\n\n${compactCard.trimEnd()}\n`
  }
  // End of that card = next top-level or card heading after it, or EOF.
  let insertAt = lines.length
  for (let i = lastCardStart + 1; i < lines.length; i++) {
    if (/^#{1,2} /.test(lines[i]!)) {
      insertAt = i
      break
    }
  }
  const before = lines.slice(0, insertAt).join('\n').trimEnd()
  const after = lines.slice(insertAt).join('\n')
  return `${before}\n\n${compactCard.trimEnd()}\n${after === '' ? '' : `\n${after}`}`
}
