import type { CatalogEntry } from './models'

export interface Hardware {
  vramMb: number
  ramMb: number
}

export interface TrafficOptions {
  /** VRAM held by a resident ComfyUI (the --reserve-vram lesson). */
  comfyResidentMb?: number
  /** OpenClaw's ~16k system prompt makes <24k context a death spiral. */
  contextTokens?: number
}

export interface Light {
  color: 'green' | 'amber' | 'red'
  reason: string
}

const RUNTIME_OVERHEAD_MB = 1500
const MIN_CONTEXT_TOKENS = 24
const gb = (mb: number) => (mb / 1024).toFixed(1)

/**
 * Can this brain run well on this machine? VRAM math includes the KV cache
 * at the context OpenClaw actually needs — "the weights fit" is not enough.
 */
export function trafficLight(entry: CatalogEntry, hw: Hardware, opts: TrafficOptions = {}): Light {
  if (entry.kind === 'hosted') {
    return { color: 'green', reason: 'runs remotely — needs internet and an API key, no hardware ceiling' }
  }
  if (entry.reasoning) {
    return { color: 'red', reason: "reasoning model — breaks OpenClaw's pipe (thinking spam / empty replies)" }
  }

  const contextK = Math.max(opts.contextTokens ?? MIN_CONTEXT_TOKENS, MIN_CONTEXT_TOKENS)
  const neededMb = (entry.weightsMb ?? 0) + (entry.kvMbPer1kCtx ?? 0) * contextK + RUNTIME_OVERHEAD_MB
  const vramAvailable = Math.max(0, hw.vramMb - (opts.comfyResidentMb ?? 0))

  if (neededMb <= vramAvailable) {
    return { color: 'green', reason: `fits in VRAM (~${gb(neededMb)} GB needed at ${contextK}k context)` }
  }
  if (neededMb <= vramAvailable + hw.ramMb * 0.75) {
    const how = hw.vramMb === 0 ? 'CPU-only' : 'CPU offload'
    return { color: 'amber', reason: `runs with ${how} — expect slow replies (~${gb(neededMb)} GB needed)` }
  }
  return {
    color: 'red',
    reason: `too big for this machine (~${gb(neededMb)} GB needed at ${contextK}k context)`,
  }
}
