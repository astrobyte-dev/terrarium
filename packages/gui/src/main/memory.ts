import { trustedIpc as ipcMain } from './ipc'
import { homedir } from 'node:os'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { activeCharacter, parseBullets, renderMemoryDoc } from '@terrarium/core'
import type { MemoryView } from '../shared/contract'

// The Memory panel = "what she remembers about you". It edits the brain's curated
// long-term memory (workspace/MEMORY.md) — AGENTS.md already points the model there,
// and the pic daemon never touches it, so edits are durable with no daemon restart.
// The daemon's auto-extracted facts (about-corey.md) are surfaced read-only so you can
// pin any of them up into the curated list.
const WORKSPACE = join(homedir(), '.openclaw', 'workspace')
const MEMORY_FILE = join(WORKSPACE, 'MEMORY.md')
const FACTS_FILE = join(WORKSPACE, 'memory', 'about-corey.md')

function readBullets(file: string): string[] {
  try {
    return parseBullets(readFileSync(file, 'utf8'))
  } catch {
    return []
  }
}

export function setupMemory(): void {
  ipcMain.handle('memory:list', (): MemoryView => {
    const memories = readBullets(MEMORY_FILE)
    // Only show learned facts she hasn't already been pinned (avoid dupes in the UI).
    const pinned = new Set(memories.map((m) => m.trim().toLowerCase()))
    const facts = readBullets(FACTS_FILE).filter((f) => !pinned.has(f.trim().toLowerCase()))
    const character = activeCharacter(WORKSPACE)
    return { memories, facts, character, characterMemories: readBullets(join(WORKSPACE, 'memory', 'characters', `${character}.md`)) }
  })

  ipcMain.handle('memory:save', (_e, memories: string[]): { ok: boolean; message?: string } => {
    try {
      mkdirSync(dirname(MEMORY_FILE), { recursive: true })
      writeFileSync(MEMORY_FILE, renderMemoryDoc(memories))
      return { ok: true }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) }
    }
  })
  ipcMain.handle('memory:saveCharacter', (_e, character: string, memories: string[]) => {
    try {
      const path = join(WORKSPACE, 'memory', 'characters', `${character}.md`)
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, renderMemoryDoc(memories))
      return { ok: true }
    } catch (e) { return { ok: false, message: e instanceof Error ? e.message : String(e) } }
  })
}
