import type { ThemeId } from '../theme/themes'
import { ThemeSwitcher } from './ThemeSwitcher'
import { LeafIcon, MinIcon, CloseIcon } from './icons'

export function TitleBar({ theme, onTheme }: { theme: ThemeId; onTheme: (id: ThemeId) => void }) {
  return (
    <div className="titlebar">
      <span className="wm">
        <LeafIcon className="leaf" />
        Terrarium
      </span>
      <span className="drag-spacer" />
      <span className="tray-hint">Close → tray</span>
      <ThemeSwitcher theme={theme} onChange={onTheme} />
      <div className="win-ctl">
        <button className="wc" type="button" aria-label="Minimize" onClick={() => window.terrarium?.minimize()}>
          <MinIcon />
        </button>
        <button className="wc close" type="button" aria-label="Close to tray" onClick={() => window.terrarium?.hideToTray()}>
          <CloseIcon />
        </button>
      </div>
    </div>
  )
}
