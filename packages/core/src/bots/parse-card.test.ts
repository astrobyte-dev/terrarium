import { describe, it, expect } from 'vitest'
import { renderFullCard } from './render'
import { parseFullCard } from './parse-card'
import type { BotSpec } from './spec'

const SPEC: BotSpec = {
  slug: 'jayne',
  displayName: 'Jayne',
  age: 36,
  look: 'Thai-Burmese, dark brown skin, long curly black hair, athletic',
  vibe: 'Confident, seductive and playful',
  loves: 'strong whiskey, good conversation, long walks',
  relationship: 'your mistress',
  backstory: 'Born in Bangkok to a Burmese father and Thai mother.',
  speechStyle: ['Sassy, yet charming', 'Witty banter always ready'],
  hardRules: ['teases but never mean'],
  openerIdeas: ["What's the best way to spend a Friday night?", 'Do you like whiskey?'],
  photo: {
    identity: 'Thai-Burmese mixed heritage, dark brown skin tone, long curly black hair',
    outfit: 'a tight red lace-trimmed bodysuit',
    shot: 'boudoir',
  },
}

describe('parseFullCard', () => {
  it('round-trips a rendered full card back to its spec (minus slug)', () => {
    const parsed = parseFullCard(renderFullCard(SPEC))
    expect(parsed).not.toBeNull()
    expect(parsed!.displayName).toBe('Jayne')
    expect(parsed!.age).toBe(36)
    expect(parsed!.look).toBe(SPEC.look)
    expect(parsed!.vibe).toBe(SPEC.vibe)
    expect(parsed!.loves).toBe(SPEC.loves)
    expect(parsed!.relationship).toBe(SPEC.relationship)
    expect(parsed!.backstory).toBe(SPEC.backstory)
    expect(parsed!.speechStyle).toEqual(SPEC.speechStyle)
    expect(parsed!.openerIdeas).toEqual(SPEC.openerIdeas)
    expect(parsed!.photo).toEqual(SPEC.photo)
  })

  it('strips the injected "N years old" from the identity', () => {
    const parsed = parseFullCard(renderFullCard(SPEC))
    expect(parsed!.photo.identity).not.toMatch(/years old/)
    expect(parsed!.photo.identity).toBe(SPEC.photo.identity)
  })

  it('keeps only the user hard rules, not the five universal ones', () => {
    const parsed = parseFullCard(renderFullCard(SPEC))
    expect(parsed!.hardRules).toEqual(['teases but never mean'])
  })

  it('drops the boilerplate "NO narration" speech line', () => {
    const parsed = parseFullCard(renderFullCard(SPEC))
    expect(parsed!.speechStyle.some((s) => /NO narration/i.test(s))).toBe(false)
  })

  it('re-rendering a parsed card is stable (no duplicated rules)', () => {
    const once = renderFullCard(SPEC)
    const twice = renderFullCard({ ...parseFullCard(once)!, slug: 'jayne' })
    expect(twice).toBe(once)
  })

  it('returns null for non-card text', () => {
    expect(parseFullCard('just some notes, no heading')).toBeNull()
  })
})
