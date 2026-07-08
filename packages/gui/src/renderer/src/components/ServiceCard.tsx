import type { ServiceView } from '../data/types'
import type { OnAction } from './actions'
import { StatusLadder } from './StatusLadder'
import { StatusBadge } from './StatusBadge'
import { PlayIcon, StopIcon, RestartIcon } from './icons'

export function ServiceCard({ svc, onAction }: { svc: ServiceView; onAction: OnAction }) {
  const fire = (type: 'start' | 'stop' | 'restart') => () => void onAction({ type, id: svc.id, label: svc.name })
  return (
    <article className="card">
      <div className="card-top">
        <span className="card-name">{svc.name}</span>
        <span className="card-port">{svc.port}</span>
        <StatusBadge state={svc.state} />
      </div>
      <StatusLadder svc={svc} />
      <div className="controls">
        <button className="ctl" type="button" title={`Start ${svc.name}`} aria-label={`Start ${svc.name}`} onClick={fire('start')}>
          <PlayIcon />
        </button>
        <button className="ctl stop" type="button" title={`Stop ${svc.name}`} aria-label={`Stop ${svc.name}`} onClick={fire('stop')}>
          <StopIcon />
        </button>
        <button className="ctl" type="button" title={`Restart ${svc.name}`} aria-label={`Restart ${svc.name}`} onClick={fire('restart')}>
          <RestartIcon />
        </button>
      </div>
    </article>
  )
}
