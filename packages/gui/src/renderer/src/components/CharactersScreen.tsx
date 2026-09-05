import { useCallback, useEffect, useState } from 'react'
import type { RosterCardView, RosterView } from '../data/types'
import type { VoiceCatalogView } from '../../../shared/contract'
import { deriveSlug } from '../data/slug'
import { GalleryModal } from './GalleryModal'
import { VoicePicker } from './VoicePicker'

// The character library is unbounded. OpenClaw's ~12k AGENTS.md limit applies only
// to the one compact card activated for the current shared chat.
export function CharactersScreen({ onEdit }: { onEdit: (slug: string, heading: string) => void }) {
  const [roster, setRoster] = useState<RosterView | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [purgeConfirm, setPurgeConfirm] = useState<string | null>(null)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [gallery, setGallery] = useState<{ slug: string; name: string } | null>(null)
  const [voiceCat, setVoiceCat] = useState<VoiceCatalogView | null>(null)

  const load = useCallback(async () => {
    const c = window.terrarium?.characters
    if (!c) return
    setBusy(true)
    try { setRoster(await c.list()) }
    catch (error) { setNote({ ok: false, text: error instanceof Error ? error.message : String(error) }) }
    finally { setBusy(false) }
  }, [])

  useEffect(() => {
    window.terrarium?.voice?.catalog().then(setVoiceCat).catch(() => {})
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const remove = async (heading: string) => {
    setConfirming(null)
    setBusy(true)
    setNote(null)
    const r = await window.terrarium.characters.remove(heading)
    setBusy(false)
    setNote({ ok: r.ok, text: r.message })
    if (r.ok && r.roster) setRoster(r.roster)
  }
  const purge = async (slug: string) => {
    setPurgeConfirm(null)
    setBusy(true)
    const r = await window.terrarium.characters.deletePermanently(slug)
    setBusy(false)
    setNote({ ok: r.ok, text: r.message })
    if (r.roster) setRoster(r.roster)
  }

  const usedPct = roster ? Math.min(100, Math.round((roster.totalChars / roster.limit) * 100)) : 0
  const nearFull = roster ? roster.headroom < 800 : false

  return (
    <div className="chars">
      <header className="chars-head">
        <div>
          <h2>Characters</h2>
          <p>
            Your character library is stored separately. OpenClaw only loads the selected character into shared <code>AGENTS.md</code>,
            so the prompt budget does not limit how many companions you can keep.
          </p>
        </div>
        <button className="bb-check" type="button" disabled={busy} onClick={() => void load()}>
          {busy ? '…' : 'Refresh'}
        </button>
      </header>

      {roster && (
        <div className={`chars-budget ${nearFull ? 'tight' : ''}`}>
          <div className="chars-budget-row">
            <span>Active prompt budget</span>
            <span className="chars-budget-num">
              {roster.totalChars} / {roster.limit} chars · {Math.max(0, roster.headroom)} free
            </span>
          </div>
          <div className="chars-bar">
            <i style={{ width: `${usedPct}%` }} />
          </div>
        </div>
      )}

      {note && <div className={`chars-note ${note.ok ? 'ok' : 'err'}`}>{note.text}</div>}

      <div className="chars-list">
        {(roster?.cards ?? []).map((c: RosterCardView) => (
          <div className="chars-card" key={c.heading}>
            <div className="chars-card-main">
              <span className="chars-name">
                {c.name} <span className="chars-age">({c.age})</span>
              </span>
              <span className="chars-size">{c.chars} chars</span>
            </div>
            {confirming === c.heading ? (
              <div className="chars-confirm">
                <span>Remove {c.name}?</span>
                <button className="chars-del" type="button" onClick={() => void remove(c.heading)}>
                  Remove
                </button>
                <button className="chars-cancel" type="button" onClick={() => setConfirming(null)}>
                  Cancel
                </button>
              </div>
            ) : purgeConfirm === c.heading ? (
              <div className="chars-confirm">
                <span>PERMANENTLY delete {c.name} and clear every shared chat/image log?</span>
                <button className="chars-del" type="button" onClick={() => void purge((c.slug ?? deriveSlug(c.name)))}>Delete everything</button>
                <button className="chars-cancel" type="button" onClick={() => setPurgeConfirm(null)}>Cancel</button>
              </div>
            ) : (
              <span className="chars-actions">
                {voiceCat?.ready && <VoicePicker slug={(c.slug ?? deriveSlug(c.name))} catalog={voiceCat} />}
                <button
                  className="chars-edit"
                  type="button"
                  disabled={busy}
                  onClick={() => setGallery({ slug: (c.slug ?? deriveSlug(c.name)), name: c.name })}
                >
                  Gallery
                </button>
                <button
                  className="chars-edit"
                  type="button"
                  disabled={busy}
                  onClick={() => onEdit((c.slug ?? deriveSlug(c.name)), c.heading)}
                >
                  Edit
                </button>
                <button className="chars-remove" type="button" disabled={busy} onClick={() => setConfirming(c.heading)}>
                  Remove
                </button>
                <button className="chars-del" type="button" disabled={busy} onClick={() => setPurgeConfirm(c.heading)}>
                  Delete permanently
                </button>
              </span>
            )}
          </div>
        ))}
        {roster && roster.cards.length === 0 && <p className="chars-empty">No character cards found in AGENTS.md.</p>}
      </div>

      <p className="chars-foot">
        Removing a card frees its budget and drops the persona from <code>/be</code> — it backs up AGENTS.md first and
        takes effect on the next message. The character's full card file stays on disk (it doesn't count toward the budget).
      </p>

      {gallery && <GalleryModal slug={gallery.slug} name={gallery.name} onClose={() => setGallery(null)} />}
    </div>
  )
}
