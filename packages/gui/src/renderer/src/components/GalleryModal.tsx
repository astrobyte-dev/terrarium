import { useEffect, useState } from 'react'
import type { GalleryEntry } from '../data/types'
import { deriveSlug } from '../data/slug'
import { Lightbox } from './Lightbox'

// A character's photo gallery: every /pic the daemon delivered for her, tagged by the
// active /be persona. Opened from the Characters screen; click a thumb to enlarge.
export function GalleryModal({ slug, name, onClose }: { slug: string; name: string; onClose: () => void }) {
  const [entries, setEntries] = useState<GalleryEntry[] | null>(null)
  const [zoom, setZoom] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') (zoom ? setZoom(null) : onClose())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoom, onClose])

  useEffect(() => {
    let alive = true
    window.terrarium?.gallery
      ?.list()
      .then((all) => {
        if (!alive) return
        setEntries(all.filter((e) => deriveSlug(e.character) === slug))
      })
      .catch(() => alive && setEntries([]))
    return () => {
      alive = false
    }
  }, [slug])

  return (
    <div className="gallery" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="gallery-panel" onClick={(e) => e.stopPropagation()}>
        <div className="gallery-head">
          <span className="gallery-title">{name}’s gallery</span>
          <button className="gallery-close" type="button" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        {entries === null ? (
          <p className="gallery-empty">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="gallery-empty">
            No photos yet. Photos she sends via <code>/pic</code> (while she’s the active <code>/be</code> character) show up
            here.
          </p>
        ) : (
          <div className="gallery-grid">
            {entries.map((e, i) => (
              <button
                key={`${e.image}-${i}`}
                type="button"
                className="gallery-thumb"
                onClick={() => setZoom(e.image)}
                title={e.caption || 'Enlarge'}
              >
                <img src={e.image} alt={e.caption || `photo of ${name}`} loading="lazy" />
              </button>
            ))}
          </div>
        )}
      </div>
      <Lightbox src={zoom} alt={`${name} photo`} onClose={() => setZoom(null)} />
    </div>
  )
}
