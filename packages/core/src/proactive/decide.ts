// "She texts you first" — the decision heart of proactive messaging. Pure and
// deterministic so it's fully unit-tested; the Electron main feeds it real clock +
// activity state and, when it says reach, fires a hidden nudge at the brain so the
// opener is genuinely in-character (see gui/src/main/proactive.ts).
//
// Idle-aware, not a dumb clock: she reaches out only after you've been quiet a while,
// inside waking hours, capped per day, with a cooldown between messages.

export interface ProactiveSettings {
  enabled: boolean
  /** She must have been quiet at least this long before she'll reach out. */
  minIdleMinutes: number
  /** Minimum gap between two proactive messages. */
  cooldownMinutes: number
  /** Hard cap on proactive messages per local day. */
  maxPerDay: number
  /** Waking window [start, end) in local hours — never texts outside it. */
  wakingStartHour: number
  wakingEndHour: number
}

export const DEFAULT_PROACTIVE_SETTINGS: ProactiveSettings = {
  enabled: true,
  minIdleMinutes: 240, // 4h
  cooldownMinutes: 240, // 4h
  maxPerDay: 2,
  wakingStartHour: 9,
  wakingEndHour: 23,
}

export interface ProactiveState {
  /** Last user OR bot message time (ms). 0 = no conversation yet. */
  lastActivityMs: number
  /** Last time she proactively reached out (ms). 0 = never. */
  lastProactiveMs: number
  /** Proactive messages sent on `sentTodayDate`. */
  sentToday: number
  /** Local day key (YYYY-MM-DD) the counter belongs to. */
  sentTodayDate: string
}

export const emptyProactiveState = (): ProactiveState => ({
  lastActivityMs: 0,
  lastProactiveMs: 0,
  sentToday: 0,
  sentTodayDate: '',
})

/** Caller-supplied clock, split out so the core stays timezone-pure for tests. */
export interface Now {
  ms: number
  /** Local hour 0–23. */
  hour: number
  /** Local day key YYYY-MM-DD. */
  dateKey: string
}

export interface Decision {
  reach: boolean
  reason: string
}

const MIN = 60_000

/** Sentday count reset across a local-day boundary. */
export function sentTodayFor(state: ProactiveState, now: Now): number {
  return state.sentTodayDate === now.dateKey ? state.sentToday : 0
}

/** The whole decision: should she reach out right now? Pure. */
export function shouldReachOut(state: ProactiveState, settings: ProactiveSettings, now: Now): Decision {
  if (!settings.enabled) return { reach: false, reason: 'disabled' }
  if (!state.lastActivityMs) return { reach: false, reason: 'no conversation yet' }

  if (now.hour < settings.wakingStartHour || now.hour >= settings.wakingEndHour)
    return { reach: false, reason: 'outside waking hours' }

  if (sentTodayFor(state, now) >= settings.maxPerDay) return { reach: false, reason: 'daily cap reached' }

  const idleMs = now.ms - state.lastActivityMs
  if (idleMs < settings.minIdleMinutes * MIN) return { reach: false, reason: 'not idle long enough' }

  if (state.lastProactiveMs > 0 && now.ms - state.lastProactiveMs < settings.cooldownMinutes * MIN)
    return { reach: false, reason: 'cooldown' }

  const hours = Math.round(idleMs / MIN / 60)
  return { reach: true, reason: `quiet ~${hours}h, in waking hours, under cap` }
}

/** State after a proactive message goes out — advances counters. */
export function afterReachOut(state: ProactiveState, now: Now): ProactiveState {
  return {
    ...state,
    lastActivityMs: now.ms,
    lastProactiveMs: now.ms,
    sentToday: sentTodayFor(state, now) + 1,
    sentTodayDate: now.dateKey,
  }
}

// --- the nudge the brain sees (hidden from the chat display) ---

/** Marks a user line as an automated proactive nudge so the GUI never renders it. */
export const PROACTIVE_NUDGE_TAG = '‹proactive›'

export function timeOfDay(hour: number): string {
  if (hour < 5) return 'the middle of the night'
  if (hour < 12) return 'morning'
  if (hour < 17) return 'the afternoon'
  if (hour < 21) return 'the evening'
  return 'late at night'
}

/** The hidden OOC directive that makes her send a natural, in-character opener. */
export function composeNudge(ctx: { personaName?: string; hour: number; idleMinutes: number }): string {
  const hrs = Math.max(1, Math.round(ctx.idleMinutes / 60))
  const who = ctx.personaName?.trim() ? `as ${ctx.personaName.trim()}` : 'in character'
  return (
    `${PROACTIVE_NUDGE_TAG} (OOC: it's ${timeOfDay(ctx.hour)} and it's been about ${hrs}h since ` +
    `we last talked. Text me first, unprompted, ${who} — a short, warm, natural ` +
    `opener in your own voice (1–2 sentences). Don't mention this note or that it's automated, ` +
    `and don't apologise for the gap.)`
  )
}

/** True if a transcript user line is a hidden nudge (the GUI filters these out). */
export const isProactiveNudge = (text: string): boolean => text.trimStart().startsWith(PROACTIVE_NUDGE_TAG)
