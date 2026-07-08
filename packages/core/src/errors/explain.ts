import { SERVICE_IDS, type ServiceId } from '../types'
import { TerrariumError, type ErrorCode, type ExplainedError } from './terrarium-error'

/** A raw message may be prefixed `"<serviceId>: ..."` — pull the id out if so. */
function serviceFromPrefix(message: string): ServiceId | null {
  const match = /^(\w+):/.exec(message)
  if (match === null) return null
  const id = match[1] as ServiceId
  return SERVICE_IDS.includes(id) ? id : null
}

interface Rule {
  test: RegExp
  code: ErrorCode
  remedy: string
  /** true ⇒ derive logHint from the `"<serviceId>:"` prefix. */
  logFromPrefix?: boolean
}

// Ordered most-specific first. These mirror the real throw sites in core; when
// a throw site adopts TerrariumError, its rule here becomes dead but harmless.
const RULES: Rule[] = [
  {
    test: /stray process running/i,
    code: 'stray-process',
    remedy: 'Another copy is already running. Press m to migrate so Terrarium takes ownership, or stop the other copy first.',
    logFromPrefix: true,
  },
  {
    test: /not ready after/i,
    code: 'not-ready',
    remedy: 'It started but did not come up in time. Open its log to see why, then try restarting it.',
    logFromPrefix: true,
  },
  {
    test: /exited during startup/i,
    code: 'crashed-on-start',
    remedy: 'It crashed while starting. Open its log for the reason, fix that, then start it again.',
    logFromPrefix: true,
  },
  {
    test: /start aborted/i,
    code: 'start-aborted',
    remedy: 'Startup was interrupted. Try starting it again.',
    logFromPrefix: true,
  },
  {
    test: /nothing to spawn|not installed/i,
    code: 'not-installed',
    remedy: 'This component is not installed yet. Run its installer, then try again.',
    logFromPrefix: true,
  },
  {
    test: /anthropic.*(api-key|enabled)/i,
    code: 'anthropic-missing',
    remedy: 'Claude needs an Anthropic API key. Run npm run set-anthropic-key, then pick Claude again.',
  },
  {
    test: /secret .*missing|requires secrets|run secret capture/i,
    code: 'secret-missing',
    remedy: 'A required credential is not stored yet. Run npm run capture-secrets to add it.',
  },
  {
    test: /no paired gateway identity/i,
    code: 'no-paired-identity',
    remedy: 'OpenClaw is not paired on this machine, so chat cannot connect. Set up OpenClaw first.',
  },
  {
    test: /not migrated/i,
    code: 'not-migrated',
    remedy: 'Terrarium does not own the stack right now, so there is nothing to hand back.',
  },
  {
    test: /unknown service/i,
    code: 'unknown-service',
    remedy: 'That is not a service Terrarium manages.',
  },
]

const SUMMARIES: Record<ErrorCode, string> = {
  'stray-process': 'A service is already running outside Terrarium',
  'not-ready': 'A service did not finish starting in time',
  'crashed-on-start': 'A service crashed while starting',
  'start-aborted': 'Startup was interrupted',
  'not-installed': 'A required component is not installed',
  'anthropic-missing': 'No Anthropic API key is stored',
  'secret-missing': 'A required credential is missing',
  'no-paired-identity': 'OpenClaw is not paired on this machine',
  'not-migrated': 'Terrarium does not own the stack',
  'unknown-service': 'Unknown service',
  unexpected: 'Something went wrong that Terrarium did not anticipate',
}

/** Translate any thrown value into an operator-facing explanation. Pure. */
export function explainError(err: unknown): ExplainedError {
  if (err instanceof TerrariumError) {
    return { code: err.code, summary: err.message, remedy: err.remedy, logHint: err.logHint, detail: err.message }
  }

  const detail = err instanceof Error ? err.message : String(err)
  for (const rule of RULES) {
    if (!rule.test.test(detail)) continue
    return {
      code: rule.code,
      summary: SUMMARIES[rule.code],
      remedy: rule.remedy,
      logHint: rule.logFromPrefix === true ? serviceFromPrefix(detail) : null,
      detail,
    }
  }

  return {
    code: 'unexpected',
    summary: SUMMARIES.unexpected,
    remedy: 'Check the logs for detail. If it persists, the raw error below helps diagnose it.',
    logHint: null,
    detail,
  }
}
