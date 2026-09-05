import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatMsg, ChatStatus } from '../data/types'
import { mergeHistory, parseOutbox, reconcile } from './chat-messages'

const OUTBOX_KEY = 'terrarium.chat.outbox.v1'

function loadOutbox(): ChatMsg[] {
  try {
    return parseOutbox(localStorage.getItem(OUTBOX_KEY))
  } catch {
    return []
  }
}

function persistOutbox(messages: ChatMsg[]): void {
  try {
    const outbox = messages.filter((m) => m.role === 'user' && (m.delivery === 'queued' || m.delivery === 'sending' || m.delivery === 'failed'))
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(outbox.slice(-100)))
  } catch {
    // Storage is a safety net, never a reason to break the live chat.
  }
}

function messageId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `terrarium-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** Owns chat transport state, including a small persistent outbox for interrupted sends. */
export function useChat() {
  const [messages, setMessages] = useState<ChatMsg[]>(loadOutbox)
  const [status, setStatus] = useState<ChatStatus>({ state: 'connecting', detail: '' })
  const [connected, setConnected] = useState(false)
  const flushing = useRef(false)
  const resetId = useRef<string | null>(null)
  const resetAt = useRef<number | null>(null)
  const [resetting, setResetting] = useState(false)
  const [flushVersion, setFlushVersion] = useState(0)

  const patchMessage = useCallback((id: string, patch: Partial<ChatMsg>) => {
    setMessages((prev) => prev.map((m) => {
      if (m.id !== id || (m.delivery === 'sent' && patch.delivery === 'failed')) return m
      return { ...m, ...patch }
    }))
  }, [])

  const deliver = useCallback(async (message: ChatMsg) => {
    patchMessage(message.id, { delivery: 'sending', error: undefined })
    try {
      const result = await window.terrarium.chat.send({ id: message.id, text: message.text })
      if (result.ok) patchMessage(message.id, { delivery: 'sent', error: undefined })
      else patchMessage(message.id, { delivery: 'failed', error: result.message ?? 'could not send' })
    } catch (e) {
      patchMessage(message.id, { delivery: 'failed', error: e instanceof Error ? e.message : String(e) })
    } finally {
      if (resetId.current === message.id) {
        resetId.current = null
        setResetting(false)
      }
    }
  }, [patchMessage])

  const flushOutbox = useCallback(async () => {
    if (flushing.current || !connected) return
    const pending = messages.find((m) => m.role === 'user' && m.delivery === 'queued')
    if (!pending) return
    flushing.current = true
    try {
      await deliver(pending)
    } finally {
      flushing.current = false
      // Re-read current state before each send: connection/history/new-conversation
      // events may have invalidated a previously captured batch while awaiting IPC.
      setFlushVersion((v) => v + 1)
    }
  }, [connected, deliver, messages, flushVersion])

  useEffect(() => persistOutbox(messages), [messages])

  useEffect(() => {
    const chat = window.terrarium?.chat
    if (!chat) return
    let active = true
    let latestStatus: ChatStatus | null = null
    const recoveredHistory = (history: ChatMsg[]) => resetAt.current === null ? history
      : history.filter((m) => m.ts !== null && m.ts >= resetAt.current!)
    const offMsg = chat.onMessage((m) => {
      if (m.role === 'user' && m.id === resetId.current) {
        resetAt.current = m.ts ?? Date.now()
        resetId.current = null
        setResetting(false)
        setMessages(reconcile([], m))
      } else setMessages((prev) => reconcile(prev, m))
    })
    const offHistory = chat.onHistory((history) => setMessages((prev) => mergeHistory(prev, recoveredHistory(history))))
    const offStatus = chat.onStatus((next) => {
      latestStatus = next
      setStatus(next)
      setConnected(next.state === 'ready' || next.state === 'sending')
    })
    chat.connect().then(async (res) => {
      if (!active) return
      if (!res.ok) {
        setConnected(false)
        setStatus({ state: 'error', detail: res.message ?? 'could not connect to the gateway' })
        return
      }
      const pics = (await window.terrarium?.inbox?.recent().catch(() => [])) ?? []
      if (!active) return
      setMessages((prev) => mergeHistory(prev, recoveredHistory(res.history), recoveredHistory(pics)))
      // A close/reconnect event may have arrived while history or photos loaded.
      // Only synthesize readiness when reusing a connection that emitted no status.
      if (latestStatus === null) {
        setConnected(true)
        setStatus({ state: 'ready', detail: 'connected' })
      }
    }).catch((e: unknown) => { if (active) setStatus({ state: 'error', detail: String(e) }) })
    return () => { active = false; offMsg(); offHistory(); offStatus() }
  }, [])

  useEffect(() => { void flushOutbox() }, [flushOutbox])

  const send = useCallback((text: string) => {
    if (resetId.current || !text.trim()) return
    const message: ChatMsg = { id: messageId(), role: 'user', text, ts: Date.now(), delivery: connected ? 'queued' : 'failed', error: connected ? undefined : 'waiting for reconnection' }
    setMessages((prev) => [...prev, message])
  }, [connected])

  const newConversation = useCallback(() => {
    if (!connected || flushing.current || resetId.current || messages.some((m) => m.delivery === 'queued' || m.delivery === 'sending')) return false
    const message: ChatMsg = { id: messageId(), role: 'user', text: '/new', ts: Date.now(), delivery: connected ? 'queued' : 'failed', error: connected ? undefined : 'waiting for reconnection' }
    // Keep the current conversation until the gateway accepts the reset. A failed
    // reset must not make a still-active conversation appear to have been erased.
    resetId.current = message.id
    setResetting(true)
    setMessages((prev) => [...prev, message])
    return true
  }, [connected, messages])

  const retry = useCallback((id: string) => {
    if (!connected || resetId.current) return
    if (messages.find((m) => m.id === id)?.text === '/new') {
      if (flushing.current) return
      resetId.current = id
      setResetting(true)
    }
    patchMessage(id, { delivery: 'queued', error: undefined })
  }, [connected, messages, patchMessage])

  return { messages, status, connected, resetting, send, retry, newConversation }
}

export function useUnread(messages: ChatMsg[], onChat: boolean): number {
  const [seen, setSeen] = useState(0)
  const initialized = useRef(false)
  useEffect(() => {
    if (!initialized.current && messages.length > 0) { initialized.current = true; setSeen(messages.length); return }
    if (onChat) setSeen(messages.length)
  }, [messages.length, onChat])
  if (onChat) return 0
  return messages.slice(seen).filter((m) => m.role === 'assistant').length
}
