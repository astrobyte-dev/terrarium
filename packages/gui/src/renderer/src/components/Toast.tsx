import { useEffect } from 'react'

export interface ToastMsg {
  ok: boolean
  message: string
}

export function Toast({ toast, onDone }: { toast: ToastMsg | null; onDone: () => void }) {
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(onDone, 4600)
    return () => clearTimeout(t)
  }, [toast, onDone])
  if (!toast) return null
  return (
    <div className={`toast ${toast.ok ? 'ok' : 'err'}`} role="status">
      {toast.message}
    </div>
  )
}
