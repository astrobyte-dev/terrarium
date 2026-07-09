// The Memory panel edits the brain's curated long-term memory (workspace/MEMORY.md),
// which AGENTS.md already designates as "curated memories; main session only" — so the
// model is already told to use it and the pic daemon never touches it. These helpers
// are the pure parse/render round-trip; the Electron main owns the files.

const BULLET_RE = /^\s*[-*]\s+(.+?)\s*$/

/** Pull the bullet lines out of a memory markdown doc, in order. */
export function parseBullets(md: string): string[] {
  const out: string[] = []
  for (const line of md.split(/\r?\n/)) {
    const m = BULLET_RE.exec(line)
    if (m) out.push(m[1]!.trim())
  }
  return out
}

const MEMORY_TITLE = 'Curated memories'
const MEMORY_INTRO = 'Durable things to remember about Corey and our relationship. Recall these.'

/** Render the curated list back to MEMORY.md (bullets the model reads). */
export function renderMemoryDoc(items: string[]): string {
  const bullets = items.map((t) => `- ${t.trim()}`).filter((l) => l !== '- ')
  return `# ${MEMORY_TITLE}\n\n${MEMORY_INTRO}\n\n${bullets.join('\n')}\n`
}

/** Append a memory unless a case-insensitive equivalent is already present. */
export function addUnique(items: string[], text: string): string[] {
  const t = text.trim()
  if (!t) return items
  const low = t.toLowerCase()
  if (items.some((i) => i.trim().toLowerCase() === low)) return items
  return [...items, t]
}
