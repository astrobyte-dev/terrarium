import { join } from 'node:path'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { app, BrowserWindow, ipcMain } from 'electron'
import type { ChatMsg } from '../shared/contract'

// The pic daemon mirrors every delivered photo here: PNG(s) + a <uuid>.json manifest.
// We poll (robust — a photo landing ≤1s late is invisible next to a 30–60s generation),
// turn each manifest into an assistant chat message, and keep a small persisted history
// so reopening Terrarium still shows recent pics (the gateway's text history has no images).
// Same dir the pic daemon writes to: %LOCALAPPDATA%\Terrarium\inbox.
const LOCALAPPDATA = process.env['LOCALAPPDATA'] || join(app.getPath('appData'), '..', 'Local')
const TERRARIUM_DIR = join(LOCALAPPDATA, 'Terrarium')
export const INBOX_DIR = join(TERRARIUM_DIR, 'inbox')

// Persisted OUTSIDE the watched inbox, so the manifest scan never trips over it.
const HISTORY_FILE = join(TERRARIUM_DIR, 'pic-history.json')
const POLL_MS = 1000
const KEEP_HISTORY = 40 // pic messages replayed on reconnect (last N)
const KEEP_IMAGES = 120 // hard cap on PNGs kept in the inbox

interface Manifest {
  images: string[]
  caption: string
  character: string
  prompt: string | null
  params: Record<string, unknown>
  sessionKey: string
  ts: number
}

const toChatMsg = (m: Manifest): ChatMsg => ({
  role: 'assistant',
  text: m.caption ?? '',
  ts: m.ts,
  images: m.images.map((name) => `terrarium://inbox/${name}`),
})

function readHistory(): ChatMsg[] {
  try {
    return JSON.parse(readFileSync(HISTORY_FILE, 'utf8')) as ChatMsg[]
  } catch {
    return []
  }
}

function writeHistory(history: ChatMsg[]): void {
  try {
    writeFileSync(HISTORY_FILE, JSON.stringify(history.slice(-KEEP_HISTORY)))
  } catch {
    /* history is a nicety — never let it break delivery */
  }
}

/** Delete the oldest PNGs when the inbox grows past the cap (referenced-by-history spared). */
function pruneImages(history: ChatMsg[]): void {
  try {
    const referenced = new Set(history.flatMap((m) => m.images ?? []).map((u) => u.replace('terrarium://inbox/', '')))
    const pngs = readdirSync(INBOX_DIR)
      .filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f))
      .map((f) => ({ f, m: statSync(join(INBOX_DIR, f)).mtimeMs }))
      .sort((a, b) => a.m - b.m)
    for (const { f } of pngs.slice(0, Math.max(0, pngs.length - KEEP_IMAGES))) {
      if (!referenced.has(f)) unlinkSync(join(INBOX_DIR, f))
    }
  } catch {
    /* best effort */
  }
}

export function setupInbox(getWin: () => BrowserWindow | null): void {
  mkdirSync(INBOX_DIR, { recursive: true })
  let history = readHistory()
  pruneImages(history)

  // Replay recent pics into a freshly-connected chat (merged with gateway text history by ts).
  ipcMain.handle('inbox:recent', (): ChatMsg[] => history.slice(-KEEP_HISTORY))

  const tick = () => {
    let manifests: string[]
    try {
      // Only <id>.json manifests: the daemon writes <id>.json.tmp then renames, so a
      // partial file (.tmp) is never seen; .bad quarantines and images are skipped.
      manifests = readdirSync(INBOX_DIR).filter((f) => f.endsWith('.json'))
    } catch {
      return
    }
    // Oldest manifest first, so bubbles arrive in generation order.
    manifests.sort()
    for (const file of manifests) {
      const path = join(INBOX_DIR, file)
      try {
        const manifest = JSON.parse(readFileSync(path, 'utf8')) as Manifest
        const msg = toChatMsg(manifest)
        history.push(msg)
        history = history.slice(-KEEP_HISTORY)
        getWin()?.webContents.send('chat:message', msg)
      } catch {
        // Unreadable/garbage manifest — quarantine it so we don't spin on it.
        try {
          renameSync(path, path + '.bad')
        } catch {
          /* ignore */
        }
        continue
      }
      try {
        unlinkSync(path)
      } catch {
        /* ignore */
      }
    }
    if (manifests.length > 0) {
      writeHistory(history)
      pruneImages(history)
    }
  }

  const timer = setInterval(tick, POLL_MS)
  app.on('before-quit', () => clearInterval(timer))
}

/** Resolve a terrarium://inbox/<name> request to an absolute path INSIDE the inbox, or null. */
export function resolveInboxImage(name: string): string | null {
  const clean = decodeURIComponent(name).replace(/^\/+/, '')
  const abs = join(INBOX_DIR, clean)
  // Path-traversal guard: the resolved path must stay within the inbox dir.
  const root = INBOX_DIR.endsWith('\\') || INBOX_DIR.endsWith('/') ? INBOX_DIR : INBOX_DIR + '\\'
  if (!abs.startsWith(root) && abs !== INBOX_DIR) return null
  if (!existsSync(abs)) return null
  return abs
}
