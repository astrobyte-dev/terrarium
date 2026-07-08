import type { SystemPort } from '../system/system-port'

/**
 * The custom nodes the companion photo pipeline needs. Standard ones are git
 * repos (cloned + pip-installed against the embedded Python); the small
 * bespoke ones from the original build ship WITH Terrarium and are copied in
 * (`bundled: true`) since they have no upstream repo.
 */
export interface CustomNode {
  name: string
  repo: string | null // null → bundled/local, copied not cloned
  pipRequirements: boolean
  note: string
}

export const CUSTOM_NODES: CustomNode[] = [
  { name: 'ComfyUI-Impact-Pack', repo: 'https://github.com/ltdrdata/ComfyUI-Impact-Pack.git', pipRequirements: true, note: 'FaceDetailer + detectors (fixes morphed faces/hands)' },
  { name: 'ComfyUI-Impact-Subpack', repo: 'https://github.com/ltdrdata/ComfyUI-Impact-Subpack.git', pipRequirements: true, note: 'UltralyticsDetectorProvider (yolo)' },
  { name: 'ComfyUI_IPAdapter_plus', repo: 'https://github.com/cubiq/ComfyUI_IPAdapter_plus.git', pipRequirements: false, note: 'face-lock (IPAdapter)' },
  { name: 'comfyui-ollama', repo: 'https://github.com/stavsap/comfyui-ollama.git', pipRequirements: true, note: 'ollama nodes' },
  { name: 'character_ipadapter', repo: null, pipRequirements: false, note: 'bespoke: per-character face ref switching' },
  { name: 'prompt_model_switcher', repo: null, pipRequirements: false, note: 'bespoke: photoreal/anime checkpoint switch' },
  { name: 'random_seed', repo: null, pipRequirements: false, note: 'bespoke: seed helper' },
  { name: 'write_text_file', repo: null, pipRequirements: false, note: 'bespoke: text output' },
]

export interface NodeInstallDeps {
  runPowerShell: SystemPort['runPowerShell']
  fileExists: SystemPort['fileExists']
}

export interface NodeInstallResult {
  ok: boolean
  message: string
}

/**
 * Clone a git custom node into the managed ComfyUI and, if it declares
 * requirements, pip-install them against the *embedded* Python (never the
 * system Python — dep isolation is the whole point of the portable).
 */
export async function installGitNode(
  node: CustomNode,
  paths: { customNodesDir: string; embeddedPython: string },
  deps: NodeInstallDeps,
): Promise<NodeInstallResult> {
  if (node.repo === null) {
    return { ok: false, message: `${node.name} is bundled/local — copy it in, don't clone` }
  }
  const target = `${paths.customNodesDir}\\${node.name}`
  if (await deps.fileExists(target)) {
    return { ok: true, message: `${node.name} already present` }
  }

  try {
    await deps.runPowerShell(`git clone --depth 1 '${node.repo}' '${target}'`)
  } catch (err) {
    return { ok: false, message: `git clone failed for ${node.name}: ${errText(err)}` }
  }
  if (!(await deps.fileExists(target))) {
    return { ok: false, message: `clone reported success but ${node.name} is missing` }
  }

  if (node.pipRequirements) {
    const req = `${target}\\requirements.txt`
    if (await deps.fileExists(req)) {
      try {
        await deps.runPowerShell(`& '${paths.embeddedPython}' -m pip install -r '${req}'`)
      } catch (err) {
        return { ok: false, message: `${node.name} cloned, but pip install failed: ${errText(err)}` }
      }
    }
  }
  return { ok: true, message: `${node.name} installed` }
}

export interface BundledInstallDeps {
  fileExists: SystemPort['fileExists']
  readTextFile: SystemPort['readTextFile']
  writeTextFile: SystemPort['writeTextFile']
  ensureDir: SystemPort['ensureDir']
}

/**
 * Copy a bespoke node that ships with Terrarium (a single `__init__.py`)
 * into the managed ComfyUI. These have no upstream repo — the app is the
 * source of truth.
 */
export async function installBundledNode(
  node: CustomNode,
  paths: { customNodesDir: string; bundledDir: string },
  deps: BundledInstallDeps,
): Promise<NodeInstallResult> {
  if (node.repo !== null) {
    return { ok: false, message: `${node.name} is a git node — clone it, don't copy` }
  }
  const target = `${paths.customNodesDir}\\${node.name}\\__init__.py`
  if (await deps.fileExists(target)) {
    return { ok: true, message: `${node.name} already present` }
  }
  const source = `${paths.bundledDir}\\${node.name}\\__init__.py`
  if (!(await deps.fileExists(source))) {
    return { ok: false, message: `bundled source for ${node.name} is missing from the app (${source})` }
  }
  const code = await deps.readTextFile(source)
  await deps.ensureDir(`${paths.customNodesDir}\\${node.name}`)
  await deps.writeTextFile(target, code)
  return { ok: true, message: `${node.name} installed (bundled)` }
}

const errText = (err: unknown): string => (err instanceof Error ? err.message : String(err))
