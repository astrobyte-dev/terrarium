import { useEffect } from 'react'

// The commands the pic daemon understands (it tails the shared session, so these
// work from the in-app chat exactly as on Telegram). `insert` drops text into the
// draft for the user to finish; `send` fires immediately (no argument needed).
interface Cmd {
  label: string
  desc: string
  insert?: string
  send?: string
}

const PHOTO: Cmd[] = [
  { label: '/pic', insert: '/pic ', desc: 'Take a photo — add a scene, e.g. “on the beach”' },
  { label: '/pic?', send: '/pic?', desc: 'Suggest photo ideas from the current scene' },
  { label: '/hd', send: '/hd', desc: 'Upscale the last photo to HD' },
  { label: '/again', send: '/again', desc: 'Redo the last photo' },
]
const CHARACTER: Cmd[] = [{ label: '/be', insert: '/be ', desc: 'Switch character, e.g. “/be luna”' }]

export function CommandMenu({
  open,
  onOpenChange,
  onInsert,
  onSend,
  disabled,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onInsert: (text: string) => void
  onSend: (text: string) => void
  disabled: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  const fire = (c: Cmd) => {
    if (c.insert !== undefined) onInsert(c.insert)
    else if (c.send !== undefined) onSend(c.send)
    onOpenChange(false)
  }

  const group = (title: string, cmds: Cmd[]) => (
    <>
      <div className="cmd-group-label">{title}</div>
      {cmds.map((c) => (
        <button key={c.label} className="cmd-item" role="menuitem" type="button" onClick={() => fire(c)}>
          <span className="cmd-name">{c.label}</span>
          <span className="cmd-desc">{c.desc}</span>
        </button>
      ))}
    </>
  )

  return (
    <div className="cmd-wrap">
      {open && <div className="cmd-backdrop" onClick={() => onOpenChange(false)} aria-hidden="true" />}
      {open && (
        <div className="cmd-menu" role="menu" aria-label="Commands">
          {group('Photos', PHOTO)}
          {group('Character', CHARACTER)}
          <p className="cmd-tip">
            Tip: add <b>anime</b> or <b>x3</b> to a /pic, or use <b>/pic!</b> to send only your own words.
          </p>
        </div>
      )}
      <button
        type="button"
        className={`cmd-trigger ${open ? 'on' : ''}`}
        aria-label="Commands"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => onOpenChange(!open)}
        title="Commands"
      >
        /
      </button>
    </div>
  )
}
