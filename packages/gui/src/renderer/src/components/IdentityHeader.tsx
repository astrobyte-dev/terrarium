import type { MetaView } from '../data/types'
import type { OnAction } from './actions'

export function IdentityHeader({ meta, onAction }: { meta: MetaView; onAction: OnAction }) {
  const bot = meta.bot
  const initial = bot?.name?.charAt(0) ?? '·'
  return (
    <header className="identity">
      <div className="avatar" aria-hidden="true">
        {initial}
      </div>
      <div className="who">
        <span className="nm">{bot?.name ?? 'Connecting…'}</span>
        <span className="hd">{bot?.handle ?? 'reading bot identity'}</span>
      </div>
      <div className="rt">
        {bot?.live ? (
          <span className="live-pill">
            <span className="lp" aria-hidden="true" />
            Live
          </span>
        ) : (
          <span className="off-pill">Gateway offline</span>
        )}
        <button className="btn-primary" type="button" onClick={() => void onAction({ type: 'restartAll', label: 'all services' })}>
          Restart all
        </button>
      </div>
    </header>
  )
}
