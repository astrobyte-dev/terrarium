import { describe, it, expect } from 'vitest'
import { parseBullets, renderMemoryDoc, addUnique } from './notes'

describe('parseBullets', () => {
  it('pulls bullets, ignoring headers and prose', () => {
    const md = `# What we know about Corey\n\nsome intro line\n\n- Corey has a dog named Bruno\n- Corey works at an architecture firm\n* also supports asterisks\n`
    expect(parseBullets(md)).toEqual([
      'Corey has a dog named Bruno',
      'Corey works at an architecture firm',
      'also supports asterisks',
    ])
  })

  it('returns [] for empty / bullet-free text', () => {
    expect(parseBullets('')).toEqual([])
    expect(parseBullets('# Title\n\njust prose, no bullets')).toEqual([])
  })

  it('trims whitespace around each bullet', () => {
    expect(parseBullets('-   spaced out   \n')).toEqual(['spaced out'])
  })
})

describe('renderMemoryDoc / round-trip', () => {
  it('renders a titled bullet doc', () => {
    const doc = renderMemoryDoc(['likes surfing at Bondi', 'dislikes coriander'])
    expect(doc).toContain('# Curated memories')
    expect(doc).toContain('- likes surfing at Bondi')
    expect(doc).toContain('- dislikes coriander')
  })

  it('round-trips through parseBullets', () => {
    const items = ['a fact', 'another fact', 'a third']
    expect(parseBullets(renderMemoryDoc(items))).toEqual(items)
  })

  it('drops blank items on render', () => {
    expect(parseBullets(renderMemoryDoc(['real', '   ', '']))).toEqual(['real'])
  })
})

describe('addUnique', () => {
  it('appends a new memory', () => {
    expect(addUnique(['a'], 'b')).toEqual(['a', 'b'])
  })
  it('skips a case-insensitive duplicate', () => {
    expect(addUnique(['Corey has a Dog'], 'corey has a dog')).toEqual(['Corey has a Dog'])
  })
  it('ignores blank input', () => {
    expect(addUnique(['a'], '   ')).toEqual(['a'])
  })
})
