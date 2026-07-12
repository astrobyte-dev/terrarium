import { useEffect, useState } from 'react'

// Two body-dimension sliders that feed the photo Identity (portraits + /pic), same
// as ApparentAge / SkinDetail. All terms describe an ADULT figure and stay clear of
// the age-coded scrub. Index 0 on each slider is "default" — emits nothing, so the
// control is fully optional and the checkpoint's own baseline is left untouched.
const BUST = ['default', 'petite bust', 'small bust', 'full bust', 'large full bust', 'very full bust']
const BUILD = [
  'default',
  'slim slender build',
  'lean toned build',
  'athletic fit build',
  'curvy hourglass build',
  'voluptuous curvy build',
  'plus-size full-figured build',
]

export function composeBodyPhrase(bust: number, build: number): string {
  const parts: string[] = []
  if (build > 0) parts.push(BUILD[build])
  if (bust > 0) parts.push(BUST[bust])
  return parts.join(', ')
}

/** Emits the composed body phrase to the parent whenever either slider moves. */
export function BodyShape({ onChange }: { onChange: (phrase: string) => void }) {
  const [bust, setBust] = useState(0)
  const [build, setBuild] = useState(0)

  useEffect(() => {
    onChange(composeBodyPhrase(bust, build))
  }, [bust, build, onChange])

  const phrase = composeBodyPhrase(bust, build)
  return (
    <div className="bb-skin">
      <label className={`bb-skin-slider ${build === 0 ? 'muted' : ''}`}>
        <span className="bb-skin-slider-head">
          Build <b>{BUILD[build]}</b>
        </span>
        <input
          type="range"
          min={0}
          max={BUILD.length - 1}
          step={1}
          value={build}
          onChange={(e) => setBuild(Number(e.target.value))}
        />
      </label>
      <label className={`bb-skin-slider ${bust === 0 ? 'muted' : ''}`}>
        <span className="bb-skin-slider-head">
          Bust <b>{BUST[bust]}</b>
        </span>
        <input
          type="range"
          min={0}
          max={BUST.length - 1}
          step={1}
          value={bust}
          onChange={(e) => setBust(Number(e.target.value))}
        />
      </label>
      <span className="bb-hint">
        {phrase ? `added to her look: “${phrase}”` : 'drag either slider to shape her figure — or leave at default for the model’s baseline'}
      </span>
    </div>
  )
}
