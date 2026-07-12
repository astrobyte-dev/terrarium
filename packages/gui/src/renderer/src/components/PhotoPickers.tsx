import { useEffect, useState } from 'react'

// Structured appearance pickers that compose the photo Identity for you (portraits +
// /pic). Same emit-a-phrase contract as ApparentAge / BodyShape / SkinDetail — the
// composed string is joined into the identity by the builder. Each control is a
// combo-box (native datalist): pick a suggestion OR type your own, so the lists are a
// starting point, never a ceiling. A well-formed identity string is the single biggest
// lever on portrait quality, so this replaces guessing at free text.

export interface PhotoPickerValues {
  ethnicity: string
  skinTone: string
  hairColour: string
  hairStyle: string
  eyes: string
  feature: string
}

const EMPTY: PhotoPickerValues = { ethnicity: '', skinTone: '', hairColour: '', hairStyle: '', eyes: '', feature: '' }

const OPTS: Record<keyof PhotoPickerValues, string[]> = {
  ethnicity: ['latina', 'east asian', 'southeast asian', 'south asian', 'black', 'east african', 'north african', 'middle eastern', 'white', 'mediterranean', 'central asian', 'indigenous / native american', 'pacific islander', 'caribbean', 'mixed-race'],
  skinTone: ['porcelain', 'fair', 'cool ivory', 'olive', 'golden', 'warm tan', 'sun-kissed', 'deep bronze', 'deep ebony'],
  hairColour: ['auburn', 'jet black', 'raven black', 'dark brown', 'chestnut brown', 'caramel brown', 'ash brown', 'copper red', 'strawberry blonde', 'honey blonde', 'platinum blonde', 'dirty blonde', 'silver / grey', 'burgundy', 'pastel pink', 'icy blue'],
  hairStyle: ['long waves', 'long straight', 'shoulder-length', 'sleek bob', 'blunt bob', 'pixie crop', 'curly afro', 'tight coils', 'box braids', 'cornrows', 'dreadlocks', 'high ponytail', 'messy bun', 'space buns', 'undercut', 'hime cut'],
  eyes: ['green', 'hazel', 'dark brown', 'light brown', 'amber', 'grey', 'blue', 'steel blue', 'heterochromia'],
  feature: ['dimpled smile', 'sharp cheekbones', 'soft round face', 'freckled nose', 'beauty mark', 'full lips', 'almond eyes', 'strong brows'],
}

/** Compose the descriptive appearance phrase. Pure + exported for reuse/testing. */
export function composePhotoPhrase(v: PhotoPickerValues): string {
  const t = (s: string) => s.trim()
  const parts: string[] = []
  if (t(v.ethnicity)) parts.push(t(v.ethnicity))
  if (t(v.skinTone)) parts.push(`${t(v.skinTone)} skin`)
  const hair = [t(v.hairColour), t(v.hairStyle)].filter(Boolean).join(' ')
  if (hair) parts.push(`${hair} hair`)
  if (t(v.eyes)) parts.push(`${t(v.eyes)} eyes`)
  if (t(v.feature)) parts.push(t(v.feature))
  return parts.join(', ')
}

const FIELDS: { key: keyof PhotoPickerValues; label: string; placeholder: string }[] = [
  { key: 'ethnicity', label: 'Ethnicity', placeholder: 'latina' },
  { key: 'skinTone', label: 'Skin tone', placeholder: 'warm tan' },
  { key: 'hairColour', label: 'Hair colour', placeholder: 'auburn' },
  { key: 'hairStyle', label: 'Hair length & style', placeholder: 'long waves' },
  { key: 'eyes', label: 'Eyes', placeholder: 'green' },
  { key: 'feature', label: 'Notable feature', placeholder: 'beauty mark' },
]

/** Emits the composed appearance phrase up whenever any picker changes. */
export function PhotoPickers({ onChange }: { onChange: (phrase: string) => void }) {
  const [v, setV] = useState<PhotoPickerValues>(EMPTY)

  useEffect(() => {
    onChange(composePhotoPhrase(v))
  }, [v, onChange])

  const set = (k: keyof PhotoPickerValues) => (e: { target: { value: string } }) =>
    setV((prev) => ({ ...prev, [k]: e.target.value }))

  return (
    <div className="bb-pick-grid">
      {FIELDS.map((f) => (
        <label className="bb-pick" key={f.key}>
          <span>{f.label}</span>
          <input
            list={`pick-${f.key}`}
            value={v[f.key]}
            onChange={set(f.key)}
            placeholder={f.placeholder}
            autoComplete="off"
          />
          <datalist id={`pick-${f.key}`}>
            {OPTS[f.key].map((o) => (
              <option value={o} key={o} />
            ))}
          </datalist>
        </label>
      ))}
    </div>
  )
}
