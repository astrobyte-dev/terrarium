export interface BotIdentity {
  id: number
  username: string
  firstName: string
}

/**
 * Which bot does this token actually belong to? Surfacing this in the UI
 * exists because of a real incident: hours spent messaging a dead duplicate
 * bot with a similar name. Returns null on any failure — identity is a
 * nicety, never a blocker.
 */
export async function getBotIdentity(
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<BotIdentity | null> {
  try {
    const res = await fetchFn(`https://api.telegram.org/bot${token}/getMe`, {
      signal: AbortSignal.timeout(8000),
    })
    const data = (await res.json()) as {
      ok?: boolean
      result?: { id?: number; username?: string; first_name?: string }
    }
    if (data.ok !== true || data.result === undefined) return null
    return {
      id: data.result.id ?? 0,
      username: data.result.username ?? '',
      firstName: data.result.first_name ?? '',
    }
  } catch {
    return null
  }
}
