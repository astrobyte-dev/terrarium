import { RUNGS, type ServiceView } from '../data/types'

// The 4-rung ladder: installed -> running -> responds -> live.
// Rung state is shown by pip SHAPE (filled / ringed / hollow-dash / outline)
// AND the always-present text label — never colour alone (deuteranomaly-safe).
export function StatusLadder({ svc }: { svc: ServiceView }) {
  return (
    <div className="ladder" role="list" aria-label={`${svc.name} status ladder`}>
      {RUNGS.map((r, i) => {
        const done = i < svc.reachedIdx || (i === svc.reachedIdx && svc.state === 'live')
        const current = i === svc.reachedIdx && svc.state !== 'live'
        const stalled = current && (svc.state === 'idle' || svc.state === 'down')
        const cls = ['rung', done && 'done', current && 'now', stalled && 'stalled'].filter(Boolean).join(' ')
        const sr = done ? 'reached' : stalled ? 'stalled at' : current ? 'at' : 'not yet'
        return (
          <div className={cls} role="listitem" key={r.key}>
            <span className="pip" aria-hidden="true" />
            <span className="rl">{r.label}</span>
            <span className="sr-only">{`${sr} ${r.label}`}</span>
          </div>
        )
      })}
    </div>
  )
}
