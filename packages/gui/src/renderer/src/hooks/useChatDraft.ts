import { useState } from 'react'

const KEY = 'terrarium.chat.draft.v1'

/** Write on edit so navigation or a fast window reload cannot outrun an effect. */
export function useChatDraft() {
  const [draft, update] = useState(() => {
    try { return localStorage.getItem(KEY) ?? '' } catch { return '' }
  })
  const setDraft = (text: string) => {
    update(text)
    try {
      if (text) localStorage.setItem(KEY, text)
      else localStorage.removeItem(KEY)
    } catch { /* Keep the composer usable when storage is unavailable. */ }
  }
  return [draft, setDraft] as const
}
