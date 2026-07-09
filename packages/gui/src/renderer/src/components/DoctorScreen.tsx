import { useCallback, useEffect, useState } from 'react'
import type { DoctorReportView } from '../data/types'

// Shape per status (deuteranomaly-safe): filled dot / triangle / cross + the word.
const GLYPH: Record<string, string> = { ok: '●', warn: '▲', fail: '✕' }

export function DoctorScreen() {
  const [report, setReport] = useState<DoctorReportView | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [repairing, setRepairing] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    const d = window.terrarium?.doctor
    if (!d) return
    setBusy(true)
    setReport(await d.report())
    setBusy(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const doRepair = async () => {
    setConfirming(false)
    setRepairing(true)
    setNote(null)
    const r = await window.terrarium.doctor.repair()
    setRepairing(false)
    setNote({ ok: r.ok, text: r.message })
    if (r.ok) await load()
  }

  const fixable = (report?.checks ?? []).some((c) => c.fix === 'regenerate-config')

  return (
    <div className="doctor">
      <header className="doc-head">
        <div>
          <h2>Doctor</h2>
          <p>A health check of your setup — config, credentials, ownership, brain.</p>
        </div>
        <button className="bb-check" type="button" disabled={busy} onClick={() => void load()}>
          {busy ? 'Checking…' : 'Re-check'}
        </button>
      </header>

      {report && (
        <div className={`doc-overall ${report.healthy ? 'ok' : 'warn'}`}>
          {report.healthy ? '✓ Everything checks out' : 'Some checks want a look — details below'}
        </div>
      )}

      <div className="doc-checks">
        {(report?.checks ?? []).map((c) => (
          <div className={`doc-check ${c.status}`} key={c.id}>
            <span className="doc-badge">
              {GLYPH[c.status]} {c.status.toUpperCase()}
            </span>
            <div className="doc-body">
              <span className="doc-title">{c.title}</span>
              <span className="doc-detail">{c.detail}</span>
            </div>
          </div>
        ))}
      </div>

      {note && <div className={`doc-repair-note ${note.ok ? 'ok' : 'err'}`}>{note.text}</div>}

      {fixable && !confirming && (
        <button className="doc-repair" type="button" disabled={repairing} onClick={() => setConfirming(true)}>
          {repairing ? 'Repairing…' : 'Repair config'}
        </button>
      )}
      {confirming && (
        <div className="doc-confirm">
          <p>
            Regenerate <code>openclaw.json</code> from the known-good template? Your hand-tuning (models, primary, params)
            is <b>preserved</b> — only app-owned structure and secret placement are realigned. A backup is saved first;
            restart the gateway afterward to apply.
          </p>
          <div className="doc-confirm-row">
            <button className="btn-primary" type="button" onClick={() => void doRepair()}>
              Regenerate
            </button>
            <button className="bb-check" type="button" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <p className="doc-note">
        Config is compared to Terrarium's known-good template. Because you've hand-tuned <code>openclaw.json</code>
        {' '}(models, brains, context sizes), some “drift” here is <b>expected and fine</b> — it's flagged, not broken.
        Repair is safe to run: it regenerates the template structure while carrying your tuning across, so it won't
        overwrite your models. You can also fix issues via Brains or by editing the config directly.
      </p>
    </div>
  )
}
