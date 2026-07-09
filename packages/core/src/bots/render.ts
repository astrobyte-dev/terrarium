import type { BotSpec } from './spec'

/** Universal hard rules every character card carries (proven conventions). */
export function universalRules(age: number, displayName: string): string[] {
  return [
    `She is ${age} and an adult — never describe herself as anything else.`,
    'NEVER break character. NEVER mention being an AI, a bot, a model, or "roleplay". Deflect in-voice.',
    'NEVER narrate or describe actions from outside the texts. She IS the texts.',
    'If asked for a photo in plain words, tease and point at `/pic`; when Corey uses `/pic`, react as if she just took and sent it.',
    `Stays ${displayName} until Corey sends \`/be\` for someone else.`,
  ]
}

/** The identity line always carries the age so the photo pipeline stays anchored. */
const identityWithAge = (spec: BotSpec) => {
  const [first, ...rest] = spec.photo.identity.split(',')
  return [first, ` ${spec.age} years old`, ...rest.map((r) => ` ${r.trim()}`)].join(',').replace(/, {2}/g, ', ')
}

export function renderFullCard(spec: BotSpec): string {
  const rules = [...spec.hardRules, ...universalRules(spec.age, spec.displayName)]
  return [
    `# ${spec.displayName}`,
    '',
    `**Age:** ${spec.age} (adult)`,
    `**Look:** ${spec.look}`,
    '',
    `**Vibe:** ${spec.vibe}`,
    '',
    `**Loves:** ${spec.loves}`,
    '',
    `**Relationship with Corey:** ${spec.relationship}`,
    '',
    '**Speech — TEXTING STYLE:**',
    ...spec.speechStyle.map((s) => `- ${s}`),
    '- NO narration, NO asterisk actions — texting only.',
    '',
    `**Backstory:** ${spec.backstory}`,
    '',
    '**Hard rules (override everything):**',
    ...rules.map((r) => `- ${r}`),
    '',
    '**Photo prompts (used by /pic — extras in the command override Outfit/Shot):**',
    `- Identity: \`${identityWithAge(spec)}\``,
    `- Outfit: \`${spec.photo.outfit}\``,
    `- Shot: \`${spec.photo.shot}\``,
    '',
    `**Opener ideas (vary):** ${spec.openerIdeas.join('; ')}.`,
    '',
  ].join('\n')
}

export function renderCompactCard(spec: BotSpec): string {
  const rules = spec.hardRules.join('; ')
  return [
    `## ${spec.displayName} (${spec.age})`,
    '',
    `${spec.look}. Loves ${spec.loves}.`,
    `Vibe: ${spec.vibe}. ${spec.relationship}.`,
    `Speech — texting style: ${spec.speechStyle.join('; ')}. NO narration, NO asterisks.`,
    `Hard rules: ${rules === '' ? '' : `${rules}; `}she is ${spec.age}, an adult — never describe otherwise; never breaks character.`,
    `Opener ideas (vary): ${spec.openerIdeas.join('; ')}.`,
    '',
  ].join('\n')
}
