import { app, ipcMain, type BrowserWindow } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DEFAULT_PROACTIVE_SETTINGS,
  emptyProactiveState,
  shouldReachOut,
  afterReachOut,
  composeNudge,
  type ProactiveSettings,
  type ProactiveState,
  type ProactiveNow,
} from '@terrarium/core'

// "She texts you first." The decision logic lives (tested) in @terrarium/core; this
// hosts it in Electron main: it tracks when you last spoke, and on an idle timer fires
// a hidden OOC nudge at the brain so the opener is genuinely in-character. In-app only
// for now — the nudge rides the existing GUI chat client, so the reply lands in the app
// (and bumps the unread badge) without touching Telegram.
const CHECK_MS = 5 * 60_000
const BE_RE = /^\/be\s+([a-z0-9][a-z0-9-]*)/i
const titleCase = (s: string) => s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

interface Persisted {
  settings: ProactiveSettings
  state: ProactiveState
}

export interface Proactive {
  noteActivity: (msg: { role: 'user' | 'assistant'; text: string }) => void
  seedFromHistory: (msgs: { role: 'user' | 'assistant'; text: string; ts: number | null }[]) => void
  start: () => void
  stop: () => void
}

export function setupProactive(opts: {
  getWin: () => BrowserWindow | null
  sendNudge: (text: string) => Promise<void>
  isConnected: () => boolean
}): Proactive {
  const file = join(app.getPath('userData'), 'proactive.json')
  let data: Persisted = load()
  let persona = ''
  let timer: ReturnType<typeof setInterval> | null = null

  function load(): Persisted {
    try {
      const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<Persisted>
      return {
        settings: { ...DEFAULT_PROACTIVE_SETTINGS, ...(raw.settings ?? {}) },
        state: { ...emptyProactiveState(), ...(raw.state ?? {}) },
      }
    } catch {
      return { settings: { ...DEFAULT_PROACTIVE_SETTINGS }, state: emptyProactiveState() }
    }
  }
  function save(): void {
    try {
      writeFileSync(file, JSON.stringify(data, null, 2))
    } catch {
      /* best effort */
    }
  }

  function nowOf(): ProactiveNow {
    const d = new Date()
    const p = (n: number) => String(n).padStart(2, '0')
    return {
      ms: d.getTime(),
      hour: d.getHours(),
      dateKey: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    }
  }

  // Seed the active persona from a /be so the nudge can name her; also called live.
  const rememberPersona = (text: string): void => {
    const hit = BE_RE.exec(text.trim())
    if (hit) persona = titleCase(hit[1]!.toLowerCase())
  }

  const noteActivity: Proactive['noteActivity'] = (msg) => {
    data.state.lastActivityMs = Date.now()
    if (msg.role === 'user') rememberPersona(msg.text)
    save()
  }

  // On connect: learn the active persona from the last /be and measure idle from the
  // real last message, so a fresh launch doesn't reset the clock to "just now".
  const seedFromHistory: Proactive['seedFromHistory'] = (msgs) => {
    for (const m of msgs) if (m.role === 'user') rememberPersona(m.text)
    const newest = msgs.reduce((mx, m) => Math.max(mx, m.ts ?? 0), 0)
    if (newest > data.state.lastActivityMs) {
      data.state.lastActivityMs = newest
      save()
    }
  }

  async function tick(): Promise<void> {
    if (!opts.isConnected()) return
    const now = nowOf()
    if (!shouldReachOut(data.state, data.settings, now).reach) return
    const idleMinutes = (now.ms - data.state.lastActivityMs) / 60_000
    try {
      await opts.sendNudge(composeNudge({ personaName: persona, hour: now.hour, idleMinutes }))
      data.state = afterReachOut(data.state, now)
      save()
    } catch {
      /* transient — try again next tick */
    }
  }

  ipcMain.handle('proactive:get', () => data.settings)
  ipcMain.handle('proactive:set', (_e, patch: Partial<ProactiveSettings>) => {
    data.settings = { ...data.settings, ...patch }
    save()
    return data.settings
  })
  return {
    noteActivity,
    seedFromHistory,
    start: () => {
      if (!timer) timer = setInterval(() => void tick(), CHECK_MS)
    },
    stop: () => {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    },
  }
}
