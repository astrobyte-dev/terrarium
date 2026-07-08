import { useCallback, useEffect, useState } from 'react'
import type { ActionRequest, ActionResult, LogLine, MetaView, ServiceView } from '../data/types'
import { INITIAL_LOGS, INITIAL_META, INITIAL_SERVICES } from '../data/initial'

/** Subscribes to the live core over the preload bridge; owns dashboard state. */
export function useLiveDashboard() {
  const [meta, setMeta] = useState<MetaView>(INITIAL_META)
  const [services, setServices] = useState<ServiceView[]>(INITIAL_SERVICES)
  const [logs, setLogs] = useState<LogLine[]>(INITIAL_LOGS)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const core = window.terrarium?.core
    if (!core) return
    let alive = true
    core
      .getState()
      .then((st) => {
        if (!alive) return
        setServices(st.services)
        setMeta(st.meta)
        setConnected(true)
      })
      .catch(() => {})
    const offS = core.onServices(setServices)
    const offM = core.onMeta(setMeta)
    const offL = core.onLog((l) => setLogs((prev) => [...prev, l].slice(-200)))
    return () => {
      alive = false
      offS()
      offM()
      offL()
    }
  }, [])

  const doAction = useCallback(async (req: ActionRequest): Promise<ActionResult> => {
    const core = window.terrarium?.core
    if (!core) return { ok: false, message: 'not connected' }
    return core.action(req)
  }, [])

  return { meta, services, logs, connected, doAction }
}
