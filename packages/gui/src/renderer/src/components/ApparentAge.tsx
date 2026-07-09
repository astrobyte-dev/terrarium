import { useEffect, useState } from 'react'

// The numeric age drives her identity + the 18+ rules; but a bare "19 years old"
// token renders as a generic — often 30-something — adult on photoreal checkpoints.
// This adds an *apparent-age* cue to the photo prompt so she reads her intended
// life-stage. Deliberately floored at a youthful ADULT (early-20s) look: it only
// ever moves apparent age UP from there, never toward the minor edge. All phrases
// are unambiguously adult and pass the age-coded scrub.
const BRACKETS: { key: string; label: string; word: string }[] = [
  { key: 'youthful', label: 'Youthful 20s', word: 'youthful adult woman in her early twenties, fresh-faced, smooth radiant complexion' },
  { key: 'late20s', label: 'Late 20s', word: 'adult woman in her late twenties' },
  { key: '30s', label: '30s', word: 'adult woman in her thirties, subtly mature features' },
  { key: '40s', label: '40s', word: 'adult woman in her forties, mature, soft fine lines' },
  { key: '50s', label: '50s+', word: 'adult woman in her fifties, mature and elegant, silver-touched hair' },
]

export function apparentAgePhrase(key: string): string {
  return BRACKETS.find((b) => b.key === key)?.word ?? ''
}

/** Single-select bracket; click the active one again to clear. Emits the phrase up. */
export function ApparentAge({ onChange }: { onChange: (phrase: string) => void }) {
  const [key, setKey] = useState('')

  useEffect(() => {
    onChange(apparentAgePhrase(key))
  }, [key, onChange])

  return (
    <div className="bb-skin">
      <div className="bb-skin-chips">
        {BRACKETS.map((b) => (
          <button
            key={b.key}
            type="button"
            className={`bb-chip ${key === b.key ? 'on' : ''}`}
            aria-pressed={key === b.key}
            onClick={() => setKey((prev) => (prev === b.key ? '' : b.key))}
          >
            {b.label}
          </button>
        ))}
      </div>
      <span className="bb-hint">
        {key
          ? 'nudges how old she photographs — the numeric age + 18+ rules are unchanged.'
          : 'photoreal models often render any age as 30-something — pick a look so she photographs her intended age. Floored at a youthful adult; it only moves up.'}
      </span>
    </div>
  )
}
