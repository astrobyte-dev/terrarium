import { useCallback, useEffect, useState } from 'react'
import { loadTheme, saveTheme, type ThemeId } from './themes'

/** Owns the active theme: reflects it onto <html data-theme> and persists it. */
export function useTheme(): { theme: ThemeId; change: (id: ThemeId) => void } {
  const [theme, setTheme] = useState<ThemeId>(loadTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    saveTheme(theme)
  }, [theme])

  const change = useCallback((id: ThemeId) => setTheme(id), [])
  return { theme, change }
}
