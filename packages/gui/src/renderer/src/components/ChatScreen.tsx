import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChatMsg, ChatStatus } from '../data/types'
import { deriveSlug } from '../data/slug'
import { CommandMenu } from './CommandMenu'
import { Lightbox } from './Lightbox'
import { MessageReactions } from './MessageReactions'

// A stable-enough key for a message to hang a reaction / deletion on (no server IDs).
const msgKey = (m: ChatMsg) => `${m.role}|${m.ts ?? 0}|${(m.text ?? '').slice(0, 50)}`
const REACTIONS_STORE = 'terrarium.reactions'
const DELETED_STORE = 'terrarium.deleted'

function loadStore<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '') as T
  } catch {
    return fallback
  }
}

function fmtTime(ts: number | null): string {
  if (!ts) return ''
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}

function connLabel(status: ChatStatus, connected: boolean, name: string): string {
  if (status.state === 'error') return status.detail || 'connection error'
  if (!connected) return 'connecting…'
  return `talking to ${name} — same brain & memory as Telegram`
}

// One brain, many personas: `/be <slug>` switches who's replying. The GUI can't see
// OpenClaw's active persona directly, so we infer it from the last `/be` in the log.
const BE_RE = /^\/be\s+([a-z0-9][a-z0-9-]*)/i
function lastPersonaSlug(messages: ChatMsg[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!
    if (m.role !== 'user') continue
    const hit = BE_RE.exec(m.text.trim())
    if (hit) return hit[1]!.toLowerCase()
  }
  return null
}
const titleCase = (s: string) => s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

/** Slug of the persona replying at message `idx` — from the most recent prior /be. */
function personaSlugAt(messages: ChatMsg[], idx: number): string | null {
  for (let i = idx; i >= 0; i--) {
    const m = messages[i]!
    if (m.role !== 'user') continue
    const hit = BE_RE.exec(m.text.trim())
    if (hit) return hit[1]!.toLowerCase()
  }
  return null
}

const personaName = (slug: string | null, names: Record<string, string>, fallback: string): string =>
  slug ? names[slug] ?? titleCase(slug) : fallback

// Roster cards read "Display — Real Name (age)"; the /be slug + face come from the
// SHORT display name (e.g. "Linh — Nguyễn Thị Linh" -> "Linh" -> "linh").
const shortName = (name: string): string => name.split(/\s[—–-]\s/)[0]!.trim()
const rosterSlug = (name: string): string => deriveSlug(shortName(name))

// The bot's disc: her chosen face (characters/refs/<slug>.png, served over
// terrarium://ref/) when she has one, else the first-letter fallback. When onZoom is
// given and a real face is showing, clicking enlarges it.
function BotAvatar({ name, slug, onZoom }: { name: string; slug: string | null; onZoom?: (src: string) => void }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [slug])
  if (slug && !failed) {
    const src = `terrarium://ref/${slug}.png`
    return (
      <img
        className={`msg-avatar-img ${onZoom ? 'zoomable' : ''}`}
        src={src}
        alt=""
        onError={() => setFailed(true)}
        onClick={onZoom ? () => onZoom(src) : undefined}
      />
    )
  }
  return <>{name.charAt(0).toUpperCase()}</>
}

const UserGlyph = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <circle cx="12" cy="8" r="3.4" />
    <path d="M5.5 20c0-3.6 3-5.5 6.5-5.5s6.5 1.9 6.5 5.5" />
  </svg>
)

export function ChatScreen({
  botName,
  messages,
  status,
  connected,
  send,
}: {
  botName: string
  messages: ChatMsg[]
  status: ChatStatus
  connected: boolean
  send: (text: string) => void
}) {
  const [draft, setDraft] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [names, setNames] = useState<Record<string, string>>({})
  const [roster, setRoster] = useState<{ slug: string; name: string }[]>([])
  // Locally hidden messages (delete / clear). GUI-side only — the shared brain still
  // remembers — but it sticks across restarts and reconnects.
  const [deleted, setDeleted] = useState<string[]>(() => loadStore<string[]>(DELETED_STORE, []))
  const [clearConfirm, setClearConfirm] = useState(false)
  useEffect(() => {
    try {
      localStorage.setItem(DELETED_STORE, JSON.stringify(deleted.slice(-2000)))
    } catch {
      /* best effort */
    }
  }, [deleted])
  const deletedSet = useMemo(() => new Set(deleted), [deleted])
  const visible = useMemo(() => messages.filter((m) => !deletedSet.has(msgKey(m))), [messages, deletedSet])
  const hideMsg = (m: ChatMsg) => setDeleted((prev) => [...prev, msgKey(m)])
  const clearChat = () => {
    setDeleted((prev) => [...prev, ...visible.map(msgKey)])
    setClearConfirm(false)
  }

  // Every photo in the log, in order, so the lightbox can arrow through them all.
  const allImages = useMemo(() => visible.flatMap((m) => m.images ?? []), [visible])
  const [zoomIdx, setZoomIdx] = useState<number | null>(null)
  const [faceZoom, setFaceZoom] = useState<string | null>(null)
  const stripSrc = zoomIdx != null ? allImages[zoomIdx] ?? null : null
  const zoomSrc = faceZoom ?? stripSrc // a face has no prev/next; the photo strip does
  const stripActive = faceZoom == null && zoomIdx != null

  // Local message reactions (👍❤️😂…), persisted across restarts in localStorage.
  const [reactions, setReactions] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem(REACTIONS_STORE) ?? '{}') as Record<string, string>
    } catch {
      return {}
    }
  })
  const [pickerKey, setPickerKey] = useState<string | null>(null)
  useEffect(() => {
    try {
      localStorage.setItem(REACTIONS_STORE, JSON.stringify(reactions))
    } catch {
      /* best effort */
    }
  }, [reactions])
  // Reactions are a silent, local badge — no message is sent to the conversation.
  const react = (m: ChatMsg, emoji: string) => {
    const key = msgKey(m)
    setReactions((prev) => {
      const next = { ...prev }
      if (next[key] === emoji) delete next[key] // toggle off
      else next[key] = emoji
      return next
    })
    setPickerKey(null)
  }
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Resolve the active persona: slug from the last /be, display name from the roster.
  const activeSlug = lastPersonaSlug(messages)
  const activeName = personaName(activeSlug, names, botName)

  // Load the roster once so a /be slug can show its proper display name.
  useEffect(() => {
    let alive = true
    window.terrarium?.characters
      ?.list()
      .then((r) => {
        if (!alive) return
        const map: Record<string, string> = {}
        for (const c of r.cards) map[rosterSlug(c.name)] = shortName(c.name)
        setNames(map)
        setRoster(r.cards.map((c) => ({ slug: rosterSlug(c.name), name: shortName(c.name) })))
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const insertCmd = (text: string) => {
    setDraft(text)
    inputRef.current?.focus()
  }
  const sendCmd = (text: string) => send(text)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, status.state])

  const sendMsg = () => {
    const text = draft.trim()
    if (!text || !connected) return
    setDraft('')
    send(text)
  }

  // Index of the most recent photo message — /hd upscales the LATEST photo, so the HD
  // button only makes sense there. Redo/×3 re-fire a specific shot's own command.
  let lastImageIdx = -1
  visible.forEach((m, i) => {
    if (m.images && m.images.length > 0) lastImageIdx = i
  })

  return (
    <div className="chat-shell">
      <aside className="chat-roster">
        <span className="chat-roster-head">Characters</span>
        <div className="chat-roster-list">
          {roster.length === 0 && <span className="chat-roster-empty">No characters yet.</span>}
          {roster.map((c) => (
            <button
              key={c.slug}
              type="button"
              className={`chat-roster-item ${activeSlug === c.slug ? 'active' : ''}`}
              disabled={!connected}
              title={`Switch to ${c.name} (/be ${c.slug})`}
              onClick={() => send(`/be ${c.slug}`)}
            >
              <span className="chat-roster-face">
                <BotAvatar name={c.name} slug={c.slug} />
              </span>
              <span className="chat-roster-name">{c.name}</span>
            </button>
          ))}
        </div>
      </aside>

      <div className="chat">
      <div className="chat-head">
        <span className="chat-title">Chat with {activeName}</span>
        <span className={`chat-conn ${connected ? 'on' : status.state === 'error' ? 'err' : ''}`}>
          {connLabel(status, connected, activeName)}
        </span>
        {visible.length > 0 &&
          (clearConfirm ? (
            <span className="chat-clear-confirm">
              Clear this view?
              <button type="button" className="chat-clear-yes" onClick={clearChat}>
                Clear
              </button>
              <button type="button" className="chat-clear-no" onClick={() => setClearConfirm(false)}>
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="chat-clear"
              title="Hide all messages from this view — stays in her memory"
              onClick={() => setClearConfirm(true)}
            >
              Clear
            </button>
          ))}
      </div>

      <div className="chat-log">
        {visible.length === 0 && status.state !== 'error' && (
          <div className="chat-empty">Say hi to start — this is the same conversation as Telegram.</div>
        )}
        {status.state === 'error' && (
          <div className="chat-error">Couldn’t reach the gateway. Is it running? {status.detail}</div>
        )}

        {visible.map((m, i) => {
          const prev = visible[i - 1]
          const runStart = !prev || prev.role !== m.role
          const slug = m.role === 'assistant' ? personaSlugAt(visible, i) : null
          const who = m.role === 'assistant' ? personaName(slug, names, botName) : 'You'
          const key = msgKey(m)
          return (
            <div className={`msg-row ${m.role} ${runStart ? 'run-start' : ''}`} key={i}>
              <div className="msg-avatar" aria-hidden="true">
                {m.role === 'assistant' ? <BotAvatar name={who} slug={slug} onZoom={setFaceZoom} /> : <UserGlyph />}
              </div>
              <div className="msg-col">
                {runStart && <span className="msg-name">{who}</span>}
                <div className="msg-bubble-wrap">
                {m.images && m.images.length > 0 ? (
                  <div className="msg-media">
                    {m.images.map((src) => (
                      <img
                        key={src}
                        className="chat-img"
                        src={src}
                        alt={m.text || `photo from ${who}`}
                        loading="lazy"
                        onClick={() => setZoomIdx(allImages.indexOf(src))}
                        title="Click to enlarge"
                      />
                    ))}
                    {m.text && <div className="bubble caption">{m.text}</div>}
                    {connected && (m.command || i === lastImageIdx) && (
                      <div className="pic-actions">
                        {m.command && (
                          <>
                            <button type="button" onClick={() => sendCmd(m.command!)}>
                              ↻ Redo
                            </button>
                            <button type="button" onClick={() => sendCmd(m.command!.replace(/\s+x[2-4]\b/gi, '') + ' x3')}>
                              ×3
                            </button>
                          </>
                        )}
                        {i === lastImageIdx && (
                          <button type="button" onClick={() => sendCmd('/hd')}>
                            HD
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bubble">{m.text}</div>
                )}
                  <div className="msg-tools">
                    <button
                      type="button"
                      className="msg-tool"
                      aria-label="React"
                      title="React"
                      onClick={() => setPickerKey(pickerKey === key ? null : key)}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M8.5 14.5c.9 1.2 2.1 1.8 3.5 1.8s2.6-.6 3.5-1.8" />
                        <path d="M9 9.5h.01M15 9.5h.01" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="msg-tool del"
                      aria-label="Delete message"
                      title="Delete for me (stays in her memory)"
                      onClick={() => hideMsg(m)}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
                        <path d="M6 6l12 12M18 6L6 18" />
                      </svg>
                    </button>
                  </div>
                  <MessageReactions reaction={reactions[key]} open={pickerKey === key} onPick={(e) => react(m, e)} />
                </div>
                <span className="msg-time">{fmtTime(m.ts)}</span>
              </div>
            </div>
          )
        })}

        {status.state === 'sending' && (
          <div className="msg-row assistant run-start" aria-label={`${activeName} is typing`}>
            <div className="msg-avatar" aria-hidden="true">
              <BotAvatar name={activeName} slug={activeSlug} />
            </div>
            <div className="msg-col">
              <div className="bubble typing">
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault()
          sendMsg()
        }}
      >
        <CommandMenu
          open={menuOpen}
          onOpenChange={setMenuOpen}
          onInsert={insertCmd}
          onSend={sendCmd}
          disabled={!connected}
        />
        <span
          className={`chat-peek ${draft.trim() !== '' ? 'up' : ''}`}
          aria-hidden="true"
          title={`${activeName} is watching`}
        >
          {activeSlug ? (
            <BotAvatar name={activeName} slug={activeSlug} />
          ) : (
            activeName.charAt(0).toUpperCase()
          )}
        </span>
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={connected ? `Message ${activeName}…` : 'Connecting…'}
          disabled={!connected}
          aria-label="Message"
        />
        <button className="btn-primary" type="submit" disabled={!connected || draft.trim() === ''}>
          Send
        </button>
      </form>

      {pickerKey && <div className="react-backdrop" onClick={() => setPickerKey(null)} />}
      <Lightbox
        src={zoomSrc}
        alt="chat photo"
        onClose={() => {
          setZoomIdx(null)
          setFaceZoom(null)
        }}
        onPrev={stripActive && zoomIdx! > 0 ? () => setZoomIdx(zoomIdx! - 1) : undefined}
        onNext={stripActive && zoomIdx! < allImages.length - 1 ? () => setZoomIdx(zoomIdx! + 1) : undefined}
      />
      </div>
    </div>
  )
}
