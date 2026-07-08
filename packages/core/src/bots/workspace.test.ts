import { describe, expect, it } from 'vitest'
import { makeFakeSystem } from '../test/fake-system'
import { createBot } from './workspace'
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
