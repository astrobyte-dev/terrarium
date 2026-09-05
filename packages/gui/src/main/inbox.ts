import { trustedIpc as ipcMain } from './ipc'
import { join } from 'node:path'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { app, BrowserWindow } from 'electron'
import type { ChatMsg, GalleryEntry } from '../shared/contract'

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
// Per-character gallery: keeps the character tag the chat history throws away, so a
// character's photos can be browsed later. References inbox filenames; those images are
// spared from pruning while an entry points at them.
const GALLERY_FILE = join(TERRARIUM_DIR, 'gallery.json')
const POLL_MS = 1000
const KEEP_HISTORY = 40 // pic messages replayed on reconnect (last N)
const KEEP_GALLERY = 240 // gallery entries kept per install (all characters, most recent)
const KEEP_IMAGES = 300 // hard cap on PNGs kept in the inbox (gallery-referenced spared)

interface Manifest {
  id?: string
  images: string[]
  caption: string
  character: string
  prompt: string | null
  command?: string | null
  params: Record<string, unknown>
  sessionKey: string
  ts: number
}

const toChatMsg = (m: Manifest): ChatMsg => ({
  id: m.id ? `image-${m.id}` : `image-${m.ts}-${m.images.join('|')}`,
  role: 'assistant',
  text: m.caption ?? '',
  ts: m.ts,
  images: m.images.map((name) => `terrarium://inbox/${name}`),
  ...(m.command ? { command: m.command } : {}),
  ...((m.params as { anime?: boolean } | undefined)?.anime ? { anime: true } : {}),
})

function readHistory(): ChatMsg[] {
  try {
    return (JSON.parse(readFileSync(HISTORY_FILE, 'utf8')) as ChatMsg[]).map((m, i) => ({
      ...m,
      id: m.id || `image-history-${m.ts ?? 0}-${i}`,
    }))
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

function readGallery(): GalleryEntry[] {
  try {
    return JSON.parse(readFileSync(GALLERY_FILE, 'utf8')) as GalleryEntry[]
  } catch {
    return []
  }
}

function writeGallery(gallery: GalleryEntry[]): void {
  try {
    writeFileSync(GALLERY_FILE, JSON.stringify(gallery.slice(-KEEP_GALLERY)))
  } catch {
    /* gallery is a nicety — never let it break delivery */
  }
}

/** Delete the oldest PNGs when the inbox grows past the cap (history/gallery refs spared). */
function pruneImages(history: ChatMsg[], gallery: GalleryEntry[]): void {
  try {
    const referenced = new Set(
      [...history.flatMap((m) => m.images ?? []), ...gallery.map((g) => g.image)].map((u) =>
        u.replace('terrarium://inbox/', ''),
      ),
    )
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
  let gallery = readGallery()
  pruneImages(history, gallery)

  // Replay recent pics into a freshly-connected chat (merged with gateway text history by ts).
  ipcMain.handle('inbox:recent', (): ChatMsg[] => history.slice(-KEEP_HISTORY))
  // The per-character gallery, most recent first.
  ipcMain.handle('gallery:list', (): GalleryEntry[] => [...gallery].reverse())

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
        const existing = history.findIndex(item => item.id === msg.id)
        if (existing >= 0) history[existing] = msg
        else history.push(msg)
        history = history.slice(-KEEP_HISTORY)
        // One gallery entry per image, tagged with the character the chat log discards.
        for (const name of manifest.images) {
          gallery = gallery.filter(entry => entry.image !== `terrarium://inbox/${name}`)
          gallery.push({
            character: manifest.character ?? '',
            image: `terrarium://inbox/${name}`,
            caption: manifest.caption ?? '',
            ts: manifest.ts,
            ...(manifest.command ? { command: manifest.command } : {}),
          })
        }
        gallery = gallery.slice(-KEEP_GALLERY)
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
      writeGallery(gallery)
      pruneImages(history, gallery)
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
