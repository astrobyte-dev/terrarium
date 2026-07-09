import { useEffect } from 'react'

// A full-screen image viewer. Click the backdrop or press Esc to close. Reusable
// for portrait candidates now and chat photos later.
export function Lightbox({ src, alt, onClose }: { src: string | null; alt?: string; onClose: () => void }) {
  useEffect(() => {
    if (!src) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [src, onClose])

  if (!src) return null
  return (
    <div className="lightbox" role="dialog" aria-modal="true" onClick={onClose}>
      <button className="lightbox-close" type="button" aria-label="Close" onClick={onClose}>
        ✕
      </button>
      <img className="lightbox-img" src={src} alt={alt ?? 'enlarged image'} onClick={(e) => e.stopPropagation()} />
    </div>
  )
}
