import type { HealthRung } from '../types'

export interface HealthSignals {
  installed: boolean
  processRunning: boolean
  port: number | null
  portOpen: boolean
  lastLogAgeMs: number | null // null = no log observed / no log source
  quietAfterMs: number | null // null = log silence is normal for this service
  wedgedAfterMs: number | null
}

export interface HealthVerdict {
  health: HealthRung
  detail: string
}

function fmtAge(ms: number): string {
  const min = Math.round(ms / 60_000)
  if (min < 1) return `${Math.round(ms / 1000)} s`
  if (min < 120) return `${min} min`
  return `${Math.round(min / 60)} h`
}

export function computeHealth(s: HealthSignals): HealthVerdict {
  if (!s.installed) return { health: 'not-installed', detail: 'not found on this machine' }

  const responding = s.port === null ? s.processRunning : s.portOpen
  if (!responding) {
    if (s.processRunning) {
      return { health: 'starting', detail: `process up, port ${s.port} not answering yet` }
    }
    return { health: 'stopped', detail: 'not running' }
  }

  const respondsVia = s.port === null ? 'process running' : `port ${s.port} responding`

  if (s.lastLogAgeMs === null) {
    if (s.quietAfterMs === null) return { health: 'live', detail: respondsVia }
    return { health: 'port-open', detail: `${respondsVia}; no log activity observed yet` }
  }

  const age = fmtAge(s.lastLogAgeMs)
  if (s.wedgedAfterMs !== null && s.lastLogAgeMs > s.wedgedAfterMs) {
    return {
      health: 'wedged',
      detail: `${respondsVia} but log silent ${age} — silent-hang signature`,
    }
  }
  if (s.quietAfterMs !== null && s.lastLogAgeMs > s.quietAfterMs) {
    return { health: 'quiet', detail: `${respondsVia}, log silent ${age}` }
  }
  return { health: 'live', detail: `${respondsVia} · log ${age} ago` }
}
