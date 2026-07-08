import type { SystemPort } from '../system/system-port'

export interface StoredBrain {
  primaryModel: string
  fallbacks: string[]
}

const storePath = (sys: SystemPort) => `${sys.env('LOCALAPPDATA') ?? ''}\\Terrarium\\brain.json`

/**
 * The chosen brain, persisted so it survives every config regeneration
 * (migrate/release rewrites) instead of snapping back to the template default.
 * Returns null when the user has never picked one (template default applies).
 */
export async function readBrainSelection(sys: SystemPort): Promise<StoredBrain | null> {
  try {
    const stored = JSON.parse(await sys.readTextFile(storePath(sys))) as StoredBrain
    return typeof stored.primaryModel === 'string' ? stored : null
  } catch {
    return null
  }
}

export async function writeBrainSelection(sys: SystemPort, brain: StoredBrain): Promise<void> {
  await sys.ensureDir(`${sys.env('LOCALAPPDATA') ?? ''}\\Terrarium`)
  await sys.writeTextFile(storePath(sys), JSON.stringify(brain, null, 2))
}
