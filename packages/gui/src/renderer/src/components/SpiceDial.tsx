// Tone dial for AI drafting — replaces the old binary SFW/NSFW switch with a gradient
// from wholesome to explicit. It only steers the draft model's tone; it is mapped to the
// existing sfw/nsfw draft mode by the parent. It has no say over age — that stays a hard
// validator no control can reach.

export const SPICE_LEVELS = ['Wholesome', 'Playful', 'Flirty', 'Steamy', 'Explicit'] as const

/** Coarse-map the 0–4 dial onto the draft's existing sfw/nsfw tone. */
export function spiceToMode(level: number): 'sfw' | 'nsfw' {
  return level >= 2 ? 'nsfw' : 'sfw'
}

const FLAMES = ['', '', '🌶️', '🌶️🌶️', '🌶️🌶️🌶️']

export function SpiceDial({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="bb-spice">
      <div className="bb-spice-head">
        <span className="bb-label">Spice 🌶️</span>
        <b>
          {SPICE_LEVELS[value]} {FLAMES[value]}
        </b>
      </div>
      <input
        type="range"
        min={0}
        max={4}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Spice level"
      />
      <div className="bb-spice-ticks">
        {SPICE_LEVELS.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </div>
      <span className="bb-hint">sets how flirty or explicit her drafted personality leans</span>
    </div>
  )
}
