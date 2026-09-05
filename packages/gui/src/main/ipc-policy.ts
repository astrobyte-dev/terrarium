type Check = (value: unknown) => boolean
const text = (max = 32_000): Check => (v) => typeof v === 'string' && v.length <= max && !v.includes('\0')
const number = (min: number, max: number): Check => (v) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
const bool: Check = (v) => typeof v === 'boolean'
const oneOf = (...values: string[]): Check => (v) => typeof v === 'string' && values.includes(v)
const optional = (check: Check): Check => (v) => v === undefined || check(v)
const strings: Check = (v) => Array.isArray(v) && v.length <= 200 && v.every(text(4000))
const shape = (fields: Record<string, Check>, partial = false): Check => (v) => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false
  const object = v as Record<string, unknown>
  return Object.keys(object).every((key) => Object.hasOwn(fields, key))
    && Object.entries(fields).every(([key, check]) => (partial && !Object.hasOwn(object, key)) || check(object[key]))
}

export const safeSlug: Check = (v) => typeof v === 'string' && /^[a-z0-9][a-z0-9-]{0,79}$/i.test(v)
  && !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(v)
const voice: Check = (v) => typeof v === 'string' && /^[a-z0-9_]{0,80}$/i.test(v)
const photo = shape({ identity: text(), outfit: text(), shot: text() })
const spec = shape({ slug: text(80), displayName: text(200), age: number(0, 1000), look: text(), vibe: text(),
  loves: text(), relationship: text(), backstory: text(), speechStyle: strings, hardRules: strings, openerIdeas: strings, photo })
const seed = shape({ displayName: text(200), age: number(0, 1000), concept: text(), mode: oneOf('sfw', 'nsfw'), spice: optional(number(0, 4)) })
const action = shape({ type: oneOf('start', 'stop', 'restart', 'restartAll', 'migrate', 'release'),
  id: optional(oneOf('gateway', 'ollama', 'comfyui', 'picDaemon', 'inference')), label: optional(text(200)) })

const checks: Record<string, Check[]> = {
  'chat:send': [shape({ id: (v) => text(200)(v) && typeof v === 'string' && v.length > 0, text: (v) => text()(v) && typeof v === 'string' && v.trim().length > 0 })],
  'characters:activate': [safeSlug], 'characters:get': [safeSlug], 'characters:deletePermanently': [safeSlug],
  'characters:remove': [text(500)], 'characters:update': [spec, safeSlug, text(500)],
  'bots:preview': [spec], 'bots:create': [spec], 'bots:draft': [seed],
  'bots:draftField': [seed, oneOf('look', 'vibe', 'loves', 'relationship', 'backstory', 'speechStyle', 'openerIdeas', 'photoIdentity', 'photoOutfit', 'photoShot')],
  'core:action': [action], 'brains:set': [text(500)], 'memory:save': [strings], 'memory:saveCharacter': [safeSlug, strings],
  'gen:set': [shape({ preset: oneOf('preview', 'balanced', 'quality', 'lightning'), faceLock: bool, feetFocus: bool, explicitDefault: bool, hdAuto: bool, detailers: bool, alwaysInclude: strings }, true)],
  'proactive:set': [shape({ enabled: bool, minIdleMinutes: number(1, 10080), cooldownMinutes: number(1, 10080), maxPerDay: number(0, 100), wakingStartHour: number(0, 23), wakingEndHour: number(0, 24) }, true)],
  'portraits:generate': [shape({ identity: text(), outfit: text(), shot: text(), look: optional(text()), extra: optional(text()) })],
  'portraits:saveRef': [safeSlug, (v) => typeof v === 'string' && /^terrarium:\/\/portraits\/[a-z0-9_-]+\.png$/i.test(v)],
  'portraits:regenerateArchetype': [safeSlug, text(), text()],
  'voice:setVoice': [safeSlug, voice], 'voice:preview': [voice], 'voice:say': [text(), optional(safeSlug)],
}
const noArguments = new Set(['core:getState', 'chat:connect', 'inbox:recent', 'gallery:list', 'brains:list', 'brains:probe',
  'characters:list', 'memory:list', 'doctor:report', 'doctor:repair', 'gen:get', 'proactive:get', 'voice:catalog',
  'window:minimize', 'window:hide', 'app:quit'])

export function validateIpcArguments(channel: string, args: unknown[]): void {
  const validators = checks[channel]
  const valid = noArguments.has(channel) ? args.length === 0
    : validators && args.length <= validators.length && validators.every((check, i) => check(args[i]))
  if (!valid) throw new Error(`Invalid request for ${channel}`)
}

export function isTrustedDocument(actual: string, expected: string): boolean {
  try {
    const a = new URL(actual), b = new URL(expected)
    a.hash = ''; b.hash = ''
    return a.href === b.href
  } catch { return false }
}
