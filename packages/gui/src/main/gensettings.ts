import { app, ipcMain } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { GenSettings } from '../shared/contract'

// The chat controls panel writes its toggles here. This is the SAME %LOCALAPPDATA%\Terrarium
// dir the pic daemon reads (gen_settings.json, sibling of the inbox) — NOT app userData — so
// the Python daemon picks the toggles up on the next /pic. Kept in lockstep with inbox.ts.
const LOCALAPPDATA = process.env['LOCALAPPDATA'] || join(app.getPath('appData'), '..', 'Local')
const TERRARIUM_DIR = join(LOCALAPPDATA, 'Terrarium')
const FILE = join(TERRARIUM_DIR, 'gen_settings.json')

const DEFAULTS: GenSettings = {
  faceLock: true,
  feetFocus: false,
  explicitDefault: false,
  hdAuto: false,
  detailers: true,
  alwaysInclude: [],
}

function read(): GenSettings {
  try {
    return { ...DEFAULTS, ...(JSON.parse(readFileSync(FILE, 'utf8')) as Partial<GenSettings>) }
  } catch {
    return { ...DEFAULTS }
  }
}

function write(s: GenSettings): void {
  try {
    mkdirSync(TERRARIUM_DIR, { recursive: true })
    writeFileSync(FILE, JSON.stringify(s, null, 2))
  } catch {
    /* best effort — a failed write just means the daemon keeps the previous toggles */
  }
}

export function setupGenSettings(): void {
  ipcMain.handle('gen:get', (): GenSettings => read())
  ipcMain.handle('gen:set', (_e, patch: Partial<GenSettings>): GenSettings => {
    const next = { ...read(), ...patch }
    write(next)
    return next
  })
}
