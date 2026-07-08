import { EventEmitter } from 'node:events'
import type { SystemPort } from '../system/system-port'
import { loadDeviceIdentity, type DeviceIdentity } from '../gateway/identity'
import { buildConnectPayloadV3, rawPublicKeyBase64Url, signConnectPayload } from '../gateway/device-auth'

export const MAIN_SESSION_KEY = 'agent:main:main'

export interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  ts: number | null
}

export interface ChatClientEvents {
  history: (messages: ChatMessage[]) => void
  reply: (message: ChatMessage) => void
  status: (state: 'connecting' | 'ready' | 'sending' | 'closed', detail: string) => void
  error: (message: string) => void
}

export interface ChatClient {
  connect(): Promise<void>
  history(limit?: number): Promise<ChatMessage[]>
  send(text: string): Promise<void>
  close(): void
  on<K extends keyof ChatClientEvents>(e: K, fn: ChatClientEvents[K]): void
  off<K extends keyof ChatClientEvents>(e: K, fn: ChatClientEvents[K]): void
}

interface Pending {
  resolve: (payload: unknown) => void
  reject: (err: Error) => void
}

export interface ChatClientOptions {
  system: SystemPort
  sessionKey?: string
  port?: number
  /** Injectable for tests; defaults to the global WebSocket. */
  WebSocketImpl?: typeof WebSocket
  /** Reply-poll tuning (chat.send resolves on acceptance, not completion). */
  replyPollAttempts?: number
  replyPollIntervalMs?: number
}

/**
 * In-app chat over the gateway WebSocket — a second front end on the same
 * brain as Telegram (they share `agent:main:main`). Replies are surfaced
 * live from `chat` events, then reconciled against `chat.history` so display
 * correctness never depends on decoding every streaming field.
 */
export function createChatClient(opts: ChatClientOptions): ChatClient {
  const { system } = opts
  const sessionKey = opts.sessionKey ?? MAIN_SESSION_KEY
  const port = opts.port ?? 18789
  const WS = opts.WebSocketImpl ?? WebSocket
  const emitter = new EventEmitter()
  const pending = new Map<string, Pending>()

  let ws: WebSocket | null = null
  let identity: DeviceIdentity | null = null
  let reqSeq = 0
  let idemSeq = 0
  let lastSeenTs = 0

  const emit = <K extends keyof ChatClientEvents>(e: K, ...args: Parameters<ChatClientEvents[K]>) =>
    emitter.emit(e, ...args)

  function request<T = unknown>(method: string, params: unknown): Promise<T> {
    const id = `t${++reqSeq}`
    return new Promise<T>((resolve, reject) => {
      pending.set(id, { resolve: resolve as (p: unknown) => void, reject })
      ws?.send(JSON.stringify({ type: 'req', id, method, params }))
      setTimeout(() => {
        if (pending.delete(id)) reject(new Error(`${method} timed out`))
      }, 60_000)
    })
  }

  function handleChatEvent(payload: Record<string, unknown>): void {
    // The `chat` event shape varies across run phases; pull any assistant text
    // it carries and let history reconciliation be the source of truth.
    const message = extractAssistantText(payload)
    if (message !== null) emit('reply', message)
  }

  function onMessage(raw: string): void {
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(raw)
    } catch {
      return
    }
    if (msg.type === 'res') {
      const p = pending.get(msg.id as string)
      if (p === undefined) return
      pending.delete(msg.id as string)
      if (msg.ok === true) p.resolve(msg.payload)
      else p.reject(new Error(describeError(msg.error)))
      return
    }
    if (msg.type === 'event' && msg.event === 'chat') {
      handleChatEvent((msg.payload ?? {}) as Record<string, unknown>)
    }
  }

  async function doConnect(): Promise<void> {
    identity = await loadDeviceIdentity(system)
    if (identity === null) {
      throw new Error('no paired gateway identity found — is OpenClaw set up on this machine?')
    }
    emit('status', 'connecting', `ws://127.0.0.1:${port}`)
    const socket = new WS(`ws://127.0.0.1:${port}`)
    ws = socket

    await new Promise<void>((resolve, reject) => {
      const fail = (m: string) => reject(new Error(m))
      socket.onerror = () => fail('websocket error connecting to the gateway')
      socket.onclose = () => {
        emit('status', 'closed', 'connection closed')
        for (const [, p] of pending) p.reject(new Error('connection closed'))
        pending.clear()
      }
      socket.onmessage = (ev: MessageEvent) => {
        const data = String(ev.data)
        const parsed = safeParse(data)
        if (parsed?.type === 'event' && parsed.event === 'connect.challenge') {
          sendConnect(socket, identity!, parsed.payload as { nonce: string; ts: number })
            .then(() => {
              socket.onmessage = (m: MessageEvent) => onMessage(String(m.data))
              emit('status', 'ready', 'connected')
              resolve()
            })
            .catch((err: Error) => fail(err.message))
        }
      }
    })
  }

  async function sendConnect(
    socket: WebSocket,
    id: DeviceIdentity,
    challenge: { nonce: string; ts: number },
  ): Promise<void> {
    const payload = buildConnectPayloadV3(id, challenge.nonce, challenge.ts)
    const signature = signConnectPayload(id.privateKeyPem, payload)
    const connectReq = {
      type: 'req',
      id: 'connect',
      method: 'connect',
      params: {
        minProtocol: 1,
        maxProtocol: 4,
        client: { id: id.clientId, version: '0.1.0', platform: id.platform, mode: id.clientMode },
        role: id.role,
        scopes: id.scopes,
        caps: [],
        commands: [],
        permissions: {},
        auth: { token: id.token },
        device: {
          id: id.deviceId,
          publicKey: rawPublicKeyBase64Url(id.publicKeyPem),
          signature,
          signedAt: challenge.ts,
          nonce: challenge.nonce,
        },
      },
    }
    await new Promise<void>((resolve, reject) => {
      const handler = (ev: MessageEvent) => {
        const m = safeParse(String(ev.data))
        if (m?.type === 'res' && m.id === 'connect') {
          socket.removeEventListener('message', handler)
          m.ok === true ? resolve() : reject(new Error(describeError(m.error)))
        }
      }
      socket.addEventListener('message', handler)
      socket.send(JSON.stringify(connectReq))
    })
  }

  async function pollForReply(): Promise<boolean> {
    const attempts = opts.replyPollAttempts ?? 60
    const intervalMs = opts.replyPollIntervalMs ?? 1500
    for (let i = 0; i < attempts; i++) {
      const messages = await request<{ messages?: unknown[] }>('chat.history', { sessionKey, limit: 20 })
        .then((p) => normalizeHistory(p.messages ?? []))
      const fresh = messages.filter((m) => (m.ts ?? 0) > lastSeenTs && m.role === 'assistant')
      if (messages.length > 0) {
        lastSeenTs = Math.max(lastSeenTs, messages[messages.length - 1]!.ts ?? 0)
      }
      if (fresh.length > 0) {
        for (const m of fresh) emit('reply', m)
        return true
      }
      await new Promise((r) => setTimeout(r, intervalMs))
    }
    return false
  }

  return {
    connect: doConnect,

    async history(limit = 40) {
      const payload = await request<{ messages?: unknown[] }>('chat.history', { sessionKey, limit })
      const messages = normalizeHistory(payload.messages ?? [])
      if (messages.length > 0) lastSeenTs = messages[messages.length - 1]!.ts ?? lastSeenTs
      emit('history', messages)
      return messages
    },

    async send(text) {
      // Establish the watermark first so reconciliation surfaces only THIS
      // turn's reply, never the whole backlog (guards send-before-history).
      if (lastSeenTs === 0) {
        const baseline = await request<{ messages?: unknown[] }>('chat.history', { sessionKey, limit: 40 })
          .then((p) => normalizeHistory(p.messages ?? []))
        if (baseline.length > 0) lastSeenTs = baseline[baseline.length - 1]!.ts ?? lastSeenTs
      }
      emit('status', 'sending', 'waiting for reply')
      emit('reply', { role: 'user', text, ts: system.now() })
      // Side-effecting methods require an idempotency key (gateway dedupes retries).
      const idempotencyKey = `terrarium-${system.now()}-${++idemSeq}`
      await request('chat.send', { sessionKey, message: text, idempotencyKey })
      // chat.send resolves on ACCEPTANCE, not completion — poll history until
      // the assistant's reply to this turn lands (or we give up waiting).
      const surfaced = await pollForReply()
      if (!surfaced) emit('status', 'ready', 'no reply yet — it may still be generating')
      else emit('status', 'ready', 'connected')
    },

    close() {
      ws?.close()
      ws = null
    },

    on: (e, fn) => void emitter.on(e, fn),
    off: (e, fn) => void emitter.off(e, fn),
  }
}

function safeParse(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function describeError(error: unknown): string {
  if (error !== null && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  return 'gateway request failed'
}

function textFromContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((block) =>
      block !== null && typeof block === 'object' && 'text' in block
        ? String((block as { text: unknown }).text)
        : '',
    )
    .join('')
    .trim()
}

function normalizeHistory(raw: unknown[]): ChatMessage[] {
  const out: ChatMessage[] = []
  for (const entry of raw) {
    if (entry === null || typeof entry !== 'object') continue
    const e = entry as { role?: unknown; content?: unknown; timestamp?: unknown }
    if (e.role !== 'user' && e.role !== 'assistant') continue
    const text = textFromContent(e.content)
    if (text === '') continue
    const ts = typeof e.timestamp === 'number' ? e.timestamp : Date.parse(String(e.timestamp))
    // OpenClaw mirrors each delivered assistant turn (model "delivery-mirror")
    // alongside the runtime turn — collapse the consecutive duplicate.
    const prev = out[out.length - 1]
    if (prev !== undefined && prev.role === e.role && prev.text === text) continue
    out.push({ role: e.role, text, ts: Number.isFinite(ts) ? ts : null })
  }
  return out
}

function extractAssistantText(payload: Record<string, unknown>): ChatMessage | null {
  const text = textFromContent(payload.content ?? payload.text ?? payload.delta)
  if (text === '') return null
  return { role: 'assistant', text, ts: null }
}
