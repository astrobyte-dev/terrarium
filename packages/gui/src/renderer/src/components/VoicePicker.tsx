import { useRef, useState } from 'react'
import type { VoiceCatalogView } from '../../../shared/contract'

// Per-character voice = a Kokoro preset, saved by /be slug. Dropdown + a ▶ preview
// that speaks a sample line in the chosen voice.
export function VoicePicker({ slug, catalog }: { slug: string; catalog: VoiceCatalogView }) {
  const [voice, setVoice] = useState(catalog.map[slug] ?? '')
  const [previewing, setPreviewing] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const change = (id: string) => {
    setVoice(id)
    window.terrarium?.voice?.setVoice(slug, id).catch(() => {})
  }
  const preview = async () => {
    setPreviewing(true)
    try {
      const r = await window.terrarium.voice.preview(voice || catalog.default)
      if (r.ok && r.url) {
        if (!audioRef.current) audioRef.current = new Audio()
        audioRef.current.src = r.url
        audioRef.current.onended = () => setPreviewing(false)
        await audioRef.current.play()
        return
      }
    } catch {
      /* ignore */
    }
    setPreviewing(false)
  }

  return (
    <span className="voice-pick" title="Her voice (Kokoro preset)">
      <span className="voice-pick-ico" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 5 6 9H3v6h3l5 4V5z" />
          <path d="M15.5 8.5a5 5 0 0 1 0 7" />
        </svg>
      </span>
      <select value={voice} onChange={(e) => change(e.target.value)} aria-label={`Voice for ${slug}`}>
        <option value="">Default</option>
        {catalog.voices.map((v) => (
          <option key={v.id} value={v.id}>
            {v.label} · {v.gender === 'female' ? '♀' : '♂'} {v.accent}
          </option>
        ))}
      </select>
      <button type="button" className="voice-prev" title="Preview voice" disabled={previewing} onClick={preview}>
        {previewing ? '…' : '▶'}
      </button>
    </span>
  )
}
