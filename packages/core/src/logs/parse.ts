import type { LogLevel } from '../types'

export interface ParsedLine {
  ts: number | null
  level: LogLevel
  line: string
}

const ERROR_RE = /\berror\b|\bfail(?:ed|ure)?\b|exception|traceback|\bfatal\b/i
const WARN_RE = /\bwarn(?:ing)?\b/i

function heuristicLevel(line: string): LogLevel {
  if (ERROR_RE.test(line)) return 'error'
  if (WARN_RE.test(line)) return 'warn'
  return 'info'
}

export function parsePlainLine(raw: string): ParsedLine | null {
  const line = raw.trim()
  if (line === '') return null
  return { ts: null, level: heuristicLevel(line), line }
}

// tslog level names as seen in OpenClaw's JSONL output.
const LEVEL_MAP: Record<string, LogLevel> = {
  SILLY: 'debug',
  TRACE: 'debug',
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
  FATAL: 'error',
}

interface OpenclawRecord {
  _meta?: { date?: string; logLevelName?: string }
  message?: string
}

export function parseOpenclawLine(raw: string): ParsedLine | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  if (!trimmed.startsWith('{')) return parsePlainLine(trimmed)

  let record: OpenclawRecord
  try {
    record = JSON.parse(trimmed) as OpenclawRecord
  } catch {
    return parsePlainLine(trimmed)
  }

  const parsedDate = record._meta?.date === undefined ? NaN : Date.parse(record._meta.date)
  const levelName = record._meta?.logLevelName ?? ''
  return {
    ts: Number.isFinite(parsedDate) ? parsedDate : null,
    level: LEVEL_MAP[levelName] ?? 'info',
    line: typeof record.message === 'string' ? record.message : trimmed,
  }
}

const DAEMON_RE = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})\s{2,}(.*)$/

export function parseDaemonLine(raw: string): ParsedLine | null {
  const line = raw.trimEnd()
  if (line.trim() === '') return null
  const m = DAEMON_RE.exec(line)
  if (m === null) return parsePlainLine(line)

  const [, y, mo, d, h, mi, s, message] = m
  const ts = new Date(+y!, +mo! - 1, +d!, +h!, +mi!, +s!).getTime() // daemon stamps local time
  return { ts, level: heuristicLevel(message!), line: message! }
}
