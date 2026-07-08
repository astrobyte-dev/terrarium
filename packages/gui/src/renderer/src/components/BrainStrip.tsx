import type { MetaView } from '../data/types'
import { BrainIcon, GpuIcon } from './icons'

export function BrainStrip({ meta }: { meta: MetaView }) {
  const gpu = meta.gpu
  const pct = gpu && gpu.usedGb !== null ? Math.round((gpu.usedGb / gpu.totalGb) * 100) : null
  return (
    <section className="strip">
      <div className="info-card">
        <BrainIcon className="ico" />
        <div>
          <div className="k">Brain</div>
          <div className="v">{meta.brain}</div>
        </div>
        <button className="chg" type="button">
          Change
        </button>
      </div>
      <div className="info-card">
        <GpuIcon className="ico" />
        <div className="grow">
          <div className="k">GPU{gpu ? ` · ${gpu.name}` : ''}</div>
          <div className="v small">
            {gpu ? (pct !== null ? `${gpu.usedGb} / ${gpu.totalGb} GB VRAM` : `${gpu.totalGb} GB VRAM`) : 'detecting…'}
          </div>
          {pct !== null && (
            <div className="vram" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <i style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
