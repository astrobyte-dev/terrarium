import { describe, expect, it } from 'vitest'
import { parseDaemonLine, parseOpenclawLine, parsePlainLine } from './parse'

// Field shape sampled from the live gateway log 2026-07-07.
const OPENCLAW_LINE = JSON.stringify({
  '0': '{"subsystem":"provider-transport-fetch"}',
  _meta: { date: '2026-07-07T08:20:46.125Z', logLevelName: 'INFO' },
  time: '2026-07-07T18:20:46.125+10:00',
  message: '[model-fetch] response provider=arliai status=200 elapsedMs=4308',
})

describe('parseOpenclawLine', () => {
  it('extracts message, UTC timestamp, and level from JSONL', () => {
    const p = parseOpenclawLine(OPENCLAW_LINE)
    expect(p).not.toBeNull()
    expect(p!.line).toBe('[model-fetch] response provider=arliai status=200 elapsedMs=4308')
    expect(p!.ts).toBe(Date.parse('2026-07-07T08:20:46.125Z'))
    expect(p!.level).toBe('info')
  })

  it('maps tslog level names onto the four levels', () => {
    const at = (name: string) =>
      parseOpenclawLine(JSON.stringify({ _meta: { logLevelName: name }, message: 'x' }))!.level
    expect(at('WARN')).toBe('warn')
    expect(at('ERROR')).toBe('error')
    expect(at('FATAL')).toBe('error')
    expect(at('DEBUG')).toBe('debug')
    expect(at('TRACE')).toBe('debug')
  })

  it('falls back to plain parsing for non-JSON lines', () => {
    const p = parseOpenclawLine('something went wrong: Error: boom')
    expect(p!.level).toBe('error')
    expect(p!.line).toContain('boom')
  })

  it('returns null for blank lines', () => {
    expect(parseOpenclawLine('   ')).toBeNull()
  })
})

describe('parseDaemonLine', () => {
  it('parses "YYYY-MM-DD HH:mm:ss  message" with a local timestamp', () => {
    const p = parseDaemonLine('2026-07-07 18:20:01  delivered 1 image(s): img.png')
    expect(p).not.toBeNull()
    expect(p!.line).toBe('delivered 1 image(s): img.png')
    expect(p!.ts).toBe(new Date(2026, 6, 7, 18, 20, 1).getTime())
    expect(p!.level).toBe('info')
  })

  it('keeps unstamped lines with a null timestamp', () => {
    const p = parseDaemonLine('Traceback (most recent call last):')
    expect(p!.ts).toBeNull()
    expect(p!.level).toBe('error')
  })
})

describe('parsePlainLine', () => {
  it('heuristically levels error and warn lines', () => {
    expect(parsePlainLine('llama runner started in 1.2s')!.level).toBe('info')
    expect(parsePlainLine('request failed: connection refused')!.level).toBe('error')
    expect(parsePlainLine('warning: low vram')!.level).toBe('warn')
  })

  it('returns null for blank lines', () => {
    expect(parsePlainLine('')).toBeNull()
  })
})
