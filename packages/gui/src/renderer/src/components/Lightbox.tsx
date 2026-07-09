import { useEffect } from 'react'

// A full-screen image viewer. Esc closes; when onPrev/onNext are supplied, ← / →
// (and on-screen arrows) step through a set. Reused by chat, gallery, and portraits.
export function Lightbox({
  src,
  alt,
  onClose,
  onPrev,
  onNext,
}: {
  src: string | null
  alt?: string
  onClose: () => void
  onPrev?: () => void
  onNext?: () => void
}) {
  useEffect(() => {
    if (!src) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft' && onPrev) onPrev()
      else if (e.key === 'ArrowRight' && onNext) onNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [src, onClose, onPrev, onNext])

  if (!src) return null
  return (
    <div className="lightbox" role="dialog" aria-modal="true" onClick={onClose}>
      <button className="lightbox-close" type="button" aria-label="Close" onClick={onClose}>
        ✕
      </button>
      {onPrev && (
        <button
          className="lightbox-nav prev"
          type="button"
          aria-label="Previous"
          onClick={(e) => {
            e.stopPropagation()
            onPrev()
          }}
        >
          ‹
        </button>
      )}
      <img className="lightbox-img" src={src} alt={alt ?? 'enlarged image'} onClick={(e) => e.stopPropagation()} />
      {onNext && (
        <button
          className="lightbox-nav next"
          type="button"
          aria-label="Next"
          onClick={(e) => {
            e.stopPropagation()
            onNext()
          }}
        >
          ›
        </button>
      )}
    </div>
  )
}
