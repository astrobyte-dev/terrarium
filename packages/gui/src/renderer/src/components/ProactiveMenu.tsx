import { useEffect, useState } from 'react'
import type { ProactiveSettings } from '../../../shared/contract'

// "She texts you first" — the little bell in the chat header. Loads/saves the
// idle-aware proactive settings; everything runs in main, this is just the dial.
const IDLE_HOURS = [1, 2, 3, 4, 6, 8, 12]
const CAPS = [1, 2, 3, 4, 5]
const HOURS = Array.from({ length: 24 }, (_, h) => h)
const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`

export function ProactiveMenu() {
  const [open, setOpen] = useState(false)
  const [s, setS] = useState<ProactiveSettings | null>(null)

  useEffect(() => {
    window.terrarium?.proactive?.get().then(setS).catch(() => {})
  }, [])

  if (!s) return null
  const patch = (p: Partial<ProactiveSettings>) => {
    setS((prev) => (prev ? { ...prev, ...p } : prev))
    window.terrarium?.proactive?.set(p).then(setS).catch(() => {})
  }

  return (
    <span className="pro-menu">
      <button
        type="button"
        className={`chat-clear pro-bell ${s.enabled ? 'on' : ''}`}
        title={s.enabled ? 'She texts you first — on' : 'She texts you first — off'}
        aria-label="Proactive messages"
        onClick={() => setOpen((o) => !o)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
          {!s.enabled && <path d="M4 3l16 18" stroke="currentColor" />}
        </svg>
      </button>

      {open && (
        <>
          <div className="pro-backdrop" onClick={() => setOpen(false)} />
          <div className="pro-pop" role="dialog" aria-label="Proactive message settings">
            <label className="pro-row pro-head">
              <span>She texts me first</span>
              <input type="checkbox" checked={s.enabled} onChange={(e) => patch({ enabled: e.target.checked })} />
            </label>

            <div className={`pro-body ${s.enabled ? '' : 'dim'}`}>
              <label className="pro-row">
                <span>After I&apos;ve been quiet</span>
                <select
                  value={IDLE_HOURS.reduce((a, b) => (Math.abs(b - s.minIdleMinutes / 60) < Math.abs(a - s.minIdleMinutes / 60) ? b : a))}
                  onChange={(e) => patch({ minIdleMinutes: Number(e.target.value) * 60 })}
                >
                  {IDLE_HOURS.map((h) => (
                    <option key={h} value={h}>{h}h</option>
                  ))}
                </select>
              </label>

              <label className="pro-row">
                <span>Only between</span>
                <span className="pro-hours">
                  <select value={s.wakingStartHour} onChange={(e) => patch({ wakingStartHour: Number(e.target.value) })}>
                    {HOURS.map((h) => (
                      <option key={h} value={h}>{hourLabel(h)}</option>
                    ))}
                  </select>
                  <span className="pro-dash">–</span>
                  <select value={s.wakingEndHour} onChange={(e) => patch({ wakingEndHour: Number(e.target.value) })}>
                    {HOURS.map((h) => (
                      <option key={h} value={h}>{hourLabel(h)}</option>
                    ))}
                  </select>
                </span>
              </label>

              <label className="pro-row">
                <span>Max per day</span>
                <select value={s.maxPerDay} onChange={(e) => patch({ maxPerDay: Number(e.target.value) })}>
                  {CAPS.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </label>
            </div>

            <p className="pro-note">
              She reaches out on her own when you&apos;ve gone quiet — in-app only, in character.
            </p>
          </div>
        </>
      )}
    </span>
  )
}
