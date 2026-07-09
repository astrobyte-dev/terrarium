import { useEffect, useState } from 'react'

// Optional skin-detail markers that feed the photo Identity (portraits + /pic). The
// chips choose WHICH imperfections she has; the slider sets how strong they read.
// Composed into a parenthesised phrase — parens raise the prompt's attention weight.
const FEATURES: { key: string; label: string; word: string }[] = [
  { key: 'freckles', label: 'Freckles', word: 'freckles' },
  { key: 'moles', label: 'Moles', word: 'moles' },
  { key: 'beautyMark', label: 'Beauty mark', word: 'a beauty mark' },
  { key: 'scars', label: 'Scars', word: 'faint scars' },
  { key: 'blemishes', label: 'Blemishes', word: 'natural skin blemishes' },
  { key: 'dimples', label: 'Dimples', word: 'dimples' },
  { key: 'tanLines', label: 'Tan lines', word: 'tan lines' },
  { key: 'smooth', label: 'Smooth / clear', word: 'smooth clear flawless skin' },
]

const LEVELS = ['barely visible', 'subtle', 'noticeable', 'prominent']

export function composeSkinPhrase(selected: string[], level: number): string {
  if (selected.length === 0) return ''
  const words = FEATURES.filter((f) => selected.includes(f.key)).map((f) => f.word)
  return `${LEVELS[level] ?? 'subtle'} skin detail (${words.join(', ')})`
}

/** Emits the composed phrase to the parent whenever the selection or level changes. */
export function SkinDetail({ onChange }: { onChange: (phrase: string) => void }) {
  const [selected, setSelected] = useState<string[]>([])
  const [level, setLevel] = useState(1)

  useEffect(() => {
    onChange(composeSkinPhrase(selected, level))
  }, [selected, level, onChange])

  const toggle = (key: string) =>
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))

  const phrase = composeSkinPhrase(selected, level)
  return (
    <div className="bb-skin">
      <div className="bb-skin-chips">
        {FEATURES.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`bb-chip ${selected.includes(f.key) ? 'on' : ''}`}
            aria-pressed={selected.includes(f.key)}
            onClick={() => toggle(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>
      <label className={`bb-skin-slider ${selected.length === 0 ? 'muted' : ''}`}>
        <span className="bb-skin-slider-head">
          Intensity <b>{LEVELS[level]}</b>
        </span>
        <input
          type="range"
          min={0}
          max={3}
          step={1}
          value={level}
          onChange={(e) => setLevel(Number(e.target.value))}
          disabled={selected.length === 0}
        />
      </label>
      <span className="bb-hint">
        {phrase ? `added to her look: “${phrase}”` : 'pick any markers to make her skin look more real — or leave blank for none'}
      </span>
    </div>
  )
}
