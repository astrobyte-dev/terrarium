import { describe, expect, it } from 'vitest'
import { createLineSplitter } from './line-splitter'

describe('createLineSplitter', () => {
  it('splits chunks into lines across chunk boundaries', () => {
    const lines: string[] = []
    const s = createLineSplitter((l) => lines.push(l))
    s.push('hel')
    s.push('lo\nwor')
    s.push('ld\n')
    expect(lines).toEqual(['hello', 'world'])
  })

  it('handles CRLF and skips blank lines', () => {
    const lines: string[] = []
    const s = createLineSplitter((l) => lines.push(l))
    s.push('a\r\n\r\nb\r\n')
    expect(lines).toEqual(['a', 'b'])
  })

  it('flush emits a trailing partial line', () => {
    const lines: string[] = []
    const s = createLineSplitter((l) => lines.push(l))
    s.push('no newline')
    expect(lines).toEqual([])
    s.flush()
    expect(lines).toEqual(['no newline'])
  })
})
