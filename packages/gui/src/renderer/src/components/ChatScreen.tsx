import { useEffect, useRef, useState } from 'react'
import type { ChatMsg, ChatStatus } from '../data/types'
import { deriveSlug } from '../data/slug'
import { CommandMenu } from './CommandMenu'
import { Lightbox } from './Lightbox'

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

/** Who was replying at message `idx` — the persona from the most recent prior /be. */
function personaAt(messages: ChatMsg[], idx: number, names: Record<string, string>, fallback: string): string {
  for (let i = idx; i >= 0; i--) {
    const m = messages[i]!
    if (m.role !== 'user') continue
    const hit = BE_RE.exec(m.text.trim())
    if (hit) {
      const slug = hit[1]!.toLowerCase()
      return names[slug] ?? titleCase(slug)
    }
  }
  return fallback
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
  const [zoom, setZoom] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Resolve the active persona: slug from the last /be, display name from the roster.
  const activeSlug = lastPersonaSlug(messages)
  const activeName = activeSlug ? names[activeSlug] ?? titleCase(activeSlug) : botName
  const botInitial = activeName.charAt(0).toUpperCase()

  // Load the roster once so a /be slug can show its proper display name.
  useEffect(() => {
    let alive = true
    window.terrarium?.characters
      ?.list()
      .then((r) => {
        if (!alive) return
        const map: Record<string, string> = {}
        for (const c of r.cards) map[deriveSlug(c.name)] = c.name
        setNames(map)
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
  messages.forEach((m, i) => {
    if (m.images && m.images.length > 0) lastImageIdx = i
  })

  return (
    <div className="chat">
      <div className="chat-head">
        <span className="chat-title">Chat with {activeName}</span>
        <span className={`chat-conn ${connected ? 'on' : status.state === 'error' ? 'err' : ''}`}>
          {connLabel(status, connected, activeName)}
        </span>
      </div>

      <div className="chat-log">
        {messages.length === 0 && status.state !== 'error' && (
          <div className="chat-empty">Say hi to start — this is the same conversation as Telegram.</div>
        )}
        {status.state === 'error' && (
          <div className="chat-error">Couldn’t reach the gateway. Is it running? {status.detail}</div>
        )}

        {messages.map((m, i) => {
          const prev = messages[i - 1]
          const runStart = !prev || prev.role !== m.role
          const who = m.role === 'assistant' ? personaAt(messages, i, names, botName) : 'You'
          return (
            <div className={`msg-row ${m.role} ${runStart ? 'run-start' : ''}`} key={i}>
              <div className="msg-avatar" aria-hidden="true">
                {m.role === 'assistant' ? who.charAt(0).toUpperCase() : <UserGlyph />}
              </div>
              <div className="msg-col">
                {runStart && <span className="msg-name">{who}</span>}
                {m.images && m.images.length > 0 ? (
                  <div className="msg-media">
                    {m.images.map((src) => (
                      <img
                        key={src}
                        className="chat-img"
                        src={src}
                        alt={m.text || `photo from ${who}`}
                        loading="lazy"
                        onClick={() => setZoom(src)}
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
                <span className="msg-time">{fmtTime(m.ts)}</span>
              </div>
            </div>
          )
        })}

        {status.state === 'sending' && (
          <div className="msg-row assistant run-start" aria-label={`${activeName} is typing`}>
            <div className="msg-avatar" aria-hidden="true">
              {botInitial}
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
          {botInitial}
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

      <Lightbox src={zoom} alt="chat photo" onClose={() => setZoom(null)} />
    </div>
  )
}
