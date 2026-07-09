import { describe, expect, it } from 'vitest'
import { makeFakeSystem } from '../test/fake-system'
import { createBot, updateBot } from './workspace'
import type { BotSpec } from './spec'

const SPEC: BotSpec = {
  slug: 'nova',
  displayName: 'Nova',
  age: 22,
  look: 'silver hair, dark eyes',
  vibe: 'dry-witted DJ',
  loves: 'vinyl, synthwave',
  relationship: 'texts Corey between sets',
  speechStyle: ['lowercase one-liners'],
  backstory: 'lives above a record store',
  hardRules: [],
  photo: { identity: 'tall young woman, silver hair', outfit: 'band tee', shot: 'dj booth selfie' },
  openerIdeas: ['just finished a set'],
}

function world(agentsMd: string) {
  const files = new Map<string, string>([['C:\\U\\.openclaw\\workspace\\AGENTS.md', agentsMd]])
  const system = makeFakeSystem({
    env: (n) => (n === 'USERPROFILE' ? 'C:\\U' : undefined),
    fileExists: async (p) => files.has(p),
    readTextFile: async (p) => {
      const f = files.get(p)
      if (f === undefined) throw new Error('missing')
      return f
    },
    writeTextFile: async (p, t) => void files.set(p, t),
    now: () => Date.parse('2026-07-07T12:00:00Z'),
  })
  return { system, files }
}

const AGENTS = '# Rules\n\nstuff\n\n## Mimi (26)\n\nmimi\n'

describe('createBot', () => {
  it('dry run reports the plan and writes nothing', async () => {
    const { system, files } = world(AGENTS)
    const result = await createBot({ system, spec: SPEC })
    expect(result.ok).toBe(true)
    expect(result.wrote).toBe(false)
    expect(files.size).toBe(1)
    expect(result.plan?.fits).toBe(true)
  })

  it('writes full card + backup + updated AGENTS.md when asked', async () => {
    const { system, files } = world(AGENTS)
    const result = await createBot({ system, spec: SPEC, dryRun: false })
    expect(result.wrote).toBe(true)
    expect(files.get('C:\\U\\.openclaw\\workspace\\characters\\nova.md')).toContain('# Nova')
    expect(files.get(result.backupPath!)).toBe(AGENTS)
    const agents = files.get('C:\\U\\.openclaw\\workspace\\AGENTS.md')!
    expect(agents).toContain('## Nova (22)')
    expect(agents.indexOf('## Nova')).toBeGreaterThan(agents.indexOf('## Mimi'))
  })

  it('refuses when the 12k budget would be blown', async () => {
    const { system, files } = world('x'.repeat(11_700))
    const result = await createBot({ system, spec: SPEC, dryRun: false })
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toMatch(/12k|truncation/i)
    expect(files.size).toBe(1) // nothing written
  })

  it('refuses to overwrite an existing character', async () => {
    const { system, files } = world(AGENTS)
    files.set('C:\\U\\.openclaw\\workspace\\characters\\nova.md', 'existing')
    const result = await createBot({ system, spec: SPEC, dryRun: false })
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toMatch(/already exists/i)
  })

  it('surfaces validation errors without touching anything', async () => {
    const { system } = world(AGENTS)
    const result = await createBot({ system, spec: { ...SPEC, age: 16 }, dryRun: false })
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toMatch(/18/)
  })
})

describe('updateBot', () => {
  const EXISTING = '# Rules\n\nstuff\n\n## Mimi (26)\n\nmimi\n\n## Nova (22)\n\nold nova\n'

  it('swaps the compact card in place and rewrites the full card, keeping the slug', async () => {
    const { system, files } = world(EXISTING)
    const edited: BotSpec = { ...SPEC, vibe: 'warmer now', slug: 'ignored-slug' }
    const r = await updateBot({
      system,
      spec: edited,
      originalSlug: 'nova',
      originalHeading: '## Nova (22)',
      dryRun: false,
    })
    expect(r.ok).toBe(true)
    expect(r.wrote).toBe(true)
    const agents = files.get('C:\\U\\.openclaw\\workspace\\AGENTS.md')!
    // exactly one Nova card, carrying the edit
    expect(agents.match(/## Nova \(22\)/g)?.length).toBe(1)
    expect(agents).toContain('warmer now')
    expect(agents).toContain('## Mimi (26)') // other cards untouched
    // full card written to the ORIGINAL slug's file, not a new one
    expect(files.get('C:\\U\\.openclaw\\workspace\\characters\\nova.md')).toContain('warmer now')
    expect(files.has('C:\\U\\.openclaw\\workspace\\characters\\ignored-slug.md')).toBe(false)
  })

  it('backs AGENTS.md up before editing', async () => {
    const { system, files } = world(EXISTING)
    const r = await updateBot({ system, spec: SPEC, originalSlug: 'nova', originalHeading: '## Nova (22)', dryRun: false })
    expect(files.get(r.backupPath!)).toBe(EXISTING)
  })

  it('a rename changes the heading but still leaves exactly one card', async () => {
    const { system, files } = world(EXISTING)
    const r = await updateBot({
      system,
      spec: { ...SPEC, displayName: 'Luna', age: 25 },
      originalSlug: 'nova',
      originalHeading: '## Nova (22)',
      dryRun: false,
    })
    expect(r.ok).toBe(true)
    const agents = files.get('C:\\U\\.openclaw\\workspace\\AGENTS.md')!
    expect(agents).not.toContain('## Nova (22)')
    expect(agents).toContain('## Luna (25)')
    expect(agents.match(/^## /gm)?.length).toBe(2) // Mimi + Luna, no orphan
  })

  it('enforces the 18+ floor on edits too', async () => {
    const { system } = world(EXISTING)
    const r = await updateBot({
      system,
      spec: { ...SPEC, age: 15 },
      originalSlug: 'nova',
      originalHeading: '## Nova (22)',
      dryRun: false,
    })
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toMatch(/18/)
  })
})
