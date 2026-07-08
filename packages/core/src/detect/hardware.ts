import type { GpuInfo } from '../types'

export const NVIDIA_SMI_QUERY =
  'nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits'

/** Parse `csv,noheader,nounits` output: one "name, vramMb" line per GPU. */
export function parseNvidiaSmi(output: string): GpuInfo[] {
  const gpus: GpuInfo[] = []
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.trim()
    if (line === '') continue
    const comma = line.lastIndexOf(',')
    if (comma < 1) continue
    const vramMb = Number(line.slice(comma + 1).trim())
    if (!Number.isFinite(vramMb) || vramMb <= 0) continue
    gpus.push({ name: line.slice(0, comma).trim(), vramMb })
  }
  return gpus
}
