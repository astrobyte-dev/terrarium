import { useEffect, useRef, useState } from 'react'

// A full-screen image viewer. Esc closes; ← / → step through a set when onPrev/onNext are given.
// Zoom: mouse wheel or the − / + controls, double-click to toggle 1×↔2.5×, drag to pan when
// zoomed in. Zoom resets whenever the shown image changes. Reused by chat, gallery, portraits.
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
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const drag = useRef<{ x: number; y: number } | null>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  // Reset zoom/pan whenever the shown image changes (open or ←/→ nav).
  useEffect(() => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }, [src])

  useEffect(() => {
    if (!src) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft' && onPrev) onPrev()
      else if (e.key === 'ArrowRight' && onNext) onNext()
      else if (e.key === '+' || e.key === '=') setScale((s) => Math.min(6, s + 0.5))
      else if (e.key === '-' || e.key === '_') setScale((s) => Math.max(1, s - 0.5))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [src, onClose, onPrev, onNext])

  // Native, non-passive wheel listener so preventDefault works (React's onWheel is passive).
  useEffect(() => {
    const el = imgRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      setScale((s) => {
        const ns = Math.min(6, Math.max(1, s - e.deltaY * 0.0016))
        if (ns <= 1) setOffset({ x: 0, y: 0 })
        return ns
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [src])

  if (!src) return null

  const zoom = (delta: number) =>
    setScale((s) => {
      const ns = Math.min(6, Math.max(1, s + delta))
      if (ns <= 1) setOffset({ x: 0, y: 0 })
      return ns
    })

  return (
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      onMouseMove={(e) => {
        if (drag.current) setOffset({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y })
      }}
      onMouseUp={() => (drag.current = null)}
    >
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
      <img
        ref={imgRef}
        className="lightbox-img"
        src={src}
        alt={alt ?? 'enlarged image'}
        draggable={false}
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          cursor: scale > 1 ? 'grab' : 'zoom-in',
        }}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => {
          e.stopPropagation()
          setOffset({ x: 0, y: 0 })
          setScale((s) => (s > 1 ? 1 : 2.5))
        }}
        onMouseDown={(e) => {
          if (scale <= 1) return
          e.stopPropagation()
          drag.current = { x: e.clientX - offset.x, y: e.clientY - offset.y }
        }}
      />
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
      <div className="lightbox-zoom" onClick={(e) => e.stopPropagation()}>
        <button type="button" aria-label="Zoom out" onClick={() => zoom(-0.5)}>
          −
        </button>
        <span>{Math.round(scale * 100)}%</span>
        <button type="button" aria-label="Zoom in" onClick={() => zoom(0.5)}>
          +
        </button>
      </div>
    </div>
  )
}
