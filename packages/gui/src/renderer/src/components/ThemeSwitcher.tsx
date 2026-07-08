import { THEMES, type ThemeId } from '../theme/themes'

export function ThemeSwitcher({ theme, onChange }: { theme: ThemeId; onChange: (id: ThemeId) => void }) {
  return (
    <div className="theme-pick" role="tablist" aria-label="Theme">
      {THEMES.map((t) => (
        <button
          key={t.id}
          className={t.id === theme ? 'on' : ''}
          type="button"
          role="tab"
          aria-selected={t.id === theme}
          title={t.blurb}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
