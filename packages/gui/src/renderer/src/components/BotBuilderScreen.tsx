import { useState } from 'react'
import type { BotPreview, BotSpecInput } from '../data/types'

interface Form {
  displayName: string
  age: string
  look: string
  vibe: string
  loves: string
  relationship: string
  backstory: string
  speechStyle: string
  openerIdeas: string
  hardRules: string
  photoIdentity: string
  photoOutfit: string
  photoShot: string
}

const EMPTY: Form = {
  displayName: '',
  age: '18',
  look: '',
  vibe: '',
  loves: '',
  relationship: '',
  backstory: '',
  speechStyle: '',
  openerIdeas: '',
  hardRules: '',
  photoIdentity: '',
  photoOutfit: '',
  photoShot: '',
}

const deriveSlug = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24)
const lines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean)

function buildSpec(f: Form): BotSpecInput {
  return {
    slug: deriveSlug(f.displayName),
    displayName: f.displayName.trim(),
    age: Number.parseInt(f.age, 10) || 0,
    look: f.look.trim(),
    vibe: f.vibe.trim(),
    loves: f.loves.trim(),
    relationship: f.relationship.trim(),
    backstory: f.backstory.trim(),
    speechStyle: lines(f.speechStyle),
    openerIdeas: lines(f.openerIdeas),
    hardRules: lines(f.hardRules),
    photo: { identity: f.photoIdentity.trim(), outfit: f.photoOutfit.trim(), shot: f.photoShot.trim() },
  }
}

export function BotBuilderScreen() {
  const [f, setF] = useState<Form>(EMPTY)
  const [preview, setPreview] = useState<BotPreview | null>(null)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [concept, setConcept] = useState('')
  const [mode, setMode] = useState<'sfw' | 'nsfw'>('sfw')
  const [drafting, setDrafting] = useState(false)

  const doDraft = async () => {
    const name = f.displayName.trim()
    const idea = concept.trim()
    if (!name || !idea) {
      setNote({ ok: false, text: 'add a display name and a concept first' })
      return
    }
    setDrafting(true)
    setNote(null)
    const r = await window.terrarium.bots.draft({
      displayName: name,
      age: Number.parseInt(f.age, 10) || 18,
      concept: idea,
      mode,
    })
    setDrafting(false)
    if (r.ok && r.persona) {
      const p = r.persona
      setF((prev) => ({
        ...prev,
        look: p.look,
        vibe: p.vibe,
        loves: p.loves,
        relationship: p.relationship,
        backstory: p.backstory,
        speechStyle: p.speechStyle.join('\n'),
        openerIdeas: p.openerIdeas.join('\n'),
        photoIdentity: p.photo.identity,
        photoOutfit: p.photo.outfit,
        photoShot: p.photo.shot,
      }))
      setPreview(null)
      setNote({ ok: true, text: 'Drafted — review and tweak anything, then Preview / check.' })
    } else {
      setNote({ ok: false, text: r.error ?? 'draft failed — is Ollama running?' })
    }
  }

  const set = (k: keyof Form) => (e: { target: { value: string } }) => {
    setF((prev) => ({ ...prev, [k]: e.target.value }))
    setPreview(null)
    setNote(null)
  }
  const spec = buildSpec(f)
  const slug = spec.slug

  const doPreview = async () => {
    setBusy(true)
    setPreview(await window.terrarium.bots.preview(spec))
    setBusy(false)
  }
  const doCreate = async () => {
    setBusy(true)
    const r = await window.terrarium.bots.create(spec)
    if (r.ok && r.wrote) {
      setNote({
        ok: true,
        text: `Created ${spec.displayName}! Card written (backup ${r.backupPath?.split('\\').pop()}). Restart the gateway, then /be ${slug} to meet her.`,
      })
    } else {
      setNote({ ok: false, text: r.errors.join(' · ') || 'could not create' })
    }
    setBusy(false)
  }

  const canCreate = preview?.ok === true && preview.fits && !busy
  const pct = preview ? Math.min(100, Math.round((preview.resultChars / 11800) * 100)) : 0

  const T = (label: string, k: keyof Form, ph: string, hint?: string) => (
    <label className="bb-field">
      <span className="bb-label">{label}</span>
      <input value={f[k]} onChange={set(k)} placeholder={ph} />
      {hint && <span className="bb-hint">{hint}</span>}
    </label>
  )
  const A = (label: string, k: keyof Form, ph: string, hint?: string, rows = 2) => (
    <label className="bb-field">
      <span className="bb-label">{label}</span>
      <textarea rows={rows} value={f[k]} onChange={set(k)} placeholder={ph} />
      {hint && <span className="bb-hint">{hint}</span>}
    </label>
  )

  return (
    <div className="bb">
      <div className="bb-form">
        <header className="bb-head">
          <h2>Bot Builder</h2>
          <p>
            Create a companion. She gets a full card in <code>characters/{slug || '<slug>'}.md</code> and a compact card
            in <code>AGENTS.md</code> (backed up first, only if it fits the 12k budget).
          </p>
          <p className="bb-guard">18+ only — the floor, no exceptions. Photo fields reject age-coded terms.</p>
        </header>

        <div className="bb-section">Identity</div>
        {T('Display name', 'displayName', 'Nova', slug ? `saved as: ${slug}` : 'type a name to generate the slug')}
        <label className="bb-field bb-age">
          <span className="bb-label">Age</span>
          <input type="number" min={18} value={f.age} onChange={set('age')} />
          <span className="bb-hint">must be 18 or older</span>
        </label>

        <div className="bb-section">Draft with AI</div>
        <div className="bb-ai">
          <label className="bb-field">
            <span className="bb-label">Concept</span>
            <input
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              placeholder="one line, e.g. “flirty australian DJ who loves late sets”"
            />
            <span className="bb-hint">a local model fills the personality below from the name + concept — you edit it, and the 18+ gate still runs on preview</span>
          </label>
          <div className="bb-ai-row">
            <div className="bb-toggle" role="group" aria-label="Tone">
              <button type="button" className={mode === 'sfw' ? 'on' : ''} onClick={() => setMode('sfw')}>
                SFW
              </button>
              <button type="button" className={mode === 'nsfw' ? 'on' : ''} onClick={() => setMode('nsfw')}>
                NSFW
              </button>
            </div>
            <button className="bb-draft" type="button" disabled={drafting} onClick={() => void doDraft()}>
              {drafting ? 'Drafting…' : '✨ Draft with AI'}
            </button>
          </div>
        </div>

        <div className="bb-section">Personality</div>
        {A('Look', 'look', 'tall, silver-dyed hair, dark eyes, athletic build…')}
        {A('Vibe', 'vibe', 'dry-witted night-owl DJ, teasing but warm underneath…')}
        {T('Loves', 'loves', 'vinyl crates, synthwave, 3am food runs')}
        {A('Relationship', 'relationship', 'how she knows Corey / the dynamic')}
        {A('Backstory', 'backstory', 'a few lines of history')}

        <div className="bb-section">Voice</div>
        {A('Speech style', 'speechStyle', 'one bullet per line\nlowercase, dry one-liners\nmusic references everywhere', 'one per line', 3)}
        {A('Opener ideas', 'openerIdeas', 'one per line\njust finished a set and is wired\nfound a record he would love', 'one per line', 3)}
        {A('Hard rules', 'hardRules', 'optional — one per line\nteases but never mean', 'optional, one per line', 2)}

        <div className="bb-section">Photo pipeline</div>
        {T('Identity', 'photoIdentity', 'woman, 22, silver hair, athletic', 'structured — no age-coded terms')}
        {T('Outfit', 'photoOutfit', 'oversized band tee, headphones round neck')}
        {T('Shot', 'photoShot', 'leaning on a DJ booth, neon backlight')}

        <div className="bb-actions">
          <button className="bb-check" type="button" disabled={busy} onClick={() => void doPreview()}>
            {busy ? 'Checking…' : 'Preview / check'}
          </button>
          <button className="btn-primary" type="button" disabled={!canCreate} onClick={() => void doCreate()}>
            Create {spec.displayName || 'companion'}
          </button>
        </div>
      </div>

      <aside className="bb-preview">
        <div className="bb-section">Preview</div>
        {note && <div className={`bb-note ${note.ok ? 'ok' : 'err'}`}>{note.text}</div>}
        {!preview && !note && <p className="bb-empty">Fill the form and hit “Preview / check” to see her compact card and whether it fits AGENTS.md.</p>}
        {preview && (
          <>
            {preview.errors.length > 0 ? (
              <div className="bb-errors">
                {preview.errors.map((e, i) => (
                  <div className="bb-err-line" key={i}>
                    ⚠ {e}
                  </div>
                ))}
              </div>
            ) : (
              <div className={`bb-budget ${preview.fits ? '' : 'over'}`}>
                <div className="bb-budget-row">
                  <span>AGENTS.md budget</span>
                  <span className="bb-budget-num">
                    {preview.currentChars} → {preview.resultChars} / 11800
                  </span>
                </div>
                <div className="bb-bar">
                  <i style={{ width: `${pct}%` }} />
                </div>
                <span className="bb-hint">
                  {preview.fits
                    ? `fits — card is ${preview.cardChars} chars, ${preview.headroom} headroom`
                    : `too big — trim existing cards first (${preview.headroom} over)`}
                </span>
              </div>
            )}
            {preview.compactCard && <pre className="bb-card">{preview.compactCard}</pre>}
          </>
        )}
      </aside>
    </div>
  )
}
