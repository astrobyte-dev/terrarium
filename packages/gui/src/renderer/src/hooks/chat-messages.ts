import type { ChatMsg } from '../data/types'

const sameImages = (a?: string[], b?: string[]) =>
  (a ?? []).length === (b ?? []).length && (a ?? []).every((v, i) => v === (b ?? [])[i])

function confirmed(incoming: ChatMsg, previous?: ChatMsg): ChatMsg {
  return {
    ...previous,
    ...incoming,
    ts: incoming.ts ?? previous?.ts ?? Date.now(),
    delivery: incoming.role === 'user' ? 'sent' : incoming.delivery,
    error: undefined,
    streaming: incoming.streaming,
  }
}

/** Only provisional local records can match by content; distinct server IDs survive. */
function matchesLocal(local: ChatMsg, incoming: ChatMsg): boolean {
  if (local.role !== incoming.role || !sameImages(local.images, incoming.images)) return false
  if (local.role === 'assistant') {
    const provisional = local.streaming === true || (local.streaming === false && incoming.streaming === undefined)
    return provisional && !incoming.streaming && incoming.text.startsWith(local.text)
  }
  // A queued message has never been attempted. Matching it to an earlier identical
  // message would silently discard a deliberate repeat before we even send it.
  return local.delivery !== undefined && local.delivery !== 'queued'
    && local.text === incoming.text && local.ts !== null && incoming.ts !== null
    && incoming.ts >= local.ts && incoming.ts - local.ts < 120_000
}

export function reconcile(current: ChatMsg[], incoming: ChatMsg): ChatMsg[] {
  const exact = current.findIndex((m) => m.id === incoming.id)
  const index = exact >= 0 ? exact : current.findIndex((m) => matchesLocal(m, incoming))
  if (index < 0) return [...current, confirmed(incoming)]
  const next = [...current]
  next[index] = confirmed(incoming, current[index])
  return next
}

/** Incoming history is authoritative, and each local echo can match only once. */
export function mergeHistory(current: ChatMsg[], history: ChatMsg[], pics: ChatMsg[] = []): ChatMsg[] {
  const next = [...current]
  const matched = new Set<number>()
  for (const incoming of [...history, ...pics]) {
    const exact = next.findIndex((m) => m.id === incoming.id)
    const index = exact >= 0 ? exact : current.findIndex((m, i) => !matched.has(i) && matchesLocal(m, incoming))
    if (index < 0) next.push(confirmed(incoming))
    else {
      matched.add(index)
      next[index] = confirmed(incoming, next[index])
    }
  }
  return next.sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0))
}

export function parseOutbox(value: string | null): ChatMsg[] {
  try {
    const raw: unknown = JSON.parse(value ?? '[]')
    if (!Array.isArray(raw)) return []
    return raw.filter((m): m is ChatMsg => m !== null && typeof m === 'object'
      && typeof m.id === 'string' && m.id.length > 0 && m.role === 'user'
      && typeof m.text === 'string' && typeof m.ts === 'number' && Number.isFinite(m.ts)
      && ['queued', 'sending', 'failed'].includes(m.delivery))
      .slice(-100)
      .map((m) => ({ id: m.id, role: 'user', text: m.text, ts: m.ts,
        delivery: m.delivery === 'sending' ? 'queued' : m.delivery,
        error: typeof m.error === 'string' ? m.error : undefined }))
  } catch {
    return []
  }
}
