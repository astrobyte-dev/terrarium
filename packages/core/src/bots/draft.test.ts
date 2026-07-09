import { describe, expect, it } from 'vitest'
import { buildDraftPrompt, parseDraft, draftPersona, type DraftSeed } from './draft'

const SEED: DraftSeed = { displayName: 'Nova', age: 24, concept: 'flirty australian DJ', mode: 'nsfw' }

const GOOD_JSON = JSON.stringify({
  look: 'tanned, freckled, athletic',
  vibe: 'playful and confident',
  loves: 'late sets, salt water, teasing',
  relationship: 'your girlfriend',
  backstory: 'Grew up on the Gold Coast spinning records.',
  speechStyle: ['casual aussie slang', 'lots of “babe”'],
  openerIdeas: ['miss me?', 'guess what I just did'],
  photo: { identity: 'adult woman, 24, tanned freckled skin', outfit: 'crop top and shorts', shot: 'waist-up, warm light' },
})

describe('buildDraftPrompt', () => {
  it('names the seed and pins the 18+ / no-age-coded floor', () => {
    const p = buildDraftPrompt(SEED)
    expect(p).toContain('Nova')
    expect(p).toContain('24')
    expect(p).toContain('flirty australian DJ')
    expect(p).toMatch(/adult/i)
    expect(p).toMatch(/age-coded|teen|schoolgirl|never/i) // explicit no-youth instruction
    expect(p).toMatch(/json/i)
  })

  it('shifts tone by mode', () => {
    expect(buildDraftPrompt({ ...SEED, mode: 'sfw' })).toMatch(/wholesome|non-sexual|sfw/i)
    expect(buildDraftPrompt({ ...SEED, mode: 'nsfw' })).toMatch(/explicit|flirty|adult companion|nsfw/i)
  })
})

describe('parseDraft', () => {
  it('parses a clean JSON object', () => {
    const d = parseDraft(GOOD_JSON)
    expect(d.vibe).toBe('playful and confident')
    expect(d.speechStyle).toEqual(['casual aussie slang', 'lots of “babe”'])
    expect(d.photo.identity).toContain('adult woman')
  })

  it('extracts JSON even when the model wraps it in prose/fences', () => {
    const d = parseDraft('Sure! Here you go:\n```json\n' + GOOD_JSON + '\n```\nHope that helps.')
    expect(d.relationship).toBe('your girlfriend')
  })

  it('coerces a string speechStyle/openerIdeas into a one-item array', () => {
    const d = parseDraft(JSON.stringify({ ...JSON.parse(GOOD_JSON), speechStyle: 'just one line', openerIdeas: 'hey' }))
    expect(d.speechStyle).toEqual(['just one line'])
    expect(d.openerIdeas).toEqual(['hey'])
  })

  it('fills missing fields with empty values rather than throwing', () => {
    const d = parseDraft('{"vibe":"calm"}')
    expect(d.vibe).toBe('calm')
    expect(d.look).toBe('')
    expect(d.speechStyle).toEqual([])
    expect(d.photo).toEqual({ identity: '', outfit: '', shot: '' })
  })

  it('throws on input with no JSON object at all', () => {
    expect(() => parseDraft('the model refused and wrote a paragraph')).toThrow(/no json/i)
  })

  it('coerces a field the model returned as an object into a readable string', () => {
    // Real 8B models sometimes return photo.shot as {type, description} instead of a string.
    const dirty = JSON.stringify({
      ...JSON.parse(GOOD_JSON),
      photo: { identity: 'adult woman, 24', outfit: 'crop top', shot: { type: 'medium shot', description: 'behind the counter' } },
    })
    const d = parseDraft(dirty)
    expect(d.photo.shot).toBe('medium shot, behind the counter')
  })

  it('repairs a JSON object truncated mid-output (missing closing braces)', () => {
    const truncated = '{"vibe":"warm","photo":{"identity":"adult woman, 24","outfit":"dress"' // no closes
    const d = parseDraft(truncated)
    expect(d.vibe).toBe('warm')
    expect(d.photo.identity).toContain('adult woman')
  })

  it('drops any age-coded term the model might slip into a photo field', () => {
    const dirty = JSON.stringify({ ...JSON.parse(GOOD_JSON), photo: { identity: 'teen schoolgirl, petite', outfit: 'x', shot: 'y' } })
    const d = parseDraft(dirty)
    expect(d.photo.identity).not.toMatch(/teen|schoolgirl/i)
  })
})

describe('draftPersona', () => {
  it('prompts the chat fn and returns the parsed persona', async () => {
    let seenPrompt = ''
    const chat = async (prompt: string) => {
      seenPrompt = prompt
      return GOOD_JSON
    }
    const d = await draftPersona(SEED, chat)
    expect(seenPrompt).toContain('Nova')
    expect(d.loves).toContain('salt water')
  })
})
