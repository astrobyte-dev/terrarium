import { useCallback, useEffect, useState } from 'react'
import type { DoctorReportView } from '../data/types'

// Shape per status (deuteranomaly-safe): filled dot / triangle / cross + the word.
const GLYPH: Record<string, string> = { ok: '●', warn: '▲', fail: '✕' }

export function DoctorScreen() {
  const [report, setReport] = useState<DoctorReportView | null>(null)
  const [busy, setBusy] = useState(false)

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

  return (
    <div className="doctor">
      <header className="doc-head">
        <div>
          <h2>Doctor</h2>
          <p>A read-only health check of your setup — config, credentials, ownership, brain.</p>
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

      <p className="doc-note">
        Config is compared to Terrarium's known-good template. Since you've hand-tuned <code>openclaw.json</code>
        {' '}(models, brains, context sizes), some “drift” here is <b>expected and fine</b> — it's flagged, not broken.
        Auto-repair is intentionally disabled: regenerating from the template would overwrite your tuning. Fix issues via
        Brains or by editing the config.
      </p>
    </div>
  )
}
