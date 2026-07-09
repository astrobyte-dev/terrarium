import { describe, expect, it } from 'vitest'
import { parseRoster, removeCard } from './roster'

// Mirrors the real AGENTS.md shape: top heading + rules, then cards separated by ---,
// including a hand-written heading with extra text in the parens (Linh).
const AGENTS = `# AGENTS.md - Your Workspace

Some universal rules here.

---

## Mimi Tanaka (26)

Mimi's card body.

---

## Shazza — Sharni Mackenzie (24)

Shazza's card body line one.
Shazza's card body line two.

---

## Linh — Nguyễn Thị Linh (19, young adult)

Linh's card body.

---

## Nova (22)

Nova's card body.
`

describe('parseRoster', () => {
  it('lists every card, including a heading with extra text in the parens', () => {
    const cards = parseRoster(AGENTS)
    expect(cards.map((c) => c.name)).toEqual(['Mimi Tanaka', 'Shazza — Sharni Mackenzie', 'Linh — Nguyễn Thị Linh', 'Nova'])
    expect(cards.map((c) => c.age)).toEqual([26, 24, 19, 22])
  })

  it('does NOT fold the next card into a card size (the Linh-vs-Shazza bug)', () => {
    const cards = parseRoster(AGENTS)
    const shazza = cards.find((c) => c.name.startsWith('Shazza'))!
    const linh = cards.find((c) => c.name.startsWith('Linh'))!
    expect(shazza.chars).toBeLessThan(linh.chars + shazza.chars) // sanity
    // Shazza's block must not contain Linh's heading text.
    expect(AGENTS.slice(AGENTS.indexOf(shazza.heading)).slice(0, shazza.chars)).not.toContain('Linh')
  })
})

describe('removeCard', () => {
  it('removes only the named card, leaving the others intact', () => {
    const out = removeCard(AGENTS, '## Shazza — Sharni Mackenzie (24)')
    expect(out).not.toContain('Shazza')
    expect(out).not.toContain("Shazza's card body")
    expect(out).toContain('## Mimi Tanaka (26)')
    expect(out).toContain('## Linh — Nguyễn Thị Linh (19, young adult)')
    expect(out).toContain('## Nova (22)')
    expect(out).toContain('Some universal rules here.')
  })

  it('leaves no orphaned --- runs or triple blank lines behind', () => {
    const out = removeCard(AGENTS, '## Shazza — Sharni Mackenzie (24)')
    expect(out).not.toMatch(/\n{3,}/)
    expect(out).not.toMatch(/---\s*\n\s*---/)
  })

  it('is a no-op for an unknown heading', () => {
    expect(removeCard(AGENTS, '## Nobody (99)')).toBe(AGENTS)
  })

  it('shrinks the file by roughly the removed card size', () => {
    const before = AGENTS.length
    const shazza = parseRoster(AGENTS).find((c) => c.name.startsWith('Shazza'))!
    const after = removeCard(AGENTS, shazza.heading).length
    expect(before - after).toBeGreaterThan(shazza.chars - 20)
  })
})
