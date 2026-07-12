// Starter-specimen shelf for the Bot Builder — a curated 3×3 of archetypes. Front is a
// portrait tile; tap flips to a bio + tags + "Use this start", which seeds the form and
// paints the studio in that character's signature accent. A curated nine, on purpose:
// enough to cover the spectrum, few enough to scan without re-creating blank-page dread.
import { useState, type CSSProperties } from 'react'
import { ARCHETYPES, type Archetype } from '../data/persona'

export function ArchetypeGallery({ onUse }: { onUse: (a: Archetype) => void }) {
  const [flipped, setFlipped] = useState<Set<string>>(new Set())
  const toggle = (id: string) =>
    setFlipped((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  return (
    <div className="bb-arch-grid">
      {ARCHETYPES.map((a) => (
        <div
          key={a.id}
          className={`bb-flip ${flipped.has(a.id) ? 'flipped' : ''}`}
          style={{ '--c': a.accent } as CSSProperties}
          role="button"
          tabIndex={0}
          aria-label={`${a.name}, ${a.kind} — flip for details`}
          onClick={(e) => {
            if (!(e.target as HTMLElement).closest('.bb-use-start')) toggle(a.id)
          }}
          onKeyDown={(e) => {
            if (e.key === ' ' || e.key === 'Enter') {
              e.preventDefault()
              toggle(a.id)
            }
          }}
        >
          <div className="bb-flip-inner">
            <div className="bb-face bb-front">
              <span className="bb-flip-hint">↻</span>
              <div className="bb-flip-portrait" data-mono={a.mono} />
              <div className="bb-flip-name">
                <b>{a.name}</b>
                <span>{a.kind}</span>
              </div>
            </div>
            <div className="bb-face bb-back">
              <p>{a.bio}</p>
              <div className="bb-back-tags">
                {a.tags.map((t) => (
                  <i key={t}>{t}</i>
                ))}
              </div>
              <button className="bb-use-start" type="button" onClick={() => onUse(a)}>
                Use this start →
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
