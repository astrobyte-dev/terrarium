import { describe, expect, it } from 'vitest'
import { validateBotSpec, type BotSpec } from './spec'
import { renderCompactCard, renderFullCard } from './render'
import { AGENTS_LIMIT, planInsert, insertCompactCard } from './agents-file'

const NOVA: BotSpec = {
  slug: 'nova',
  displayName: 'Nova',
  age: 22,
  look: 'tall with silver-dyed hair, dark eyes, athletic build',
  vibe: 'dry-witted night-owl DJ, teasing but warm underneath',
  loves: 'vinyl crates, synthwave, 3am food runs',
  relationship: 'met Corey at a warehouse gig; they text constantly between her sets',
  speechStyle: ['lowercase, dry one-liners', 'music references', 'voice-of-reason energy at 3am'],
  backstory: 'spins at small clubs, day-sleeps, lives above a record store',
  hardRules: ['teases but never mean'],
  photo: {
    identity: 'tall young woman, silver hair, dark eyes, athletic build',
    outfit: 'cropped band tee, cargo pants, headphones around neck',
    shot: 'dim dj booth selfie, neon rim lighting, candid',
  },
  openerIdeas: ['just finished a set and is wired', 'found a record he would love'],
}

describe('validateBotSpec', () => {
  it('accepts a well-formed spec', () => {
    expect(validateBotSpec(NOVA)).toEqual([])
  })

  it('enforces the 18+ hard floor with no exceptions', () => {
    expect(validateBotSpec({ ...NOVA, age: 17 }).join(' ')).toMatch(/18/)
    expect(validateBotSpec({ ...NOVA, age: 18 })).toEqual([])
  })

  it('rejects age-coded terms in photo prompts (hard line)', () => {
    const bad = { ...NOVA, photo: { ...NOVA.photo, identity: 'cute teen, silver hair' } }
    expect(validateBotSpec(bad).join(' ')).toMatch(/age-coded/i)
    const bad2 = { ...NOVA, photo: { ...NOVA.photo, outfit: 'schoolgirl uniform' } }
    expect(validateBotSpec(bad2).length).toBeGreaterThan(0)
  })

  it('rejects bad slugs and empty required fields', () => {
    expect(validateBotSpec({ ...NOVA, slug: 'Bad Slug!' }).length).toBeGreaterThan(0)
    expect(validateBotSpec({ ...NOVA, vibe: '' }).length).toBeGreaterThan(0)
  })
})

describe('card renderers', () => {
  it('full card follows the proven structure with the age marker injected', () => {
    const card = renderFullCard(NOVA)
    expect(card).toContain('# Nova')
    expect(card).toContain('**Age:** 22 (adult)')
    expect(card).toContain('- Identity: `tall young woman, 22 years old, silver hair')
    expect(card).toContain('- Outfit: `')
    expect(card).toContain('- Shot: `')
    expect(card).toMatch(/NEVER break character/i)
    expect(card).toMatch(/22 and an adult/)
  })

  it('compact card uses the established heading form', () => {
    const compact = renderCompactCard(NOVA)
    expect(compact.startsWith('## Nova (22)')).toBe(true)
    expect(compact.length).toBeLessThan(renderFullCard(NOVA).length)
  })
})

describe('AGENTS.md budget', () => {
  const card = '## X (20)\n\nshort card body\n'

  it('fits when there is headroom, refuses when the 12k cliff is near', () => {
    const small = 'x'.repeat(5000)
    expect(planInsert(small, card).fits).toBe(true)
    const nearLimit = 'x'.repeat(AGENTS_LIMIT - 100)
    const plan = planInsert(nearLimit, card)
    expect(plan.fits).toBe(false)
    expect(plan.headroom).toBeLessThan(card.length)
  })

  it('inserts after the last existing character card, not at EOF blindly', () => {
    const agents = '# Rules\n\ntop rules\n\n## Mimi (26)\n\nmimi card\n\n## Luna (18)\n\nluna card\n\n# PIC IDEAS\n\nrule text\n'
    const result = insertCompactCard(agents, '## Nova (22)\n\nnova card\n')
    const novaAt = result.indexOf('## Nova')
    expect(novaAt).toBeGreaterThan(result.indexOf('## Luna'))
    expect(novaAt).toBeLessThan(result.indexOf('# PIC IDEAS'))
  })

  it('appends at EOF when no card sections exist yet', () => {
    const result = insertCompactCard('# Rules\n\njust rules\n', '## Nova (22)\n\nnova\n')
    expect(result.trimEnd().endsWith('nova')).toBe(true)
  })
})
