// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatMsg, ChatStatus } from '../data/types'
import { useChat } from './useChat'
import { useChatDraft } from './useChatDraft'

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}
let root: Root | null = null
let current: ReturnType<typeof useChat>
let message: (m: ChatMsg) => void
let history: (m: ChatMsg[]) => void
let status: (s: ChatStatus) => void
let connect: ReturnType<typeof vi.fn>
let send: ReturnType<typeof vi.fn>
const outbox = () => JSON.parse(localStorage.getItem('terrarium.chat.outbox.v1') ?? '[]') as ChatMsg[]

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  localStorage.clear()
  connect = vi.fn().mockResolvedValue({ ok: true, history: [] })
  send = vi.fn().mockResolvedValue({ ok: true })
  Object.defineProperty(window, 'terrarium', { configurable: true, value: {
    chat: { connect, send,
      onMessage: (cb: typeof message) => { message = cb; return () => {} },
      onHistory: (cb: typeof history) => { history = cb; return () => {} },
      onStatus: (cb: typeof status) => { status = cb; return () => {} },
    }, inbox: { recent: async () => [] },
  } })
})
afterEach(async () => { await act(async () => root?.unmount()); root = null })

async function mount() {
  function Probe() { current = useChat(); return null }
  root = createRoot(document.createElement('div'))
  await act(async () => root!.render(createElement(Probe)))
}

describe('chat interactions through the preload contract', () => {
  it('restores an interrupted outbox send using the same idempotency key', async () => {
    localStorage.setItem('terrarium.chat.outbox.v1', JSON.stringify([{ id: 'recover', role: 'user', text: 'hello', ts: 1, delivery: 'sending' }]))
    await mount()
    expect(send).toHaveBeenCalledExactlyOnceWith({ id: 'recover', text: 'hello' })
  })

  it('serializes queued sends and stops draining while disconnected', async () => {
    const pending = deferred<{ ok: boolean }>()
    send.mockReturnValueOnce(pending.promise)
    await mount()
    await act(async () => { current.send('one'); current.send('two') })
    expect(send).toHaveBeenCalledTimes(1)
    await act(async () => { status({ state: 'closed', detail: 'offline' }); pending.resolve({ ok: true }) })
    expect(send).toHaveBeenCalledTimes(1)
    expect(outbox().map((m) => m.text)).toEqual(['two'])
    await act(async () => status({ state: 'ready', detail: 'connected' }))
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('keeps an accepted send delivered when waiting for the reply later fails', async () => {
    const pending = deferred<{ ok: boolean; message: string }>()
    send.mockReturnValue(pending.promise)
    await mount()
    await act(async () => current.send('hello'))
    const outgoing = current.messages[0]!
    expect(outbox()).toHaveLength(1)
    await act(async () => message({ ...outgoing, delivery: undefined }))
    expect(outbox()).toHaveLength(0)
    await act(async () => pending.resolve({ ok: false, message: 'reply polling disconnected' }))
    expect(current.messages[0]?.delivery).toBe('sent')
  })

  it('preserves the current conversation until reset acceptance and rejects stale history', async () => {
    const pending = deferred<{ ok: boolean }>()
    send.mockReturnValue(pending.promise)
    await mount()
    await act(async () => history([{ id: 'old', role: 'assistant', text: 'previous conversation', ts: 1 }]))
    await act(async () => { expect(current.newConversation()).toBe(true) })
    expect(current.messages[0]?.id).toBe('old')
    const reset = current.messages.at(-1)!
    await act(async () => message({ ...reset, delivery: undefined }))
    expect(current.messages.map((m) => m.id)).toEqual([reset.id])
    await act(async () => history([{ id: 'old', role: 'assistant', text: 'previous conversation', ts: 1 }]))
    expect(current.messages.map((m) => m.id)).toEqual([reset.id])
    await act(async () => pending.resolve({ ok: true }))
  })

  it('refuses to reset while a send is in progress and preserves history when reset fails', async () => {
    const pending = deferred<{ ok: boolean }>()
    send.mockReturnValueOnce(pending.promise)
    await mount()
    await act(async () => current.send('keep this'))
    expect(current.newConversation()).toBe(false)
    await act(async () => pending.resolve({ ok: true }))
    send.mockResolvedValue({ ok: false, message: 'offline' })
    await act(async () => { current.newConversation() })
    expect(current.messages[0]?.text).toBe('keep this')
    expect(current.messages.at(-1)?.delivery).toBe('failed')
    expect(current.resetting).toBe(false)
  })

  it('does not overwrite a disconnect with a slow initial connection result', async () => {
    const pending = deferred<{ ok: boolean; history: ChatMsg[] }>()
    connect.mockReturnValue(pending.promise)
    await mount()
    await act(async () => status({ state: 'closed', detail: 'connection lost' }))
    await act(async () => pending.resolve({ ok: true, history: [] }))
    expect(current.connected).toBe(false)
    expect(current.status.state).toBe('closed')
  })
})

it('preserves unfinished drafts across unmount/reload and clears them explicitly', async () => {
  let draft!: ReturnType<typeof useChatDraft>
  function Probe() { draft = useChatDraft(); return null }
  root = createRoot(document.createElement('div'))
  await act(async () => root!.render(createElement(Probe)))
  await act(async () => draft[1]('unfinished thought'))
  await act(async () => root!.unmount())
  root = createRoot(document.createElement('div'))
  await act(async () => root!.render(createElement(Probe)))
  expect(draft[0]).toBe('unfinished thought')
  await act(async () => draft[1](''))
  expect(localStorage.getItem('terrarium.chat.draft.v1')).toBeNull()
})
