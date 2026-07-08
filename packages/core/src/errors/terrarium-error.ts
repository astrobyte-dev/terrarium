import type { ServiceId } from '../types'

/**
 * Stable, matchable error kinds. The TUI (and later the GUI) branch on `code`,
 * never on the free-text message — messages are for humans, codes are for us.
 */
export type ErrorCode =
  | 'stray-process'
  | 'secret-missing'
  | 'not-ready'
  | 'crashed-on-start'
  | 'not-installed'
  | 'not-migrated'
  | 'anthropic-missing'
  | 'no-paired-identity'
  | 'unknown-service'
  | 'start-aborted'
  | 'unexpected'

/** A failure translated into something a non-technical operator can act on. */
export interface ExplainedError {
  code: ErrorCode
  /** What happened, one plain line. */
  summary: string
  /** What to do about it — actionable, no jargon. */
  remedy: string
  /** Which service's log tells the story, if any. */
  logHint: ServiceId | null
  /** The raw underlying message, kept for the show-detail escape hatch. */
  detail: string
}

/**
 * An error that already knows how to explain itself. Throw this from core when
 * the failure is expected and has a clear remedy; `explainError` returns its
 * fields verbatim so no string-matching is needed.
 */
export class TerrariumError extends Error {
  readonly code: ErrorCode
  readonly remedy: string
  readonly logHint: ServiceId | null

  constructor(
    code: ErrorCode,
    summary: string,
    remedy: string,
    opts: { logHint?: ServiceId | null; cause?: unknown } = {},
  ) {
    super(summary, opts.cause === undefined ? undefined : { cause: opts.cause })
    this.name = 'TerrariumError'
    this.code = code
    this.remedy = remedy
    this.logHint = opts.logHint ?? null
  }
}
