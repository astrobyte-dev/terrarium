import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatMsg, ChatStatus } from '../data/types'

// Live `chat` events arrive with ts=null; stamp arrival time on receipt so every
// bubble sorts and renders with a time.
const stamp = (m: ChatMsg): ChatMsg => (m.ts ? m : { ...m, ts: Date.now() })

const sameImages = (a?: string[], b?: string[]) =>
  (a ?? []).length === (b ?? []).length && (a ?? []).every((v, i) => v === (b ?? [])[i])

function reconcile(prev: ChatMsg[], incoming: ChatMsg): ChatMsg[] {
  const m = stamp(incoming)
  const last = prev[prev.length - 1]
  // Collapse the gateway's consecutive duplicate replies — but never fold two
  // distinct photos together (their captions can match, their images won't).
  if (last && last.role === m.role && last.text === m.text && sameImages(last.images, m.images)) return prev
  return [...prev, m]
}

// Merge the gateway's text history with Terrarium's persisted pic history by time,
// so reopening the app shows recent photos back in their place in the conversation.
function mergeByTime(text: ChatMsg[], pics: ChatMsg[]): ChatMsg[] {
  return [...text, ...pics].map(stamp).sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0))
}

/**
 * Owns the single chat connection for the whole app so inbound messages (and the
 * unread badge) work even when the Chat screen isn't mounted. ChatScreen renders
 * this state; App derives the unread count from it.
 */
export function useChat() {
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [status, setStatus] = useState<ChatStatus>({ state: 'connecting', detail: '' })
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const chat = window.terrarium?.chat
    if (!chat) return
    const offMsg = chat.onMessage((m) => setMessages((prev) => reconcile(prev, m)))
    const offStatus = chat.onStatus(setStatus)
    chat
      .connect()
      .then(async (res) => {
        if (res.ok) {
          const pics = (await window.terrarium?.inbox?.recent().catch(() => [])) ?? []
          setMessages(mergeByTime(res.history, pics))
          setConnected(true)
          setStatus({ state: 'ready', detail: 'connected' })
        } else {
          setStatus({ state: 'error', detail: res.message ?? 'could not connect to the gateway' })
        }
      })
      .catch((e: unknown) => setStatus({ state: 'error', detail: String(e) }))
    return () => {
      offMsg()
      offStatus()
    }
  }, [])

  const send = useCallback(
    (text: string) => {
      if (connected) void window.terrarium.chat.send(text)
    },
    [connected],
  )

  return { messages, status, connected, send }
}

/**
 * Unread assistant messages the user hasn't seen. History and anything viewed while
 * the Chat screen is open count as seen; new inbound replies off-screen count as
 * unread until Chat is opened again.
 */
export function useUnread(messages: ChatMsg[], onChat: boolean): number {
  const [seen, setSeen] = useState(0)
  const initialized = useRef(false)

  useEffect(() => {
    // First history load is not "unread" — mark it seen regardless of screen.
    if (!initialized.current && messages.length > 0) {
      initialized.current = true
      setSeen(messages.length)
      return
    }
    if (onChat) setSeen(messages.length)
  }, [messages.length, onChat])

  if (onChat) return 0
  return messages.slice(seen).filter((m) => m.role === 'assistant').length
}
