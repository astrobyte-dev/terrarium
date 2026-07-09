import { describe, it, expect } from 'vitest'
import {
  DEFAULT_PROACTIVE_SETTINGS,
  emptyProactiveState,
  shouldReachOut,
  afterReachOut,
  sentTodayFor,
  composeNudge,
  isProactiveNudge,
  timeOfDay,
  PROACTIVE_NUDGE_TAG,
  type ProactiveState,
  type Now,
} from './decide'

const HOUR = 3_600_000
const now = (over: Partial<Now> = {}): Now => ({ ms: 1_000 * HOUR, hour: 14, dateKey: '2026-07-09', ...over })
// A baseline state: chatted 5h ago, never proactively pinged.
const idle5h = (over: Partial<ProactiveState> = {}): ProactiveState => ({
  ...emptyProactiveState(),
  lastActivityMs: now().ms - 5 * HOUR,
  ...over,
})

describe('shouldReachOut', () => {
  it('reaches out when quiet long enough, in waking hours, under cap', () => {
    const d = shouldReachOut(idle5h(), DEFAULT_PROACTIVE_SETTINGS, now())
    expect(d.reach).toBe(true)
  })

  it('never reaches out when disabled', () => {
    const d = shouldReachOut(idle5h(), { ...DEFAULT_PROACTIVE_SETTINGS, enabled: false }, now())
    expect(d).toEqual({ reach: false, reason: 'disabled' })
  })

  it('never reaches out with no conversation yet', () => {
    const d = shouldReachOut(emptyProactiveState(), DEFAULT_PROACTIVE_SETTINGS, now())
    expect(d.reason).toBe('no conversation yet')
  })

  it('stays quiet outside waking hours (before start)', () => {
    const d = shouldReachOut(idle5h(), DEFAULT_PROACTIVE_SETTINGS, now({ hour: 7 }))
    expect(d.reason).toBe('outside waking hours')
  })

  it('stays quiet outside waking hours (at/after end)', () => {
    const d = shouldReachOut(idle5h(), DEFAULT_PROACTIVE_SETTINGS, now({ hour: 23 }))
    expect(d.reach).toBe(false)
  })

  it("won't text if it hasn't been idle long enough", () => {
    const fresh = idle5h({ lastActivityMs: now().ms - 30 * 60_000 }) // 30 min ago
    const d = shouldReachOut(fresh, DEFAULT_PROACTIVE_SETTINGS, now())
    expect(d.reason).toBe('not idle long enough')
  })

  it('respects the daily cap', () => {
    const capped = idle5h({ sentToday: 2, sentTodayDate: now().dateKey })
    const d = shouldReachOut(capped, DEFAULT_PROACTIVE_SETTINGS, now())
    expect(d.reason).toBe('daily cap reached')
  })

  it('resets the daily cap on a new local day', () => {
    const yesterday = idle5h({ sentToday: 2, sentTodayDate: '2026-07-08' })
    const d = shouldReachOut(yesterday, DEFAULT_PROACTIVE_SETTINGS, now())
    expect(d.reach).toBe(true)
  })

  it('honours the cooldown between proactive messages', () => {
    const recent = idle5h({ lastProactiveMs: now().ms - 60 * 60_000 }) // 1h ago, cooldown 4h
    const d = shouldReachOut(recent, DEFAULT_PROACTIVE_SETTINGS, now())
    expect(d.reason).toBe('cooldown')
  })

  it('reaches out again once the cooldown has passed', () => {
    const old = idle5h({ lastProactiveMs: now().ms - 5 * HOUR })
    const d = shouldReachOut(old, DEFAULT_PROACTIVE_SETTINGS, now())
    expect(d.reach).toBe(true)
  })
})

describe('sentTodayFor', () => {
  it('counts today, ignores a stale date', () => {
    expect(sentTodayFor({ ...emptyProactiveState(), sentToday: 3, sentTodayDate: '2026-07-09' }, now())).toBe(3)
    expect(sentTodayFor({ ...emptyProactiveState(), sentToday: 3, sentTodayDate: '2026-07-08' }, now())).toBe(0)
  })
})

describe('afterReachOut', () => {
  it('advances counters and stamps the day', () => {
    const next = afterReachOut(idle5h(), now())
    expect(next.sentToday).toBe(1)
    expect(next.sentTodayDate).toBe('2026-07-09')
    expect(next.lastProactiveMs).toBe(now().ms)
    expect(next.lastActivityMs).toBe(now().ms)
  })

  it('increments within the same day and rolls over across days', () => {
    const sameDay = afterReachOut(idle5h({ sentToday: 1, sentTodayDate: '2026-07-09' }), now())
    expect(sameDay.sentToday).toBe(2)
    const newDay = afterReachOut(idle5h({ sentToday: 2, sentTodayDate: '2026-07-08' }), now())
    expect(newDay.sentToday).toBe(1)
  })
})

describe('composeNudge / isProactiveNudge', () => {
  it('tags the nudge so the GUI can hide it', () => {
    const text = composeNudge({ personaName: 'Yuna', hour: 21, idleMinutes: 300 })
    expect(text.startsWith(PROACTIVE_NUDGE_TAG)).toBe(true)
    expect(isProactiveNudge(text)).toBe(true)
    expect(isProactiveNudge('  ' + text)).toBe(true)
    expect(text).toContain('Yuna')
  })

  it('does not flag a normal message', () => {
    expect(isProactiveNudge('hey, you around?')).toBe(false)
  })
})

describe('timeOfDay', () => {
  it('buckets the clock', () => {
    expect(timeOfDay(2)).toBe('the middle of the night')
    expect(timeOfDay(9)).toBe('morning')
    expect(timeOfDay(14)).toBe('the afternoon')
    expect(timeOfDay(19)).toBe('the evening')
    expect(timeOfDay(23)).toBe('late at night')
  })
})
