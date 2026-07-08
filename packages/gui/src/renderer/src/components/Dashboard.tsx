import type { LogLine, MetaView, ServiceView } from '../data/types'
import type { OnAction } from './actions'
import { IdentityHeader } from './IdentityHeader'
import { ServiceCard } from './ServiceCard'
import { BrainStrip } from './BrainStrip'
import { LogPane } from './LogPane'

export function Dashboard({
  meta,
  services,
  logs,
  connected,
  onAction,
}: {
  meta: MetaView
  services: ServiceView[]
  logs: LogLine[]
  connected: boolean
  onAction: OnAction
}) {
  return (
    <div className="dashboard">
      <IdentityHeader meta={meta} onAction={onAction} />
      <section className="svc-grid">
        {services.length === 0 ? (
          <div className="empty-cards">{connected ? 'No services detected.' : 'Connecting to the core…'}</div>
        ) : (
          services.map((s) => <ServiceCard key={s.id} svc={s} onAction={onAction} />)
        )}
      </section>
      <BrainStrip meta={meta} />
      <LogPane logs={logs} />
    </div>
  )
}
