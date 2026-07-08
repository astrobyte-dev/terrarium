import { describe, expect, it } from 'vitest'
import { pickNewest } from './newest-file'

describe('pickNewest', () => {
  const entries = [
    { name: 'openclaw-2026-07-05.log', mtimeMs: 100 },
    { name: 'openclaw-2026-07-07.log', mtimeMs: 300 },
    { name: 'openclaw-2026-07-06.log', mtimeMs: 200 },
    { name: 'unrelated.txt', mtimeMs: 999 },
  ]

  it('returns the most recently written matching file', () => {
    expect(pickNewest(entries, /^openclaw-.*\.log$/)).toBe('openclaw-2026-07-07.log')
  })

  it('returns null when nothing matches', () => {
    expect(pickNewest(entries, /^nope-/)).toBeNull()
  })
})
