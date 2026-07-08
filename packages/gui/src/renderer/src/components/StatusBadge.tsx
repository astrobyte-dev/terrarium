import type { ServiceState } from '../data/types'

// Deuteranomaly-safe by design: state is carried by THREE redundant channels —
// colour (--ok/--warn/--crit), a distinct glyph SHAPE, and a text LABEL — so a
// converged green/amber can never hide the meaning. (Corey's accessibility ask.)
const MAP: Record<ServiceState, { label: string; cls: string }> = {
  live: { label: 'Live', cls: 'ok' },
  idle: { label: 'Idle', cls: 'warn' },
  down: { label: 'Down', cls: 'crit' },
}

function Glyph({ state }: { state: ServiceState }) {
  if (state === 'live')
    // filled, pulsing dot
    return (
      <svg className="badge-glyph pulse" viewBox="0 0 12 12" aria-hidden="true">
        <circle cx="6" cy="6" r="4" fill="currentColor" />
      </svg>
    )
  if (state === 'idle')
    // two pause bars — unmistakably different from a dot regardless of hue
    return (
      <svg className="badge-glyph" viewBox="0 0 12 12" aria-hidden="true">
        <rect x="3" y="2.5" width="2" height="7" rx="1" fill="currentColor" />
        <rect x="7" y="2.5" width="2" height="7" rx="1" fill="currentColor" />
      </svg>
    )
  // down: an X
  return (
    <svg className="badge-glyph" viewBox="0 0 12 12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M3.5 3.5l5 5M8.5 3.5l-5 5" />
    </svg>
  )
}

export function StatusBadge({ state }: { state: ServiceState }) {
  const m = MAP[state]
  return (
    <span className={`badge ${m.cls}`}>
      <Glyph state={state} />
      {m.label}
    </span>
  )
}
