const COPY: Record<string, { title: string; body: string }> = {
  bots: { title: 'Bot Builder', body: 'Create and edit companions — brain, persona, photo look. Lands in M7c.' },
  brains: { title: 'Brains', body: 'Hardware-aware brain picker with traffic lights. Lands in M7c.' },
  chat: { title: 'Chat', body: 'Talk to your companion in-app. The chat surface comes last, by design.' },
  doctor: { title: 'Doctor', body: 'Diagnose drift and repair to a known-good state. Lands in M7c.' },
}

export function Placeholder({ section }: { section: string }) {
  const c = COPY[section] ?? { title: section, body: 'Coming soon.' }
  return (
    <div className="placeholder">
      <h2>{c.title}</h2>
      <p>{c.body}</p>
      <span className="soon">Not built yet — the Dashboard is the M7a slice.</span>
    </div>
  )
}
