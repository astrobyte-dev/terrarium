import { useEffect, useRef, useState } from 'react'

// "What she remembers about you." Edits the brain's curated long-term memory
// (workspace/MEMORY.md). Auto-facts the pic daemon noticed are shown below, read-only,
// each pinnable up into the durable list. Saves the whole list on every change.
export function MemoryModal({ onClose }: { onClose: () => void }) {
  const [memories, setMemories] = useState<string[]>([])
  const [facts, setFacts] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)
  const [draft, setDraft] = useState('')
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)

  useEffect(() => {
    window.terrarium?.memory
      ?.list()
      .then((v) => {
        setMemories(v.memories)
        setFacts(v.facts)
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  // Persist the full list on any change; flash a subtle "saved".
  const persist = (next: string[]) => {
    setMemories(next)
    window.terrarium?.memory?.save(next).catch(() => {})
    setSavedFlash(true)
    if (savedTimer.current) clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => setSavedFlash(false), 1200)
  }

  const add = () => {
    const t = draft.trim()
    if (!t) return
    persist([...memories, t])
    setDraft('')
  }
  const remove = (i: number) => persist(memories.filter((_, k) => k !== i))
  const commitEdit = () => {
    if (editIdx == null) return
    const t = editText.trim()
    persist(t ? memories.map((m, k) => (k === editIdx ? t : m)) : memories.filter((_, k) => k !== editIdx))
    setEditIdx(null)
  }
  const pin = (fact: string) => {
    persist([...memories, fact])
    setFacts((prev) => prev.filter((f) => f !== fact))
  }

  return (
    <div className="mem-backdrop" onClick={onClose}>
      <div className="mem-modal" role="dialog" aria-label="Memories" onClick={(e) => e.stopPropagation()}>
        <div className="mem-head">
          <span className="mem-title">What she remembers about you</span>
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
              placeholder="Add something she should always remember…"
              aria-label="New memory"
            />
            <button type="button" className="btn-primary" onClick={add} disabled={draft.trim() === ''}>
              Add
            </button>
          </div>

          {!loaded ? (
            <p className="mem-empty">Loading…</p>
          ) : memories.length === 0 ? (
            <p className="mem-empty">Nothing pinned yet. Add a memory above, or pin one she’s noticed below.</p>
          ) : (
            <ul className="mem-list">
              {memories.map((m, i) => (
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
                      <button type="button" className="mem-x" aria-label="Forget" title="Forget this" onClick={() => remove(i)}>
                        ✕
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          {facts.length > 0 && (
            <div className="mem-facts">
              <span className="mem-facts-head">She’s also noticed</span>
              <ul className="mem-list">
                {facts.map((f) => (
                  <li key={f} className="mem-item noticed">
                    <span className="mem-text">{f}</span>
                    <button type="button" className="mem-pin" title="Pin to durable memory" onClick={() => pin(f)}>
                      ＋ pin
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <p className="mem-note">
          Saved to her curated long-term memory (main chat). She recalls these — but memory is read as
          she needs it, so a brand-new note may take a message or two to surface.
        </p>
      </div>
    </div>
  )
}
