import { useCallback, useEffect, useState } from 'react'
import type { BrainLiveness, BrainOpt, BrainsList } from '../data/types'

const LIVE_LABEL: Record<string, string> = { up: 'Live', down: 'Down', local: 'Local', unknown: '—' }

export function BrainsScreen() {
  const [list, setList] = useState<BrainsList>({ current: '', models: [] })
  const [live, setLive] = useState<BrainLiveness>({})
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [showRestart, setShowRestart] = useState(false)

  const refresh = useCallback(() => window.terrarium?.brains.list().then(setList), [])

  useEffect(() => {
    const b = window.terrarium?.brains
    if (!b) return
    b.list().then(setList)
    b.probe().then(setLive).catch(() => {})
  }, [])

  const setBrain = async (m: BrainOpt) => {
    setBusy(m.ref)
    setShowRestart(false)
    const res = await window.terrarium.brains.set(m.ref)
    setNote({ ok: res.ok, text: res.message })
    if (res.ok) {
      setShowRestart(true)
      await refresh()
    }
    setBusy(null)
  }

  const restartGateway = async () => {
    const r = await window.terrarium.core.action({ type: 'restart', id: 'gateway', label: 'gateway' })
    setNote({ ok: r.ok, text: r.message })
    setShowRestart(false)
  }

  const hosted = list.models.filter((m) => m.kind === 'hosted')
  const local = list.models.filter((m) => m.kind === 'local')

  const row = (m: BrainOpt) => {
    const isCurrent = m.ref === list.current
    const status = live[m.ref] ?? 'unknown'
    return (
      <div className={`brain-row ${isCurrent ? 'current' : ''}`} key={m.ref}>
        <div className="brain-main">
          <span className="brain-name">{m.id}</span>
          <div className="brain-tags">
            <span className={`brain-live ${status}`}>{LIVE_LABEL[status]}</span>
            {m.contextWindow !== null && <span className="brain-ctx">{Math.round(m.contextWindow / 1024)}k ctx</span>}
            {m.reasoning && <span className="brain-warn">⚠ reasoning — breaks OpenClaw</span>}
          </div>
        </div>
        {isCurrent ? (
          <span className="brain-current-badge">Current</span>
        ) : (
          <button className="brain-set" type="button" disabled={m.reasoning || busy !== null} onClick={() => void setBrain(m)}>
            {busy === m.ref ? 'Setting…' : 'Set as brain'}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="brains">
      <header className="brains-head">
        <h2>Brains</h2>
        <p>
          Your current brain is <b>{list.current.split('/').pop() || '—'}</b>. Changes take effect after restarting
          the gateway. Local models marked as unverified are unavailable until their chat compatibility is tested.
        </p>
      </header>
      {list.veniceBudget && <div className="brains-note">
        <span>Venice API allowance: US${Math.max(0, list.veniceBudget.limitUsd - list.veniceBudget.accountedUsd).toFixed(3)} remaining
          {' '}of US${list.veniceBudget.limitUsd.toFixed(2)} total. Includes conservative reservations; this is not your Venice account balance.
          {' '}At the limit, chat uses its fallback. Subscription credits may cover API use.</span>
      </div>}

      {note && (
        <div className={`brains-note ${note.ok ? 'ok' : 'err'}`}>
          <span>{note.text}</span>
          {showRestart && (
            <button className="brains-restart" type="button" onClick={() => void restartGateway()}>
              Restart gateway now
            </button>
          )}
        </div>
      )}

      <section className="brain-group">
        <h3>Hosted · Venice / ArliAI</h3>
        {hosted.length === 0 ? <p className="brain-empty">none configured</p> : hosted.map(row)}
      </section>
      <section className="brain-group">
        <h3>Local · Ollama</h3>
        {local.length === 0 ? <p className="brain-empty">none configured</p> : local.map(row)}
      </section>
    </div>
  )
}
