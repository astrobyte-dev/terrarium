import { useEffect, useRef, useState } from 'react'

// "Always in her photos." A personal list of phrases baked into every /pic on top of
// whatever you type in the chat box — e.g. quality tags, a lighting style, "always barefoot".
// Persisted into gen_settings.json (alwaysInclude), which the pic daemon reads on each /pic.
// Reuses the memory modal's look (mem-* classes) for consistency.
export function PicExtrasModal({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)
  const [draft, setDraft] = useState('')
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)

  useEffect(() => {
    window.terrarium?.gen
      ?.get()
      .then((g) => {
        setItems(g.alwaysInclude ?? [])
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  const persist = (next: string[]) => {
    setItems(next)
    window.terrarium?.gen?.set({ alwaysInclude: next }).catch(() => {})
    setSavedFlash(true)
    if (savedTimer.current) clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => setSavedFlash(false), 1200)
  }

  const add = () => {
    const t = draft.trim()
    if (!t) return
    persist([...items, t])
    setDraft('')
  }
  const remove = (i: number) => persist(items.filter((_, k) => k !== i))
  const commitEdit = () => {
    if (editIdx == null) return
    const t = editText.trim()
    persist(t ? items.map((m, k) => (k === editIdx ? t : m)) : items.filter((_, k) => k !== editIdx))
    setEditIdx(null)
  }

  return (
    <div className="mem-backdrop" onClick={onClose}>
      <div className="mem-modal" role="dialog" aria-label="Always in her photos" onClick={(e) => e.stopPropagation()}>
        <div className="mem-head">
          <span className="mem-title">Always in her photos</span>
          <span className={`mem-saved ${savedFlash ? 'on' : ''}`}>saved</span>
          <button type="button" className="mem-close" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="mem-body">
          <div className="mem-add">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && add()}
              placeholder="Add something to always include… (e.g. soft lighting, barefoot)"
              aria-label="New always-include phrase"
            />
            <button type="button" className="btn-primary" onClick={add} disabled={draft.trim() === ''}>
              Add
            </button>
          </div>

          {!loaded ? (
            <p className="mem-empty">Loading…</p>
          ) : items.length === 0 ? (
            <p className="mem-empty">
              Nothing yet. Add a phrase above — it’ll be woven into every photo on top of what you type.
            </p>
          ) : (
            <ul className="mem-list">
              {items.map((m, i) => (
                <li key={i} className="mem-item">
                  {editIdx === i ? (
                    <input
                      className="mem-edit"
                      autoFocus
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitEdit()
                        if (e.key === 'Escape') setEditIdx(null)
                      }}
                      onBlur={commitEdit}
                    />
                  ) : (
                    <>
                      <span
                        className="mem-text"
                        onClick={() => {
                          setEditIdx(i)
                          setEditText(m)
                        }}
                        title="Click to edit"
                      >
                        {m}
                      </span>
                      <button
                        type="button"
                        className="mem-x"
                        aria-label="Remove"
                        title="Remove this"
                        onClick={() => remove(i)}
                      >
                        ✕
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="mem-note">
          Added to every <code>/pic</code> on top of what you type in the chat box. Great for quality tags,
          a lighting look, or a detail you always want. Skipped only in strict <code>/pic!</code> mode.
        </p>
      </div>
    </div>
  )
}
