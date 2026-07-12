import { useCallback, useEffect, useState } from 'react'
import type { BotPreview, BotSpecInput, DraftFieldKey } from '../data/types'
import { deriveSlug } from '../data/slug'
import { Lightbox } from './Lightbox'
import { SkinDetail } from './SkinDetail'
import { ApparentAge } from './ApparentAge'
import { BodyShape } from './BodyShape'
import { PhotoPickers } from './PhotoPickers'
import { BuilderRoster } from './BuilderRoster'
import { SpecimenCard } from './SpecimenCard'
import { ArchetypeGallery } from './ArchetypeGallery'
import { SpiceDial, spiceToMode } from './SpiceDial'
import { ARCHETYPES, type Archetype, completeness, findContradictions, signatureAccent } from '../data/persona'

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

const lines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean)

// Inverse of buildSpec, for loading an existing character back into the form to edit.
// Any skin-detail phrase composed at create time simply rides back inside Identity.
function specToForm(spec: BotSpecInput): Form {
  return {
    displayName: spec.displayName,
    age: String(spec.age),
    look: spec.look,
    vibe: spec.vibe,
    loves: spec.loves,
    relationship: spec.relationship,
    backstory: spec.backstory,
    speechStyle: spec.speechStyle.join('\n'),
    openerIdeas: spec.openerIdeas.join('\n'),
    hardRules: spec.hardRules.join('\n'),
    photoIdentity: spec.photo.identity,
    photoOutfit: spec.photo.outfit,
    photoShot: spec.photo.shot,
  }
}

// Apparent-age + skin-detail cues ride along in the photo Identity so both portraits
// and /pic carry them; joined here so buildSpec stays the single source of the string.
const joinIdentity = (...parts: string[]) => parts.map((p) => p.trim()).filter(Boolean).join(', ')

function buildSpec(f: Form, photoExtra = ''): BotSpecInput {
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
    photo: { identity: joinIdentity(f.photoIdentity, photoExtra), outfit: f.photoOutfit.trim(), shot: f.photoShot.trim() },
  }
}

export function BotBuilderScreen({
  editTarget,
  editNonce,
}: {
  editTarget?: { slug: string; heading: string } | null
  editNonce?: number
} = {}) {
  const [f, setF] = useState<Form>(EMPTY)
  const [preview, setPreview] = useState<BotPreview | null>(null)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [concept, setConcept] = useState('')
  const [spice, setSpice] = useState(1)
  const mode = spiceToMode(spice)
  const [flow, setFlow] = useState<'guided' | 'all'>('guided')
  const [step, setStep] = useState(0)
  const [locks, setLocks] = useState<Set<DraftFieldKey>>(new Set())
  const [activeArch, setActiveArch] = useState<Archetype | null>(null)
  const [drafting, setDrafting] = useState(false)
  const [draftNote, setDraftNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [rerolling, setRerolling] = useState<DraftFieldKey | null>(null)
  const [portraits, setPortraits] = useState<string[]>([])
  const [selectedPortrait, setSelectedPortrait] = useState<string | null>(null)
  const [genning, setGenning] = useState(false)
  const [portraitNote, setPortraitNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [skin, setSkin] = useState('')
  const [apparentAge, setApparentAge] = useState('')
  const [body, setBody] = useState('')
  const [appearance, setAppearance] = useState('')
  const [zoom, setZoom] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ slug: string; heading: string } | null>(null)
  const [rosterKey, setRosterKey] = useState(0)
  const onSkin = useCallback((phrase: string) => setSkin(phrase), [])
  const onApparentAge = useCallback((phrase: string) => setApparentAge(phrase), [])
  const onBody = useCallback((phrase: string) => setBody(phrase), [])
  const onAppearance = useCallback((phrase: string) => setAppearance(phrase), [])
  // appearance leads (ethnicity/hair/eyes carry the identity), then figure, age, skin.
  const photoExtra = joinIdentity(appearance, apparentAge, body, skin)

  const startEdit = useCallback(async (slug: string, heading: string) => {
    const r = await window.terrarium.characters.get(slug)
    if (r.ok && r.spec) {
      setF(specToForm(r.spec))
      setEditing({ slug, heading })
      setPreview(null)
      setNote({ ok: true, text: `Editing ${r.spec.displayName} — change anything and hit Save changes. Her id stays “${slug}”.` })
      setSelectedPortrait(null)
      setPortraits([])
    } else {
      setNote({ ok: false, text: r.message ?? 'could not load that character' })
    }
  }, [])

  const cancelEdit = () => {
    setEditing(null)
    setF(EMPTY)
    setPreview(null)
    setNote(null)
    setActiveArch(null)
    setStep(0)
  }

  // Edit requested from another screen (Characters → Edit): load that character in.
  useEffect(() => {
    if (editTarget) void startEdit(editTarget.slug, editTarget.heading)
    // startEdit is stable; re-run only when a new edit is requested.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editNonce])

  const generatePortraits = async () => {
    setGenning(true)
    setPortraitNote(null)
    const r = await window.terrarium.portraits.generate({
      identity: f.photoIdentity,
      look: f.look,
      extra: photoExtra,
      outfit: f.photoOutfit,
      shot: f.photoShot,
    })
    setGenning(false)
    if (r.ok) setPortraits((prev) => [...r.images, ...prev].slice(0, 12))
    else setPortraitNote({ ok: false, text: r.error ?? 'portrait generation failed' })
  }

  // Re-roll one field from the name + concept, leaving the rest of the form alone.
  const rerollField = async (k: DraftFieldKey) => {
    const name = f.displayName.trim()
    const idea = concept.trim()
    if (!name || !idea) {
      setDraftNote({ ok: false, text: 'add a display name and a concept up top, then you can re-roll any field' })
      return
    }
    setRerolling(k)
    try {
      const r = await window.terrarium.bots.draftField(
        { displayName: name, age: Number.parseInt(f.age, 10) || 18, concept: idea, mode, spice },
        k,
      )
      if (r.ok && r.value !== undefined) {
        setF((prev) => ({ ...prev, [k]: Array.isArray(r.value) ? r.value.join('\n') : (r.value as string) }))
        setPreview(null)
      } else {
        setDraftNote({ ok: false, text: r.error ?? 're-roll failed' })
      }
    } catch (e) {
      setDraftNote({ ok: false, text: `re-roll failed: ${e instanceof Error ? e.message : String(e)}` })
    } finally {
      setRerolling(null)
    }
  }

  const doDraft = async () => {
    const name = f.displayName.trim()
    const idea = concept.trim()
    if (!name) {
      setDraftNote({ ok: false, text: 'Add a display name up top first.' })
      return
    }
    if (!idea) {
      setDraftNote({ ok: false, text: 'Type a concept first — a one-line idea (e.g. “flirty australian DJ who loves late sets”).' })
      return
    }
    setDrafting(true)
    setDraftNote({ ok: true, text: `Drafting ${name}… a local model runs this, so give it ~10–30s.` })
    try {
      const r = await window.terrarium.bots.draft({
        displayName: name,
        age: Number.parseInt(f.age, 10) || 18,
        concept: idea,
        mode,
        spice,
      })
      if (r.ok && r.persona) {
        // Respect locks: a 🔒 field keeps its current value through a (re)draft.
        const p = r.persona
        const put = (k: keyof Form, ai: DraftFieldKey, v: string) => (locks.has(ai) ? {} : { [k]: v })
        setF((prev) => ({
          ...prev,
          ...put('look', 'look', p.look),
          ...put('vibe', 'vibe', p.vibe),
          ...put('loves', 'loves', p.loves),
          ...put('relationship', 'relationship', p.relationship),
          ...put('backstory', 'backstory', p.backstory),
          ...put('speechStyle', 'speechStyle', p.speechStyle.join('\n')),
          ...put('openerIdeas', 'openerIdeas', p.openerIdeas.join('\n')),
          ...put('photoIdentity', 'photoIdentity', p.photo.identity),
          ...put('photoOutfit', 'photoOutfit', p.photo.outfit),
          ...put('photoShot', 'photoShot', p.photo.shot),
        }))
        setPreview(null)
        setNote(null)
        setDraftNote({
          ok: true,
          text: locks.size > 0 ? `Drafted — kept your ${locks.size} locked field${locks.size > 1 ? 's' : ''}.` : 'Drafted below — review and tweak anything.',
        })
      } else {
        setDraftNote({ ok: false, text: r.error ?? 'Draft failed — is Ollama running?' })
      }
    } catch (e) {
      setDraftNote({ ok: false, text: `Draft failed: ${e instanceof Error ? e.message : String(e)}` })
    } finally {
      setDrafting(false)
    }
  }

  const set = (k: keyof Form) => (e: { target: { value: string } }) => {
    setF((prev) => ({ ...prev, [k]: e.target.value }))
    setPreview(null)
    setNote(null)
  }

  // Lock a field so a (re)draft or shuffle won't overwrite it.
  const toggleLock = (ai: DraftFieldKey) =>
    setLocks((prev) => {
      const next = new Set(prev)
      next.has(ai) ? next.delete(ai) : next.add(ai)
      return next
    })

  // Seed the form from a starter archetype and paint the studio her accent. `force`
  // (used by Surprise me) overwrites; a normal pick only fills empty fields so it never
  // clobbers your edits.
  const useArchetype = (a: Archetype, force = false) => {
    setActiveArch(a)
    setConcept((prev) => (force || !prev.trim() ? a.seed.concept : prev))
    const take = (prev: string, seed: string) => (force || !prev.trim() ? seed : prev)
    setF((prev) => ({
      ...prev,
      displayName: take(prev.displayName, a.name),
      vibe: take(prev.vibe, a.seed.vibe),
      loves: take(prev.loves, a.seed.loves),
      relationship: take(prev.relationship, a.seed.relationship),
      look: take(prev.look, a.seed.look),
      backstory: take(prev.backstory, a.seed.backstory),
    }))
    setPreview(null)
    setNote(null)
    setDraftNote({ ok: true, text: `Seeded ${a.name} — tweak anything, ✨ Draft to flesh her out, or move on.` })
  }

  const surpriseMe = () => {
    const a = ARCHETYPES[Math.floor(Math.random() * ARCHETYPES.length)]
    useArchetype(a, true)
    setDraftNote({ ok: true, text: `🎲 Surprised you with ${a.name}, the ${a.kind.toLowerCase()} — edit her, or ✨ Draft to go deeper.` })
  }

  const spec = buildSpec(f, photoExtra)
  const slug = spec.slug
  const comp = completeness(spec)
  const contradictions = findContradictions(f.look, spec.photo.identity)
  const accent = activeArch?.accent ?? signatureAccent(f.displayName.trim() || 'companion')
  const cardTags = activeArch?.tags ?? f.loves.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 4)
  const cardMeta = activeArch?.meta ?? f.vibe.split(/[,.]/)[0]?.trim() ?? ''

  const doPreview = async () => {
    setBusy(true)
    setPreview(await window.terrarium.bots.preview(spec))
    setBusy(false)
  }
  const doCreate = async () => {
    setBusy(true)
    // createBot validates (18+, age-coded, AGENTS.md fit) before writing, so Create
    // doesn't need a manual Preview first — it reports errors here if anything's off.
    const r = await window.terrarium.bots.create(spec)
    if (r.ok && r.wrote) {
      let faceMsg = ''
      if (selectedPortrait) {
        const sr = await window.terrarium.portraits.saveRef(slug, selectedPortrait)
        faceMsg = sr.ok ? ' Her chosen face is saved as her reference.' : ` (couldn't save the face: ${sr.message})`
      }
      setNote({
        ok: true,
        text: `Created ${spec.displayName}! Saved to characters/${slug}.md + AGENTS.md (backup ${r.backupPath?.split('\\').pop()}).${faceMsg} Say /be ${slug} in chat to meet her — takes effect next message, no restart needed.`,
      })
      setRosterKey((k) => k + 1)
    } else {
      setNote({ ok: false, text: r.errors.join(' · ') || 'could not create' })
    }
    setBusy(false)
  }

  const doSave = async () => {
    if (!editing) return
    setBusy(true)
    let faceMsg = ''
    if (selectedPortrait) {
      const sr = await window.terrarium.portraits.saveRef(editing.slug, selectedPortrait)
      faceMsg = sr.ok ? ' Her chosen face is now her reference.' : ` (couldn't save the face: ${sr.message})`
    }
    const r = await window.terrarium.characters.update(spec, editing.slug, editing.heading)
    if (r.ok) {
      setNote({ ok: true, text: `${r.message ?? 'Saved.'}${faceMsg}` })
      setEditing(null)
      setF(EMPTY)
      setPreview(null)
      setRosterKey((k) => k + 1)
    } else {
      setNote({ ok: false, text: r.message || r.errors.join(' · ') || 'could not save' })
    }
    setBusy(false)
  }

  // Create is available whenever there's a name; createBot does the real validation.
  const canCreate = spec.displayName.trim() !== '' && !busy
  const pct = preview ? Math.min(100, Math.round((preview.resultChars / 11800) * 100)) : 0

  // The little re-roll die shown on AI-draftable fields (ai = the DraftFieldKey).
  const Dice = ({ ai }: { ai?: DraftFieldKey }) =>
    ai ? (
      <button
        type="button"
        className="bb-dice"
        title="Re-roll just this field"
        aria-label={`Re-roll ${ai}`}
        disabled={rerolling !== null}
        onClick={() => void rerollField(ai)}
      >
        {rerolling === ai ? '…' : '🎲'}
      </button>
    ) : null
  const Lock = ({ ai }: { ai?: DraftFieldKey }) =>
    ai ? (
      <button
        type="button"
        className={`bb-lock ${locks.has(ai) ? 'on' : ''}`}
        title={locks.has(ai) ? 'Locked — drafts won’t change this' : 'Lock this from drafts'}
        aria-pressed={locks.has(ai)}
        aria-label={`${locks.has(ai) ? 'Unlock' : 'Lock'} ${ai}`}
        onClick={() => toggleLock(ai)}
      >
        {locks.has(ai) ? '🔒' : '🔓'}
      </button>
    ) : null
  const Label = ({ label, ai }: { label: string; ai?: DraftFieldKey }) => (
    <span className="bb-label-row">
      <span className="bb-label">{label}</span>
      <span className="bb-label-tools">
        <Lock ai={ai} />
        <Dice ai={ai} />
      </span>
    </span>
  )
  const T = (label: string, k: keyof Form, ph: string, hint?: string, ai?: DraftFieldKey) => (
    <label className="bb-field">
      <Label label={label} ai={ai} />
      <input value={f[k]} onChange={set(k)} placeholder={ph} />
      {hint && <span className="bb-hint">{hint}</span>}
    </label>
  )
  const A = (label: string, k: keyof Form, ph: string, hint?: string, rows = 2, ai?: DraftFieldKey) => (
    <label className="bb-field">
      <Label label={label} ai={ai} />
      <textarea rows={rows} value={f[k]} onChange={set(k)} placeholder={ph} />
      {hint && <span className="bb-hint">{hint}</span>}
    </label>
  )

  // Guided flow: one step at a time. Editing an existing character always shows the
  // whole form (no wizard), and the Everything toggle opts back into the full form.
  const guided = flow === 'guided' && !editing
  const show = (n: number) => !guided || step === n
  const STEP_TITLES = ['Who she is', 'How she talks', 'How she looks', 'Meet her']
  const NEXT_LABELS = ['Next: how she talks →', 'Next: how she looks →', 'Next: meet her →']

  const actionButtons = (
    <>
      <button className="bb-check" type="button" disabled={busy} onClick={() => void doPreview()}>
        {busy ? 'Checking…' : 'Preview / check'}
      </button>
      {editing && (
        <button className="bb-check" type="button" disabled={busy} onClick={cancelEdit}>
          Cancel edit
        </button>
      )}
      {editing ? (
        <button className="btn-primary" type="button" disabled={!canCreate} onClick={() => void doSave()}>
          Save changes
        </button>
      ) : (
        <button className="btn-primary" type="button" disabled={!canCreate} onClick={() => void doCreate()}>
          Create {spec.displayName || 'companion'}
        </button>
      )}
    </>
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
          {editing && (
            <div className="bb-editing-banner">
              ✎ Editing <b>{f.displayName || editing.slug}</b> — “Save changes” overwrites her card (backed up first).
            </div>
          )}
        </header>

        {!editing && (
          <div className="bb-flowbar">
            <div className="bb-modeswitch" role="group" aria-label="Builder mode">
              <button type="button" aria-pressed={guided} className={guided ? 'on' : ''} onClick={() => setFlow('guided')}>
                Guided
              </button>
              <button type="button" aria-pressed={!guided} className={!guided ? 'on' : ''} onClick={() => setFlow('all')}>
                Everything
              </button>
            </div>
            {guided && (
              <nav className="bb-rail" aria-label="Creation steps">
                {STEP_TITLES.map((t, i) => (
                  <button
                    key={t}
                    type="button"
                    className={`bb-step ${i === step ? 'on' : ''} ${i < step ? 'done' : ''}`}
                    aria-current={i === step}
                    onClick={() => setStep(i)}
                  >
                    <span className="bb-step-dot">{i + 1}</span>
                    <span className="bb-step-lbl">{t}</span>
                  </button>
                ))}
              </nav>
            )}
          </div>
        )}

        {show(0) && (
          <>
            {!editing && (
              <>
                <div className="bb-section bb-section-row">
                  <span>Start from a specimen</span>
                  <button className="bb-surprise" type="button" onClick={surpriseMe}>
                    🎲 Surprise me
                  </button>
                </div>
                <ArchetypeGallery onUse={(a) => useArchetype(a)} />
              </>
            )}

            <div className="bb-section">Identity</div>
            {T('Display name', 'displayName', 'Nova', slug ? `saved as: ${slug}` : 'type a name to generate the slug')}
            <label className="bb-field bb-age">
              <span className="bb-label">Age</span>
              <input type="number" min={18} value={f.age} onChange={set('age')} />
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
                <span className="bb-hint">a local model fills the personality below from the name + concept — you edit everything before saving</span>
              </label>
              <SpiceDial value={spice} onChange={setSpice} />
              <div className="bb-ai-row">
                <button className="bb-draft" type="button" disabled={drafting} onClick={() => void doDraft()}>
                  {drafting ? 'Drafting…' : locks.size > 0 ? '✨ Draft (keep locked)' : '✨ Draft with AI'}
                </button>
              </div>
              {draftNote && <div className={`bb-draft-note ${draftNote.ok ? 'ok' : 'err'}`}>{draftNote.text}</div>}
            </div>

            <div className="bb-section">Personality</div>
            {A('Look', 'look', 'tall, silver-dyed hair, dark eyes, athletic build…', undefined, 2, 'look')}
            {A('Vibe', 'vibe', 'dry-witted night-owl DJ, teasing but warm underneath…', undefined, 2, 'vibe')}
            {T('Loves', 'loves', 'vinyl crates, synthwave, 3am food runs', undefined, 'loves')}
            {A('Relationship', 'relationship', 'how she knows Corey / the dynamic', undefined, 2, 'relationship')}
            {A('Backstory', 'backstory', 'a few lines of history', undefined, 2, 'backstory')}
          </>
        )}

        {show(1) && (
          <>
            <div className="bb-section">Voice</div>
            {A('Speech style', 'speechStyle', 'one bullet per line\nlowercase, dry one-liners\nmusic references everywhere', 'one per line', 3, 'speechStyle')}
            {A('Opener ideas', 'openerIdeas', 'one per line\njust finished a set and is wired\nfound a record he would love', 'one per line', 3, 'openerIdeas')}
            {A('Hard rules', 'hardRules', 'optional — one per line\nteases but never mean', 'optional, one per line', 2)}
          </>
        )}

        {show(2) && (
          <>
            <div className="bb-section">Photo pipeline</div>

            <label className="bb-field">
              <span className="bb-label">Appearance</span>
              <span className="bb-hint">pick or type — these compose her identity for you</span>
              <PhotoPickers onChange={onAppearance} />
            </label>

            {T('Identity', 'photoIdentity', 'anything the pickers don’t cover', 'optional — extra tokens, merged with the pickers above', 'photoIdentity')}
            {T('Outfit', 'photoOutfit', 'oversized band tee, headphones round neck', undefined, 'photoOutfit')}
            {T('Shot', 'photoShot', 'leaning on a DJ booth, neon backlight', undefined, 'photoShot')}

            <label className="bb-field">
              <span className="bb-label">Apparent age</span>
              <ApparentAge onChange={onApparentAge} />
            </label>

            <label className="bb-field">
              <span className="bb-label">Bust & body</span>
              <BodyShape onChange={onBody} />
            </label>

            <label className="bb-field">
              <span className="bb-label">Skin & detail</span>
              <SkinDetail onChange={onSkin} />
            </label>

            <div className="bb-readout">
              <div className="bb-readout-head">
                <span>Composed identity prompt</span>
                <span className="bb-readout-live">live</span>
              </div>
              <code>{spec.photo.identity || 'start picking above — her identity assembles here'}</code>
            </div>
          </>
        )}

        {show(3) && (
          <>
            <div className="bb-section">Meet her</div>
            <p className="bb-hint">
              She’s {comp.pct}% fleshed out. Generate a face on the right and pick your favourite — it saves as her
              reference so her photos stay on-face. Then Create her and say <code>/be {slug || '<slug>'}</code> in chat.
            </p>
          </>
        )}

        <div className="bb-actions">
          {guided && step > 0 && (
            <button className="bb-check" type="button" onClick={() => setStep(step - 1)}>
              ← Back
            </button>
          )}
          {guided && step < 3 ? (
            <button className="btn-primary" type="button" onClick={() => setStep(step + 1)}>
              {NEXT_LABELS[step]}
            </button>
          ) : (
            actionButtons
          )}
        </div>
      </div>

      <aside className="bb-preview">
        <SpecimenCard
          name={f.displayName}
          age={f.age}
          meta={cardMeta}
          relationship={f.relationship}
          tags={cardTags}
          accent={accent}
          pct={comp.pct}
          missing={comp.missing}
          contradictions={contradictions}
          accentName={activeArch?.accentName}
        />

        <BuilderRoster refreshKey={rosterKey} editingSlug={editing?.slug ?? null} onEdit={(s, h) => void startEdit(s, h)} />

        <div className="bb-section">Profile portrait</div>
        <div className="bb-portraits">
          <p className="bb-hint">
            Renders candidate faces from the Photo pipeline fields (below-left). Pick one and it's saved as her reference
            on Create, so her photos stay on-face. ~1 min per batch on the GPU.
          </p>
          <button className="bb-check" type="button" disabled={genning} onClick={() => void generatePortraits()}>
            {genning ? 'Rendering… (~1 min)' : portraits.length > 0 ? 'Generate more' : '📷 Generate portraits'}
          </button>
          {portraitNote && <div className={`bb-draft-note ${portraitNote.ok ? 'ok' : 'err'}`}>{portraitNote.text}</div>}
          {portraits.length > 0 && (
            <div className="bb-portrait-grid">
              {portraits.map((url) => (
                <div className="bb-portrait-wrap" key={url}>
                  <button
                    type="button"
                    className="bb-portrait-zoom"
                    title="Enlarge"
                    aria-label="Enlarge portrait"
                    onClick={() => setZoom(url)}
                  >
                    ⤢
                  </button>
                  <button
                    type="button"
                    className={`bb-portrait ${selectedPortrait === url ? 'sel' : ''}`}
                    onClick={() => setSelectedPortrait(selectedPortrait === url ? null : url)}
                    title="Use this face"
                  >
                    <img src={url} alt="candidate portrait" loading="lazy" />
                  </button>
                  {selectedPortrait === url && <span className="bb-selected-tag">✓ chosen</span>}
                </div>
              ))}
            </div>
          )}
          <p className="bb-hint">
            {selectedPortrait
              ? '✓ this face saves as her reference when you Create — hover any for ⤢ to enlarge.'
              : 'each is a different face for the same brief — click one to choose it, ⤢ to enlarge.'}
          </p>
        </div>

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

      <Lightbox src={zoom} alt="candidate portrait" onClose={() => setZoom(null)} />
    </div>
  )
}
