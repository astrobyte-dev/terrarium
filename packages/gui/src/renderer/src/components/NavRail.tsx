import type { MetaView } from '../data/types'
import type { OnAction } from './actions'
import { DashIcon, BotIcon, BrainsIcon, ChatIcon, DoctorIcon } from './icons'

export type SectionId = 'dashboard' | 'bots' | 'brains' | 'chat' | 'doctor'

const ITEMS: { id: SectionId; label: string; Icon: typeof DashIcon }[] = [
  { id: 'dashboard', label: 'Dashboard', Icon: DashIcon },
  { id: 'bots', label: 'Bot Builder', Icon: BotIcon },
  { id: 'brains', label: 'Brains', Icon: BrainsIcon },
  { id: 'chat', label: 'Chat', Icon: ChatIcon },
  { id: 'doctor', label: 'Doctor', Icon: DoctorIcon },
]

export function NavRail({
  active,
  onSelect,
  owner,
  onAction,
}: {
  active: SectionId
  onSelect: (id: SectionId) => void
  owner: MetaView['owner']
  onAction: OnAction
}) {
  const owned = owner === 'terrarium'
  return (
    <nav className="rail" aria-label="Sections">
      <span className="grp-label">Terrarium</span>
      {ITEMS.map(({ id, label, Icon }) => (
        <button
          key={id}
          className={`nav-item ${active === id ? 'active' : ''}`}
          type="button"
          aria-current={active === id ? 'page' : undefined}
          onClick={() => onSelect(id)}
        >
          <Icon />
          <span>{label}</span>
        </button>
      ))}
      <div className="rail-foot">
        <div className="owner">
          <div className="row1">
            <span className={`dot ${owned ? '' : 'off'}`} aria-hidden="true" /> {owned ? 'Terrarium owns' : 'Tasks own'}
          </div>
          <p className="sub">
            {owned ? 'Terrarium is supervising every service.' : 'The scheduled tasks own the services.'} Migrate/Release
            regenerate the config but keep your hand-tuned models, params, and primary — only secret placement changes.
          </p>
          <button
            type="button"
            onClick={() =>
              void onAction({
                type: owned ? 'release' : 'migrate',
                label: owned ? 'release to tasks' : 'migrate to Terrarium',
              })
            }
          >
            {owned ? 'Release to tasks' : 'Migrate to Terrarium'}
          </button>
        </div>
        <span className="ver">v0.9.0 · core 6.11</span>
      </div>
    </nav>
  )
}
