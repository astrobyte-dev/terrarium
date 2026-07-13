// Starter-specimen shelf for the Bot Builder — a curated 3×3 of archetypes. Each card is
// a TRIPLE flip: tap to cycle photo → anime → details, and "Use this start" (on the
// details face) seeds the form and paints the studio in that character's accent. A
// curated nine on purpose: enough to cover the spectrum, few enough to scan at a glance.
import { useState, type CSSProperties } from 'react'
import { ARCHETYPES, type Archetype } from '../data/persona'
import { archetypeFace, archetypeAnimeFace } from '../data/archetypeFaces'

const STATES = 3 // 0 = photo · 1 = anime · 2 = details

function FaceContent({ a, state, onUse }: { a: Archetype; state: number; onUse: (a: Archetype) => void }) {
  if (state === 2) {
    return (
      <div className="bb-face-body">
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
    )
  }
  const img = state === 1 ? archetypeAnimeFace(a.id) : archetypeFace(a.id)
  return (
    <div className="bb-face-portrait">
      <div className={`bb-flip-portrait ${img ? 'has-face' : ''}`} data-mono={a.mono}>
        {img && <img src={img} alt="" loading="lazy" />}
      </div>
      <div className="bb-flip-name">
        <b>{a.name}</b>
        <span>{state === 1 ? 'anime' : a.kind}</span>
      </div>
    </div>
  )
}

// Two backface-hidden faces + a rotating inner give a smooth flip through any number of
// states: before each turn we stage the next content on the face that's about to appear.
function FlipCard({ a, onUse }: { a: Archetype; onUse: (a: Archetype) => void }) {
  const [turn, setTurn] = useState(0)
  const [aState, setAState] = useState(0)
  const [bState, setBState] = useState(1)

  const advance = () => {
    const next = turn + 1
    const ns = next % STATES
    if (next % 2 === 0) setAState(ns)
    else setBState(ns)
    setTurn(next)
  }

  const state = turn % STATES
  return (
    <div
      className="bb-flip bb-flip3"
      style={{ '--c': a.accent } as CSSProperties}
      role="button"
      tabIndex={0}
      aria-label={`${a.name}, ${a.kind} — tap to flip through photo, anime, details`}
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest('.bb-use-start')) advance()
      }}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault()
          advance()
        }
      }}
    >
      <span className="bb-flip-hint">↻</span>
      <div className="bb-flip-inner" style={{ transform: `rotateY(${turn * 180}deg)` }}>
        <div className="bb-face bb-face-a">
          <FaceContent a={a} state={aState} onUse={onUse} />
        </div>
        <div className="bb-face bb-face-b">
          <FaceContent a={a} state={bState} onUse={onUse} />
        </div>
      </div>
      <div className="bb-flip-dots" aria-hidden="true">
        {[0, 1, 2].map((s) => (
          <i key={s} className={s === state ? 'on' : ''} />
        ))}
      </div>
    </div>
  )
}

export function ArchetypeGallery({ onUse }: { onUse: (a: Archetype) => void }) {
  return (
    <div className="bb-arch-grid">
      {ARCHETYPES.map((a) => (
        <FlipCard key={a.id} a={a} onUse={onUse} />
      ))}
    </div>
  )
}
