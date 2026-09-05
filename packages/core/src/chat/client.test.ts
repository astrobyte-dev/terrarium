import crypto from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeFakeSystem } from '../test/fake-system'
import { createChatClient, type ChatMessage } from './client'

const kp = crypto.generateKeyPairSync('ed25519')
const IDENTITY = {
  deviceId: 'dev-abc',
  publicKeyPem: kp.publicKey.export({ type: 'spki', format: 'pem' }) as string,
  privateKeyPem: kp.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
}
const PAIRED = {
  'dev-abc': { clientId: 'cli', clientMode: 'cli', platform: 'win32', role: 'operator', approvedScopes: ['operator.write'], tokens: { operator: { token: 'tok' } } },
}

function fakeSystem() {
  return makeFakeSystem({
    env: (n) => (n === 'USERPROFILE' ? 'C:\\U' : undefined),
    readTextFile: async (p) =>
      JSON.stringify(p.endsWith('device.json') ? IDENTITY : PAIRED),
    now: () => 1000,
  })
}

/** A scriptable in-memory WebSocket the client can drive end to end. */
class FakeWS {
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((ev: { data: string }) => void) | null = null
  private listeners: Array<(ev: { data: string }) => void> = []
  sent: Array<Record<string, unknown>> = []
  static last: FakeWS | null = null
  static silent = false
  static instances = 0

  constructor(_url: string) {
    FakeWS.last = this
    FakeWS.instances++
    if (!FakeWS.silent) queueMicrotask(() => this.emit({ type: 'event', event: 'connect.challenge', payload: { nonce: 'n', ts: 5 } }))
  }
  addEventListener(_: 'message', fn: (ev: { data: string }) => void) {
    this.listeners.push(fn)
  }
  removeEventListener(_: 'message', fn: (ev: { data: string }) => void) {
    this.listeners = this.listeners.filter((l) => l !== fn)
  }
  emit(msg: unknown) {
    const ev = { data: JSON.stringify(msg) }
    this.onmessage?.(ev)
    for (const l of this.listeners) l(ev)
  }
  send(raw: string) {
    const msg = JSON.parse(raw) as { id: string; method: string }
    this.sent.push(msg)
    if (msg.method === 'connect') this.emit({ type: 'res', id: msg.id, ok: true, payload: { protocol: 4 } })
  }
  close() {
    this.onclose?.()
  }
}

const answered = new Set<string>()
async function replyTo(method: string, payload: unknown) {
  let req: Record<string, unknown> | undefined
  for (let i = 0; i < 50; i++) {
    req = FakeWS.last!.sent.find((m) => m.method === method && !answered.has(m.id as string))
    if (req !== undefined) break
    await Promise.resolve()
  }
  answered.add(req!.id as string)
  FakeWS.last!.emit({ type: 'res', id: req!.id as string, ok: true, payload })
}

afterEach(() => {
  FakeWS.last = null
  FakeWS.silent = false
  FakeWS.instances = 0
  answered.clear()
  vi.useRealTimers()
})

describe('createChatClient', () => {
  it('explicitly disables external delivery for isolated validation sessions', async () => {
    const client = createChatClient({ system: fakeSystem(), WebSocketImpl: FakeWS as never,
      sessionKey: 'agent:main:validation', deliverExternally: false, replyPollAttempts: 0 })
    await client.connect()
    const sent = client.send('local validation')
    await replyTo('chat.history', { messages: [] })
    await replyTo('chat.send', { ok: true })
    await sent
    expect(FakeWS.last!.sent.find(m => m.method === 'chat.send')!.params).toMatchObject({
      sessionKey: 'agent:main:validation', deliver: false,
    })
    client.close()
  })
  it('connects via the signed challenge handshake', async () => {
    const client = createChatClient({ system: fakeSystem(), WebSocketImpl: FakeWS as never })
    await client.connect()
    const connectReq = FakeWS.last!.sent.find((m) => m.method === 'connect') as Record<string, unknown>
    expect(connectReq).toBeDefined()
    const device = connectReq.params as { device: { signature: string }; scopes: string[] }
    expect(device.device.signature.length).toBeGreaterThan(0)
    expect(device.scopes).toEqual(['operator.write'])
  })

  it('normalizes chat.history content blocks into flat messages', async () => {
    const client = createChatClient({ system: fakeSystem(), WebSocketImpl: FakeWS as never })
    await client.connect()
    const historyPromise = client.history()
    await replyTo('chat.history', {
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'hi' }], timestamp: 100 },
        { role: 'assistant', content: [{ type: 'text', text: 'hey astro' }], timestamp: 200 },
        { role: 'assistant', content: [{ type: 'text', text: '' }], timestamp: 250 },
      ],
    })
    const messages = await historyPromise
    expect(messages.map(({ id: _id, ...m }) => m)).toEqual([
      { role: 'user', text: 'hi', ts: 100 },
      { role: 'assistant', text: 'hey astro', ts: 200 },
    ])
    expect(messages.every((m) => m.id.startsWith('history-'))).toBe(true)
  })

  it('collapses OpenClaw delivery-mirror duplicate assistant turns', async () => {
    const client = createChatClient({ system: fakeSystem(), WebSocketImpl: FakeWS as never })
    await client.connect()
    const historyPromise = client.history()
    await replyTo('chat.history', {
      messages: [
        { role: 'assistant', content: [{ type: 'text', text: 'same' }], timestamp: 300 },
        { role: 'assistant', model: 'delivery-mirror', content: [{ type: 'text', text: 'same' }], timestamp: 301 },
      ],
    })
    expect((await historyPromise).map(({ id: _id, ...m }) => m)).toEqual([{ role: 'assistant', text: 'same', ts: 300 }])
  })

  it('send confirms the user message only after acceptance and reconciles the assistant reply', async () => {
    const client = createChatClient({
      system: fakeSystem(),
      WebSocketImpl: FakeWS as never,
      replyPollIntervalMs: 1,
    })
    await client.connect()
    const replies: ChatMessage[] = []
    client.on('reply', (m) => replies.push(m))

    const sendPromise = client.send('you up?', 'client-message-1')
    // send() first pulls a baseline history to set the watermark…
    await replyTo('chat.history', {
      messages: [{ role: 'user', content: [{ type: 'text', text: 'earlier' }], timestamp: 500 }],
    })
    expect(replies).toEqual([])
    await replyTo('chat.send', { ok: true })
    const sent = FakeWS.last!.sent.find((m) => m.method === 'chat.send') as { params: { idempotencyKey: string } }
    expect(sent.params.idempotencyKey).toBe('client-message-1')
    // …then reconciles, surfacing only the reply newer than the watermark.
    await replyTo('chat.history', {
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'earlier' }], timestamp: 500 },
        { role: 'assistant', content: [{ type: 'text', text: 'always' }], timestamp: 900 },
      ],
    })
    await sendPromise

    expect(replies[0]).toMatchObject({ id: 'client-message-1', role: 'user', text: 'you up?', ts: 1000 })
    expect(replies.some((r) => r.role === 'assistant' && r.text === 'always')).toBe(true)
  })

  it('accumulates streaming assistant chunks under one stable reply id', async () => {
    const client = createChatClient({ system: fakeSystem(), WebSocketImpl: FakeWS as never })
    await client.connect()
    const replies: ChatMessage[] = []
    client.on('reply', (m) => replies.push(m))
    FakeWS.last!.emit({ type: 'event', event: 'chat', payload: { delta: 'thinking' } })
    FakeWS.last!.emit({ type: 'event', event: 'chat', payload: { delta: '...' } })
    expect(replies).toEqual([
      { id: 'stream-1', role: 'assistant', text: 'thinking', ts: null, streaming: true },
      { id: 'stream-1', role: 'assistant', text: 'thinking...', ts: null, streaming: true },
    ])
  })

  it('handles a cumulative final streaming chunk', async () => {
    const client = createChatClient({ system: fakeSystem(), WebSocketImpl: FakeWS as never })
    await client.connect()
    const replies: ChatMessage[] = []
    client.on('reply', (m) => replies.push(m))
    FakeWS.last!.emit({ type: 'event', event: 'chat', payload: { delta: 'hel' } })
    FakeWS.last!.emit({ type: 'event', event: 'chat', payload: { delta: 'hello', done: true } })
    expect(replies.at(-1)).toEqual({ id: 'stream-1', role: 'assistant', text: 'hello', ts: null, streaming: false })
  })
  it('streams the current gateway nested message format and applies corrections without duplication', async () => {
    const client = createChatClient({ system: fakeSystem(), WebSocketImpl: FakeWS as never })
    await client.connect()
    const replies: ChatMessage[] = []; client.on('reply', m => replies.push(m))
    for (const [state, text] of [['delta', 'Hello there'], ['delta', 'Hello!'], ['final', 'Hello!']]) {
      FakeWS.last!.emit({ type: 'event', event: 'chat', payload: { runId: 'run-123', state,
        message: { role: 'assistant', content: [{ type: 'text', text }] } } })
    }
    expect(replies.map(m => m.text)).toEqual(['Hello there', 'Hello!', 'Hello!'])
    expect(replies.at(-1)).toMatchObject({ id: 'stream-run-123', streaming: false })
    client.close()
  })
  it('wakes history reconciliation on final instead of waiting for the polling interval', async () => {
    vi.useFakeTimers()
    const client = createChatClient({ system: fakeSystem(), WebSocketImpl: FakeWS as never })
    await client.connect()
    const sent = client.send('hello')
    await replyTo('chat.history', { messages: [] })
    await replyTo('chat.send', { ok: true })
    FakeWS.last!.emit({ type: 'event', event: 'chat', payload: { runId: 'run-1', state: 'final',
      message: { role: 'assistant', content: [{ type: 'text', text: 'Hi' }] } } })
    await replyTo('chat.history', { messages: [{ role: 'assistant', content: 'Hi', timestamp: 2000 }] })
    await sent
    client.close(); expect(vi.getTimerCount()).toBe(0)
  })

  it('reports a clear error when no paired identity exists', async () => {
    const system = makeFakeSystem({ env: () => 'C:\\U', readTextFile: async () => { throw new Error('nope') } })
    const client = createChatClient({ system, WebSocketImpl: FakeWS as never })
    await expect(client.connect()).rejects.toThrow(/paired gateway identity/)
  })

  it('shares concurrent connection attempts and reuses a ready socket', async () => {
    const client = createChatClient({ system: fakeSystem(), WebSocketImpl: FakeWS as never })
    await Promise.all([client.connect(), client.connect()])
    await client.connect()
    expect(FakeWS.instances).toBe(1)
    client.close()
  })

  it('times out a silent handshake and permits a fresh connection', async () => {
    vi.useFakeTimers()
    FakeWS.silent = true
    const client = createChatClient({ system: fakeSystem(), WebSocketImpl: FakeWS as never, connectTimeoutMs: 50 })
    const result = expect(client.connect()).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(50)
    await result
    FakeWS.silent = false
    await client.connect()
    expect(FakeWS.instances).toBe(2)
    client.close()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejects a handshake when the socket closes before the challenge', async () => {
    FakeWS.silent = true
    const client = createChatClient({ system: fakeSystem(), WebSocketImpl: FakeWS as never })
    const result = expect(client.connect()).rejects.toThrow('connection closed')
    for (let i = 0; i < 50 && !FakeWS.last; i++) await Promise.resolve()
    FakeWS.last!.close()
    await result
  })

  it('clears request timers on response and rejects pending requests on close', async () => {
    vi.useFakeTimers()
    const client = createChatClient({ system: fakeSystem(), WebSocketImpl: FakeWS as never })
    await client.connect()
    const first = client.history()
    await replyTo('chat.history', { messages: [] })
    await first
    expect(vi.getTimerCount()).toBe(0)
    const result = expect(client.history()).rejects.toThrow('connection closed')
    client.close()
    await result
    expect(vi.getTimerCount()).toBe(0)
  })

  it('ignores malformed frames and events from another session', async () => {
    const client = createChatClient({ system: fakeSystem(), WebSocketImpl: FakeWS as never })
    await client.connect()
    const replies: ChatMessage[] = []
    client.on('reply', (m) => replies.push(m))
    for (const frame of [null, [], 42, { type: 'event', event: 'chat', payload: 'bad' }]) FakeWS.last!.emit(frame)
    FakeWS.last!.emit({ type: 'event', event: 'chat', payload: { sessionKey: 'another-session', text: 'private' } })
    expect(replies).toEqual([])
    client.close()
  })

  it('finishes a stream on an empty completion event', async () => {
    const client = createChatClient({ system: fakeSystem(), WebSocketImpl: FakeWS as never })
    await client.connect()
    const replies: ChatMessage[] = []
    client.on('reply', (m) => replies.push(m))
    FakeWS.last!.emit({ type: 'event', event: 'chat', payload: { delta: 'hello' } })
    FakeWS.last!.emit({ type: 'event', event: 'chat', payload: { done: true } })
    expect(replies.at(-1)).toMatchObject({ text: 'hello', streaming: false })
    FakeWS.last!.emit({ type: 'event', event: 'chat', payload: { delta: 'next' } })
    expect(replies.at(-1)).toMatchObject({ id: 'stream-2', text: 'next' })
    client.close()
  })

  it('preserves repeated messages and stable IDs when the history window shifts', async () => {
    const client = createChatClient({ system: fakeSystem(), WebSocketImpl: FakeWS as never })
    await client.connect()
    const messages = [
      { role: 'user', content: 'hello', timestamp: 100 },
      { role: 'user', content: 'hello', timestamp: 200 },
      { role: 'assistant', content: 'hi', timestamp: 300 },
      { role: 'assistant', content: 'hi', timestamp: 400 },
    ]
    const first = client.history()
    await replyTo('chat.history', { messages })
    const before = await first
    expect(before).toHaveLength(4)
    const second = client.history()
    await replyTo('chat.history', { messages: messages.slice(1) })
    expect((await second).map((m) => m.id)).toEqual(before.slice(1).map((m) => m.id))
    client.close()
  })

  it('rejects pending requests immediately even when the close event is delayed', async () => {
    class DeferredCloseWS extends FakeWS { override close() {} }
    const client = createChatClient({ system: fakeSystem(), WebSocketImpl: DeferredCloseWS as never })
    await client.connect()
    const result = expect(client.history()).rejects.toThrow('connection closed')
    client.close()
    await result
  })

  it('does not let a late close from the previous socket break the new connection', async () => {
    class DeferredCloseWS extends FakeWS { override close() {} }
    const client = createChatClient({ system: fakeSystem(), WebSocketImpl: DeferredCloseWS as never })
    await client.connect()
    const old = FakeWS.last!
    client.close()
    await client.connect()
    old.onclose?.()
    const history = client.history()
    await replyTo('chat.history', { messages: [] })
    await expect(history).resolves.toEqual([])
    client.close()
  })

  it('cleans up when sending on a socket throws synchronously', async () => {
    vi.useFakeTimers()
    const client = createChatClient({ system: fakeSystem(), WebSocketImpl: FakeWS as never })
    await client.connect()
    vi.spyOn(FakeWS.last!, 'send').mockImplementation(() => { throw new Error('socket unavailable') })
    await expect(client.history()).rejects.toThrow('socket unavailable')
    expect(vi.getTimerCount()).toBe(0)
    client.close()
  })

  it('cancels a connection that is still loading its identity', async () => {
    const client = createChatClient({ system: fakeSystem(), WebSocketImpl: FakeWS as never })
    const result = expect(client.connect()).rejects.toThrow('connection closed')
    client.close()
    await result
    expect(FakeWS.instances).toBe(0)
  })
})
