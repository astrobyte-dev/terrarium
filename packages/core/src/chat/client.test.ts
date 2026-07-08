import crypto from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
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

  constructor(_url: string) {
    FakeWS.last = this
    queueMicrotask(() => this.emit({ type: 'event', event: 'connect.challenge', payload: { nonce: 'n', ts: 5 } }))
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
  answered.clear()
})

describe('createChatClient', () => {
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
    expect(messages).toEqual<ChatMessage[]>([
      { role: 'user', text: 'hi', ts: 100 },
      { role: 'assistant', text: 'hey astro', ts: 200 },
    ])
  })

  it('collapses OpenClaw delivery-mirror duplicate assistant turns', async () => {
    const client = createChatClient({ system: fakeSystem(), WebSocketImpl: FakeWS as never })
    await client.connect()
    const historyPromise = client.history()
    await replyTo('chat.history', {
      messages: [
        { role: 'assistant', content: [{ type: 'text', text: 'same' }], timestamp: 300 },
        { role: 'assistant', content: [{ type: 'text', text: 'same' }], timestamp: 301 },
      ],
    })
    expect(await historyPromise).toEqual<ChatMessage[]>([{ role: 'assistant', text: 'same', ts: 300 }])
  })

  it('send emits the user message immediately and the reconciled assistant reply', async () => {
    const client = createChatClient({
      system: fakeSystem(),
      WebSocketImpl: FakeWS as never,
      replyPollIntervalMs: 1,
    })
    await client.connect()
    const replies: ChatMessage[] = []
    client.on('reply', (m) => replies.push(m))

    const sendPromise = client.send('you up?')
    // send() first pulls a baseline history to set the watermark…
    await replyTo('chat.history', {
      messages: [{ role: 'user', content: [{ type: 'text', text: 'earlier' }], timestamp: 500 }],
    })
    await replyTo('chat.send', { ok: true })
    // …then reconciles, surfacing only the reply newer than the watermark.
    await replyTo('chat.history', {
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'earlier' }], timestamp: 500 },
        { role: 'assistant', content: [{ type: 'text', text: 'always' }], timestamp: 900 },
      ],
    })
    await sendPromise

    expect(replies[0]).toEqual({ role: 'user', text: 'you up?', ts: 1000 })
    expect(replies.some((r) => r.role === 'assistant' && r.text === 'always')).toBe(true)
  })

  it('surfaces streaming assistant text from chat events', async () => {
    const client = createChatClient({ system: fakeSystem(), WebSocketImpl: FakeWS as never })
    await client.connect()
    const replies: ChatMessage[] = []
    client.on('reply', (m) => replies.push(m))
    FakeWS.last!.emit({ type: 'event', event: 'chat', payload: { content: [{ type: 'text', text: 'thinking...' }] } })
    expect(replies).toContainEqual({ role: 'assistant', text: 'thinking...', ts: null })
  })

  it('reports a clear error when no paired identity exists', async () => {
    const system = makeFakeSystem({ env: () => 'C:\\U', readTextFile: async () => { throw new Error('nope') } })
    const client = createChatClient({ system, WebSocketImpl: FakeWS as never })
    await expect(client.connect()).rejects.toThrow(/paired gateway identity/)
  })
})
