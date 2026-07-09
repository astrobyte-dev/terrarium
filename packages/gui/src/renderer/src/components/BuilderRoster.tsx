import { useCallback, useEffect, useState } from 'react'
import type { RosterCardView, RosterView } from '../data/types'
import { deriveSlug } from '../data/slug'

// The always-present character list in the Bot Builder aside: edit a companion's bio
// (loads her back into the form) or delete her. `refreshKey` bumps to reload after a
// create/save/delete elsewhere in the builder.
export function BuilderRoster({
  refreshKey,
  editingSlug,
  onEdit,
}: {
  refreshKey: number
  editingSlug: string | null
  onEdit: (slug: string, heading: string) => void
}) {
  const [roster, setRoster] = useState<RosterView | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const c = window.terrarium?.characters
    if (!c) return
    setRoster(await c.list())
  }, [])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  const remove = async (heading: string) => {
    setConfirming(null)
    setBusy(true)
    const r = await window.terrarium.characters.remove(heading)
    setBusy(false)
    if (r.ok && r.roster) setRoster(r.roster)
  }

  const cards = roster?.cards ?? []
  return (
    <div className="bb-roster">
      <div className="bb-section">Your characters</div>
      {cards.length === 0 && <p className="bb-hint">No characters yet — create your first below.</p>}
      {cards.map((c: RosterCardView) => {
        const slug = deriveSlug(c.name)
        const isEditing = editingSlug === slug
        return (
          <div className={`bb-roster-row ${isEditing ? 'editing' : ''}`} key={c.heading}>
            <span className="bb-roster-name">
              {c.name} <span className="bb-roster-age">({c.age})</span>
            </span>
            {confirming === c.heading ? (
              <span className="bb-roster-confirm">
                <button className="bb-roster-del" type="button" onClick={() => void remove(c.heading)}>
                  Delete
                </button>
                <button className="bb-roster-cancel" type="button" onClick={() => setConfirming(null)}>
                  Cancel
                </button>
              </span>
            ) : (
              <span className="bb-roster-actions">
                <button className="bb-roster-edit" type="button" disabled={busy} onClick={() => onEdit(slug, c.heading)}>
                  Edit
                </button>
                <button className="bb-roster-remove" type="button" disabled={busy} onClick={() => setConfirming(c.heading)}>
                  Delete
                </button>
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
