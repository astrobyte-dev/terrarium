import { useEffect, useState } from 'react'

// Optional intimacy profile for an adult companion — her turn-ons and, importantly, her
// hard limits. Only surfaces once the Spice dial is turned up (NSFW-leaning); below that
// it stays hidden so SFW builds never see it. The composed text is folded into her hard
// rules at build time (same pattern as the photo composers), so the brain honours the
// limits and knows the turn-ons. All entries are adult, between fictional adults.
const INTO = [
  'teasing & flirting',
  'dirty talk',
  'praise',
  'dominant',
  'submissive',
  'switch',
  'roleplay',
  'light bondage',
  'sensory play',
  'passionate & romantic',
  'exhibitionism',
  'spanking',
  'feet & soles',
  'foot worship',
  'spit & drool',
]

const LIMITS = [
  'pain',
  'humiliation',
  'degradation',
  'non-consent themes',
  'anything extreme',
  'scat / watersports',
]

export function composeKinkText(into: string[], limits: string[]): string {
  const lines: string[] = []
  if (into.length) lines.push(`Intimacy — into: ${into.join(', ')}.`)
  if (limits.length) lines.push(`Hard limits, never: ${limits.join(', ')}.`)
  return lines.join('\n')
}

/** Shown only when spice ≥ 2. Emits the composed intimacy text up whenever it changes. */
export function KinkProfile({ spice, onChange }: { spice: number; onChange: (text: string) => void }) {
  const [into, setInto] = useState<string[]>([])
  const [limits, setLimits] = useState<string[]>([])
  const active = spice >= 2

  useEffect(() => {
    // When hidden (SFW-leaning), contribute nothing to her card.
    onChange(active ? composeKinkText(into, limits) : '')
  }, [into, limits, active, onChange])

  if (!active) {
    return (
      <div className="bb-kink bb-kink-locked">
        <span className="bb-label">Intimacy profile 🔥</span>
        <span className="bb-hint">turn the Spice dial up to Flirty+ to set her turn-ons and hard limits</span>
      </div>
    )
  }

  const toggle = (list: string[], set: (v: string[]) => void, v: string) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  return (
    <div className="bb-kink">
      <span className="bb-label">Intimacy profile 🔥</span>
      <div className="bb-kink-group">
        <span className="bb-kink-head">Into</span>
        <div className="bb-skin-chips">
          {INTO.map((v) => (
            <button
              key={v}
              type="button"
              className={`bb-chip ${into.includes(v) ? 'on' : ''}`}
              aria-pressed={into.includes(v)}
              onClick={() => toggle(into, setInto, v)}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      <div className="bb-kink-group">
        <span className="bb-kink-head bb-kink-head-limit">Hard limits — she’ll never go here</span>
        <div className="bb-skin-chips">
          {LIMITS.map((v) => (
            <button
              key={v}
              type="button"
              className={`bb-chip bb-chip-limit ${limits.includes(v) ? 'on' : ''}`}
              aria-pressed={limits.includes(v)}
              onClick={() => toggle(limits, setLimits, v)}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      <span className="bb-hint">rides in her hard rules — the brain honours the limits and leans into the turn-ons.</span>
    </div>
  )
}
