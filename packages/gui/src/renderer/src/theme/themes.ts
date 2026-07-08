// The theme registry. Token VALUES live in styles/tokens.css keyed by
// :root[data-theme="..."]; this module is the list + the persisted choice, so
// the switcher and a future Settings screen share one source of truth.
export type ThemeId = 'glass' | 'instrument' | 'tank'

export interface ThemeMeta {
  id: ThemeId
  label: string
  blurb: string
}

export const THEMES: ThemeMeta[] = [
  { id: 'glass', label: 'Living Glass', blurb: 'Warm botanical' },
  { id: 'instrument', label: 'Instrument', blurb: 'Tactile hardware' },
  { id: 'tank', label: 'Deep Tank', blurb: 'Cinematic depth' },
]

export const DEFAULT_THEME: ThemeId = 'glass'

const KEY = 'terrarium.theme'

export function loadTheme(): ThemeId {
  const v = localStorage.getItem(KEY)
  return v === 'glass' || v === 'instrument' || v === 'tank' ? v : DEFAULT_THEME
}

export function saveTheme(id: ThemeId): void {
  localStorage.setItem(KEY, id)
}
