// The "living card" in the builder aside — a trading-card view of the companion that
// assembles as you type, in her own signature accent. Presentational only: the parent
// computes name/tags/completeness/contradictions and hands them down.
import type { CSSProperties } from 'react'

export interface SpecimenCardProps {
  name: string
  age: string
  meta: string
  relationship: string
  tags: string[]
  accent: string
  pct: number
  missing: string[]
  contradictions: string[]
  accentName?: string
}

export function SpecimenCard({ name, age, meta, relationship, tags, accent, pct, missing, contradictions, accentName }: SpecimenCardProps) {
  const clean = (name || '').trim() || 'New companion'
  const mono = clean[0] ? clean[0].toUpperCase() : 'N'
  const style = { '--sig': accent } as CSSProperties
  const nextHint = missing.length === 0 ? 'complete — she’s ready to meet' : `add ${missing[0]} to round her out`

  return (
    <div className="bb-spec" style={style}>
      <div className="bb-spec-card">
        <span className="bb-spec-foil" />
        <div className="bb-spec-top">
          <div className="bb-spec-portrait" data-mono={mono} />
          <div className="bb-spec-id">
            <div className="bb-spec-name">{clean}</div>
            <div className="bb-spec-meta">
              {age && `${age} · `}she/her{meta ? ` · ${meta}` : ''}
            </div>
            {relationship && <div className="bb-spec-rel">“{relationship}”</div>}
          </div>
        </div>

        {tags.length > 0 && (
          <div className="bb-spec-pills">
            {tags.slice(0, 5).map((t, i) => (
              <i key={i}>{t}</i>
            ))}
          </div>
        )}

        {contradictions.map((c, i) => (
          <div className="bb-flag" key={i}>
            <span className="bb-flag-ic">⚠</span>
            <p>{c} — she’ll render inconsistently.</p>
          </div>
        ))}

        <div className="bb-spec-foot">
          <div className="bb-ring-wrap">
            <div className="bb-ring" style={{ '--p': pct } as CSSProperties}>
              <b>{pct}%</b>
            </div>
            <small>{nextHint}</small>
          </div>
          {accentName && (
            <div className="bb-sig">
              <b />
              <span>{accentName}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
