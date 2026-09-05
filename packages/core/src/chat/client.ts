import { EventEmitter } from 'node:events'
import type { SystemPort } from '../system/system-port'
import { loadDeviceIdentity, type DeviceIdentity } from '../gateway/identity'
import { buildConnectPayloadV3, rawPublicKeyBase64Url, signConnectPayload } from '../gateway/device-auth'

export const MAIN_SESSION_KEY = 'agent:main:main'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  ts: number | null
  /** A live assistant turn that may still receive text chunks. */
  streaming?: boolean
}

export interface ChatClientEvents {
  history: (messages: ChatMessage[]) => void
  reply: (message: ChatMessage) => void
  status: (state: 'connecting' | 'reconnecting' | 'ready' | 'sending' | 'closed', detail: string) => void
  error: (message: string) => void
}

export interface ChatClient {
  connect(): Promise<void>
  history(limit?: number): Promise<ChatMessage[]>
  selectModel(model: string): Promise<void>
  send(text: string, idempotencyKey?: string): Promise<void>
  close(): void
  on<K extends keyof ChatClientEvents>(e: K, fn: ChatClientEvents[K]): void
  off<K extends keyof ChatClientEvents>(e: K, fn: ChatClientEvents[K]): void
}

interface Pending {
  resolve: (payload: unknown) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
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
  connectTimeoutMs?: number
  /** Disable delivery to external channels for local validation sessions. */
  deliverExternally?: boolean
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
  let streamSeq = 0
  let activeStream: { id: string; text: string } | null = null
  let connecting: Promise<void> | null = null
  let ready = false
  let generation = 0
  let cancelConnect: ((message: string) => void) | null = null
  let wakeReplyPoll: (() => void) | null = null
  let streamFinished = false

  const emit = <K extends keyof ChatClientEvents>(e: K, ...args: Parameters<ChatClientEvents[K]>) =>
    emitter.emit(e, ...args)

  function rejectPending(): void {
    for (const [, p] of pending) {
      clearTimeout(p.timer)
      p.reject(new Error('connection closed'))
    }
    pending.clear()
  }

  function request<T = unknown>(method: string, params: unknown): Promise<T> {
    const id = `t${++reqSeq}`
    return new Promise<T>((resolve, reject) => {
      if (ws === null || !ready) {
        reject(new Error('gateway is not connected'))
        return
      }
      const timer = setTimeout(() => {
        if (pending.delete(id)) reject(new Error(`${method} timed out`))
      }, 60_000)
      pending.set(id, { resolve: resolve as (p: unknown) => void, reject, timer })
      try {
        ws.send(JSON.stringify({ type: 'req', id, method, params }))
      } catch (error) {
        clearTimeout(timer)
        pending.delete(id)
        reject(error)
      }
    })
  }

  function handleChatEvent(payload: Record<string, unknown>): void {
    if (payload.state === 'error' || payload.stopReason === 'error') return // Let provider failover finish.
    const message = payload.message && typeof payload.message === 'object' ? payload.message as Record<string, unknown> : null
    const content = textFromContent(message?.content ?? payload.content ?? payload.text)
    const delta = message ? '' : textFromContent(payload.delta ?? payload.deltaText)
    const complete = payload.state === 'final' || payload.done === true || payload.final === true || payload.status === 'complete'
    const suppliedId = typeof payload.id === 'string' ? payload.id : typeof payload.messageId === 'string' ? payload.messageId
      : typeof payload.runId === 'string' ? `stream-${payload.runId}` : null
    if (complete) { streamFinished = true; wakeReplyPoll?.() }

    if (delta !== '') {
      const id = suppliedId ?? activeStream?.id ?? `stream-${++streamSeq}`
      const previous = activeStream?.id === id ? activeStream.text : ''
      // Some gateway builds send cumulative "delta" text; others send the new token(s).
      const text = delta.startsWith(previous) ? delta : previous + delta
      activeStream = complete ? null : { id, text }
      emit('reply', { id, role: 'assistant', text, ts: null, streaming: !complete })
      return
    }

    if (content === '') {
      if (complete && activeStream) {
        emit('reply', { ...activeStream, role: 'assistant', ts: null, streaming: false })
        activeStream = null
      }
      return
    }
    const id = suppliedId ?? activeStream?.id ?? `stream-${++streamSeq}`
    // A content event is normally the complete accumulated reply. If it is only a
    // suffix, preserve the streamed prefix rather than visibly dropping text.
    const text = !message && payload.replace !== true && activeStream?.id === id && !content.startsWith(activeStream.text) ? activeStream.text + content : content
    activeStream = complete ? null : { id, text }
    emit('reply', { id, role: 'assistant', text, ts: null, streaming: !complete })
  }

  function onMessage(raw: string): void {
    let msg: Record<string, unknown>
    try {
      const parsed = safeParse(raw)
      if (!parsed) return
      msg = parsed
    } catch {
      return
    }
    if (msg.type === 'res') {
      const p = pending.get(msg.id as string)
      if (p === undefined) return
      pending.delete(msg.id as string)
      clearTimeout(p.timer)
      if (msg.ok === true) p.resolve(msg.payload)
      else p.reject(new Error(describeError(msg.error)))
      return
    }
    if (msg.type === 'event' && msg.event === 'chat') {
      const payload = msg.payload
      if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        const event = payload as Record<string, unknown>
        if (event.sessionKey !== undefined && event.sessionKey !== sessionKey) return
        handleChatEvent(event)
      }
    }
  }

  async function doConnect(): Promise<void> {
    const attempt = generation
    identity = await loadDeviceIdentity(system)
    if (attempt !== generation) throw new Error('connection closed')
    if (identity === null) {
      throw new Error('no paired gateway identity found — is OpenClaw set up on this machine?')
    }
    emit('status', 'connecting', `ws://127.0.0.1:${port}`)
    const socket = new WS(`ws://127.0.0.1:${port}`)
    ws = socket

    await new Promise<void>((resolve, reject) => {
      let settled = false
      let challenged = false
      const timer = setTimeout(() => fail('gateway connection timed out'), opts.connectTimeoutMs ?? 15_000)
      const fail = (m: string) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        cancelConnect = null
        reject(new Error(m))
        socket.close()
      }
      cancelConnect = fail
      socket.onerror = () => fail('websocket error connecting to the gateway')
      socket.onclose = () => {
        if (ws !== socket) return
        ws = null
        ready = false
        activeStream = null
        fail('connection closed')
        emit('status', 'closed', 'connection closed')
        rejectPending()
      }
      socket.onmessage = (ev: MessageEvent) => {
        if (ws !== socket) return
        const data = String(ev.data)
        const parsed = safeParse(data)
        if (ready) {
          onMessage(data)
        } else if (!settled && !challenged && parsed?.type === 'event' && parsed.event === 'connect.challenge') {
          challenged = true
          try {
            sendConnect(socket, identity!, parsed.payload as { nonce: string; ts: number })
          } catch (error) {
            fail(error instanceof Error ? error.message : String(error))
          }
        } else if (!settled && challenged && parsed?.type === 'res' && parsed.id === 'connect') {
          if (parsed.ok !== true) { fail(describeError(parsed.error)); return }
          settled = true
          clearTimeout(timer)
          cancelConnect = null
          ready = true
          emit('status', 'ready', 'connected')
          resolve()
        }
      }
    })
  }

  function sendConnect(
    socket: WebSocket,
    id: DeviceIdentity,
    challenge: { nonce: string; ts: number },
  ): void {
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
    socket.send(JSON.stringify(connectReq))
  }

  async function pollForReply(): Promise<boolean> {
    const attempts = opts.replyPollAttempts ?? 60
    const intervalMs = opts.replyPollIntervalMs ?? 5000
    for (let i = 0; i < attempts; i++) {
      // Current gateways stream nested message objects. Avoid expensive history
      // reads on every token; wake immediately for final reconciliation.
      if (!streamFinished && (i > 0 || opts.replyPollIntervalMs === undefined)) {
        await new Promise<void>(resolve => {
          const done = () => { clearTimeout(timer); wakeReplyPoll = null; resolve() }
          const timer = setTimeout(done, intervalMs)
          wakeReplyPoll = done
        })
      }
      const messages = await request<{ messages?: unknown[] }>('chat.history', { sessionKey, limit: 20 })
        .then((p) => normalizeHistory(p.messages ?? []))
      const fresh = messages.filter((m) => (m.ts ?? 0) > lastSeenTs && m.role === 'assistant')
      if (messages.length > 0) {
        lastSeenTs = Math.max(lastSeenTs, messages[messages.length - 1]!.ts ?? 0)
      }
      if (fresh.length > 0) {
        activeStream = null
        for (const m of fresh) emit('reply', m)
        return true
      }
      if (streamFinished) { streamFinished = false }
    }
    return false
  }

  return {
    connect() {
      if (ready) return Promise.resolve()
      if (connecting) return connecting
      const attempt = doConnect().finally(() => {
        if (connecting === attempt) connecting = null
      })
      connecting = attempt
      return attempt
    },

    async history(limit = 40) {
      const payload = await request<{ messages?: unknown[] }>('chat.history', { sessionKey, limit })
      const messages = normalizeHistory(payload.messages ?? [])
      if (messages.length > 0) lastSeenTs = messages[messages.length - 1]!.ts ?? lastSeenTs
      emit('history', messages)
      return messages
    },
    async selectModel(model) {
      if (!/^[a-zA-Z0-9_.:/-]+$/.test(model)) throw new Error('Invalid model reference')
      // /model is the supported chat command for the existing operator.write role.
      // The administrative sessions.patch RPC requires a broader paired identity.
      await this.send(`/model ${model}`)
    },

    async send(text, suppliedIdempotencyKey) {
      streamFinished = false
      // Establish the watermark first so reconciliation surfaces only THIS
      // turn's reply, never the whole backlog (guards send-before-history).
      if (lastSeenTs === 0) {
        const baseline = await request<{ messages?: unknown[] }>('chat.history', { sessionKey, limit: 40 })
          .then((p) => normalizeHistory(p.messages ?? []))
        if (baseline.length > 0) lastSeenTs = baseline[baseline.length - 1]!.ts ?? lastSeenTs
      }
      emit('status', 'sending', 'waiting for reply')
      // Side-effecting methods require an idempotency key (gateway dedupes retries).
      const idempotencyKey = suppliedIdempotencyKey ?? clientMessageId(text, system.now(), ++idemSeq)
      await request('chat.send', { sessionKey, message: text, idempotencyKey,
        ...(opts.deliverExternally === undefined ? {} : { deliver: opts.deliverExternally }),
      })
      // This event confirms acceptance. Emitting before the response caused the GUI
      // to remove unaccepted messages from its persistent outbox.
      emit('reply', { id: idempotencyKey, role: 'user', text, ts: system.now() })
      // chat.send resolves on ACCEPTANCE, not completion — poll history until
      // the assistant's reply to this turn lands (or we give up waiting).
      const surfaced = await pollForReply()
      if (!surfaced) emit('status', 'ready', 'no reply yet — it may still be generating')
      else emit('status', 'ready', 'connected')
    },

    close() {
      generation++
      cancelConnect?.('connection closed')
      ws?.close()
      ws = null
      ready = false
      activeStream = null
      rejectPending()
      wakeReplyPoll?.()
    },

    on: (e, fn) => void emitter.on(e, fn),
    off: (e, fn) => void emitter.off(e, fn),
  }
}

function safeParse(raw: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(raw)
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown> : null
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
    const e = entry as { id?: unknown; messageId?: unknown; role?: unknown; content?: unknown; timestamp?: unknown; model?: unknown; stopReason?: unknown }
    if (e.role !== 'user' && e.role !== 'assistant') continue
    // A failed provider attempt precedes its fallback's actual reply in history.
    if (e.role === 'assistant' && e.stopReason === 'error') continue
    const text = textFromContent(e.content)
    if (text === '') continue
    const ts = typeof e.timestamp === 'number' ? e.timestamp : Date.parse(String(e.timestamp))
    // OpenClaw mirrors each delivered assistant turn (model "delivery-mirror")
    // alongside the runtime turn — collapse the consecutive duplicate.
    const prev = out[out.length - 1]
    if (e.model === 'delivery-mirror' && prev?.role === 'assistant' && e.role === 'assistant' && prev.text === text) continue
    const time = Number.isFinite(ts) ? ts : null
    const suppliedId = typeof e.id === 'string' ? e.id : typeof e.messageId === 'string' ? e.messageId : null
    out.push({ id: suppliedId ?? historyMessageId(e.role, text, time, out.length), role: e.role, text, ts: time })
  }
  return out
}

function fingerprint(value: string): string {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619)
  return (hash >>> 0).toString(36)
}

function historyMessageId(role: string, text: string, ts: number | null, index: number): string {
  return `history-${fingerprint(`${role}|${ts ?? `unknown-${index}`}|${text}`)}`
}

function clientMessageId(text: string, ts: number, seq: number): string {
  return `terrarium-${ts}-${seq}-${fingerprint(text)}`
}
