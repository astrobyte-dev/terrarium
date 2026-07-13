import { useEffect, useState } from 'react'

// Slow tease (v1, blur-reveal): when tease mode is on, her photos arrive blurred under a
// teasing caption and unblur on tap — or after a beat. The render latency already made you
// wait; this dresses the reveal instead of dropping it flat. v2 will layer her voice + a
// brain-written line keyed to her kink profile; for now the captions are a small pool.
const TEASES = [
  'you sure you’re ready? 👀',
  'mmm… come and get it',
  'patience — it’s worth the wait 😏',
  'close your eyes… okay, open',
  'i made this just for you',
  'tap if you dare',
  'been thinking about this all day',
]

function teaseFor(src: string): string {
  let h = 0
  for (let i = 0; i < src.length; i++) h = (h * 31 + src.charCodeAt(i)) >>> 0
  return TEASES[h % TEASES.length]!
}

export function TeasedImage({
  src,
  alt,
  onZoom,
  autoRevealMs = 5000,
}: {
  src: string
  alt: string
  onZoom: () => void
  autoRevealMs?: number
}) {
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    if (revealed) return
    const t = setTimeout(() => setRevealed(true), autoRevealMs)
    return () => clearTimeout(t)
  }, [revealed, autoRevealMs])

  return (
    <div className={`teased ${revealed ? 'revealed' : ''}`}>
      <img
        className="chat-img"
        src={src}
        alt={alt}
        loading="lazy"
        onClick={() => (revealed ? onZoom() : setRevealed(true))}
        title={revealed ? 'Click to enlarge' : 'Tap to reveal'}
      />
      {!revealed && (
        <button type="button" className="teased-veil" onClick={() => setRevealed(true)} aria-label="Reveal photo">
          <span className="teased-caption">{teaseFor(src)}</span>
          <span className="teased-cta">tap to reveal ›</span>
        </button>
      )}
    </div>
  )
}
