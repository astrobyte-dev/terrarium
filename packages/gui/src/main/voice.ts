import { trustedIpc as ipcMain } from './ipc'
import { homedir } from 'node:os'
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, basename } from 'node:path'
import { createHash } from 'node:crypto'
import type { VoiceCatalog, VoiceSay } from '../shared/contract'

// Kokoro voice notes. The engine (CPU/ONNX Python) lives in the openclaw workspace so
// it never touches the GPU; main just spawns it, caches the .wav by (voice+text) hash,
// and serves it over terrarium://voice/. Per-character voice is a preset id chosen from
// Kokoro's built-ins (voices.json), stored in voice_map.json keyed by /be slug.
const KDIR = join(homedir(), '.openclaw', 'workspace', 'skills', 'voice-kokoro')
const PY = join(KDIR, 'venv', 'Scripts', 'python.exe')
const SCRIPT = join(KDIR, 'kokoro_tts.py')
const OUT = join(KDIR, 'out')
const VOICES_JSON = join(KDIR, 'voices.json')
const MAP_JSON = join(KDIR, 'voice_map.json')
const MODEL = join(KDIR, 'kokoro-v1.0.onnx')

const engineReady = (): boolean => existsSync(PY) && existsSync(SCRIPT) && existsSync(MODEL)

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch {
    return fallback
  }
}

const catalog = (): VoiceCatalog => readJson<VoiceCatalog>(VOICES_JSON, { default: 'af_heart', voices: [] })
const readMap = (): Record<string, string> => readJson<Record<string, string>>(MAP_JSON, {})

// TTS reads best without emoji / decorative symbols; keep letters, digits, common
// punctuation and whitespace so the phonemizer isn't fed pictographs.
function cleanForSpeech(text: string): string {
  return text
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}‍]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

const voiceFor = (slug: string | undefined): string => {
  const map = readMap()
  return (slug && map[slug]) || catalog().default || 'af_heart'
}

function render(text: string, voice: string): Promise<VoiceSay> {
  const clean = cleanForSpeech(text)
  if (!clean) return Promise.resolve({ ok: false, message: 'nothing to speak' })
  if (!engineReady()) return Promise.resolve({ ok: false, message: 'voice engine not installed' })

  const id = createHash('sha1').update(`${voice}|${clean}`).digest('hex').slice(0, 16)
  mkdirSync(OUT, { recursive: true })
  const wav = join(OUT, `${id}.wav`)
  const url = `terrarium://voice/${id}.wav`
  if (existsSync(wav)) return Promise.resolve({ ok: true, url })

  const txt = join(OUT, `${id}.txt`)
  writeFileSync(txt, clean, 'utf8')
  return new Promise((resolve) => {
    execFile(PY, [SCRIPT, '--textfile', txt, '--voice', voice, '--out', wav], { timeout: 60_000, windowsHide: true }, (err, _out, stderr) => {
      if (err || !existsSync(wav)) {
        resolve({ ok: false, message: (stderr || '').trim().split('\n').pop() || 'voice render failed' })
      } else {
        resolve({ ok: true, url })
      }
    })
  })
}

/** terrarium://voice/<id>.wav -> the cached file (slug-guarded, no traversal). */
export function resolveVoiceAudio(pathname: string): string | null {
  const name = basename(decodeURIComponent(pathname))
  if (!/^[a-f0-9]{16}\.wav$/.test(name)) return null
  const abs = join(OUT, name)
  return existsSync(abs) ? abs : null
}

export function setupVoice(): void {
  ipcMain.handle('voice:catalog', (): VoiceCatalog & { ready: boolean; map: Record<string, string> } => ({
    ...catalog(),
    ready: engineReady(),
    map: readMap(),
  }))

  ipcMain.handle('voice:setVoice', (_e, slug: string, voiceId: string): { ok: boolean } => {
    const map = readMap()
    if (voiceId) map[slug] = voiceId
    else delete map[slug]
    try {
      writeFileSync(MAP_JSON, JSON.stringify(map, null, 2))
      return { ok: true }
    } catch {
      return { ok: false }
    }
  })

  // Speak a chat message in the active character's voice.
  ipcMain.handle('voice:say', (_e, text: string, slug?: string): Promise<VoiceSay> => render(text, voiceFor(slug)))

  // Preview a specific preset (used by the per-character picker).
  ipcMain.handle('voice:preview', (_e, voiceId: string): Promise<VoiceSay> =>
    render('Hey, this is how I sound. I think you’re going to like it.', voiceId),
  )
}
