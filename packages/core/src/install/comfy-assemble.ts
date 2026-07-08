import type { SystemPort } from '../system/system-port'
import type { ModelAsset } from './comfy-models'

/**
 * Assembling the managed ComfyUI's model tree. For each asset, in order of
 * preference: already there (skip) → copy from a detected live install
 * (fast, no bandwidth, works even for token-gated files) → download →
 * manual (token-gated with no local copy to borrow).
 */
export type AssemblyAction =
  | { kind: 'skip'; name: string; reason: string }
  | { kind: 'copy'; name: string; from: string; to: string; approxMb: number }
  | { kind: 'download'; asset: ModelAsset }
  | { kind: 'manual'; name: string; reason: string }

export interface AssemblyDirs {
  managedModelsDir: string
  /** models dir of an existing install to borrow from; null on a fresh machine */
  liveModelsDir: string | null
}

export async function planModelAssembly(
  assets: ModelAsset[],
  dirs: AssemblyDirs,
  deps: { fileExists: SystemPort['fileExists'] },
): Promise<AssemblyAction[]> {
  const plan: AssemblyAction[] = []
  for (const asset of assets) {
    const rel = `${asset.subfolder}\\${asset.name}`
    const managed = `${dirs.managedModelsDir}\\${rel}`
    if (await deps.fileExists(managed)) {
      plan.push({ kind: 'skip', name: asset.name, reason: 'already in managed install' })
      continue
    }
    const live = dirs.liveModelsDir === null ? null : `${dirs.liveModelsDir}\\${rel}`
    if (live !== null && (await deps.fileExists(live))) {
      plan.push({ kind: 'copy', name: asset.name, from: live, to: managed, approxMb: asset.approxMb })
      continue
    }
    if (asset.url !== null) {
      plan.push({ kind: 'download', asset })
      continue
    }
    plan.push({ kind: 'manual', name: asset.name, reason: asset.note })
  }
  return plan
}

export interface CopyResult {
  ok: boolean
  message: string
}

/** Copy one planned asset and verify the bytes landed intact (size parity). */
export async function executeCopy(
  action: Extract<AssemblyAction, { kind: 'copy' }>,
  deps: {
    runPowerShell: SystemPort['runPowerShell']
    ensureDir: SystemPort['ensureDir']
    statSize: SystemPort['statSize']
  },
): Promise<CopyResult> {
  const targetDir = action.to.slice(0, action.to.lastIndexOf('\\'))
  await deps.ensureDir(targetDir)
  try {
    await deps.runPowerShell(`Copy-Item -LiteralPath '${action.from}' -Destination '${action.to}' -Force`)
  } catch (err) {
    return { ok: false, message: `copy failed for ${action.name}: ${err instanceof Error ? err.message : String(err)}` }
  }
  const [srcSize, dstSize] = [await deps.statSize(action.from), await deps.statSize(action.to)]
  if (srcSize === null || dstSize === null || srcSize !== dstSize) {
    return { ok: false, message: `${action.name} copy size mismatch (src ${srcSize}, dst ${dstSize})` }
  }
  return { ok: true, message: `${action.name} copied from live install` }
}
