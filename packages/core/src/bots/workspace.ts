import type { SystemPort } from '../system/system-port'
import { validateBotSpec, type BotSpec } from './spec'
import { renderCompactCard, renderFullCard } from './render'
import { insertCompactCard, planInsert, type InsertPlan } from './agents-file'
import { removeCard } from './roster'

export interface CreateBotResult {
  ok: boolean
  errors: string[]
  plan: InsertPlan | null
  fullCardPath: string | null
  wrote: boolean
  backupPath: string | null
}

export interface CreateBotOptions {
  system: SystemPort
  spec: BotSpec
  /** Default true: report what would happen, write nothing. */
  dryRun?: boolean
  workspaceDir?: string
}

/**
 * Materialize a character: full card in characters/<slug>.md, compact card
 * inserted into AGENTS.md — but only when the 12k budget allows, and never
 * without an AGENTS.md backup.
 */
export async function createBot(opts: CreateBotOptions): Promise<CreateBotResult> {
  const { system, spec } = opts
  const dryRun = opts.dryRun !== false
  const workspace = opts.workspaceDir ?? `${system.env('USERPROFILE') ?? ''}\\.openclaw\\workspace`
  const fullCardPath = `${workspace}\\characters\\${spec.slug}.md`
  const agentsPath = `${workspace}\\AGENTS.md`
  const fail = (errors: string[], plan: InsertPlan | null = null): CreateBotResult => ({
    ok: false, errors, plan, fullCardPath: null, wrote: false, backupPath: null,
  })

  const errors = validateBotSpec(spec)
  if (errors.length > 0) return fail(errors)
  if (await system.fileExists(fullCardPath)) {
    return fail([`character "${spec.slug}" already exists (${fullCardPath}) — refusing to overwrite`])
  }

  const agentsMd = await system.readTextFile(agentsPath)
  const compact = renderCompactCard(spec)
  const plan = planInsert(agentsMd, compact)
  if (!plan.fits) {
    return fail(
      [
        `compact card (${plan.cardChars} chars) does not fit AGENTS.md: ${plan.currentChars} chars used, ` +
          `${plan.headroom} available under the 12k truncation limit. Trim existing compact cards first.`,
      ],
      plan,
    )
  }
  if (dryRun) {
    return { ok: true, errors: [], plan, fullCardPath, wrote: false, backupPath: null }
  }

  const stamp = new Date(system.now()).toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-')
  const backupPath = `${agentsPath}.bak.terrarium-${stamp}`
  await system.writeTextFile(backupPath, agentsMd)
  await system.writeTextFile(fullCardPath, renderFullCard(spec))
  await system.writeTextFile(agentsPath, insertCompactCard(agentsMd, compact))
  return { ok: true, errors: [], plan, fullCardPath, wrote: true, backupPath }
}

export interface UpdateBotOptions extends CreateBotOptions {
  /** The slug/file to edit in place — kept even if the display name changes. */
  originalSlug: string
  /** The existing compact-card heading in AGENTS.md, so it can be swapped out. */
  originalHeading: string
}

/**
 * Overwrite an existing character: rewrite characters/<originalSlug>.md and swap its
 * compact card in AGENTS.md (old heading out, new card in) — budget re-checked against
 * the file WITHOUT the old card, always backed up first. The slug/file stays fixed so
 * a rename never orphans the card or the face reference.
 */
export async function updateBot(opts: UpdateBotOptions): Promise<CreateBotResult> {
  const { system, spec, originalSlug, originalHeading } = opts
  const dryRun = opts.dryRun !== false
  const workspace = opts.workspaceDir ?? `${system.env('USERPROFILE') ?? ''}\\.openclaw\\workspace`
  const fullCardPath = `${workspace}\\characters\\${originalSlug}.md`
  const agentsPath = `${workspace}\\AGENTS.md`
  const fail = (errors: string[], plan: InsertPlan | null = null): CreateBotResult => ({
    ok: false, errors, plan, fullCardPath: null, wrote: false, backupPath: null,
  })

  const errors = validateBotSpec({ ...spec, slug: originalSlug })
  if (errors.length > 0) return fail(errors)

  const agentsMd = await system.readTextFile(agentsPath)
  const without = removeCard(agentsMd, originalHeading)
  const compact = renderCompactCard(spec)
  const plan = planInsert(without, compact)
  if (!plan.fits) {
    return fail(
      [
        `updated compact card (${plan.cardChars} chars) does not fit AGENTS.md: ${plan.currentChars} chars used ` +
          `after removing the old one, ${plan.headroom} available under the 12k limit.`,
      ],
      plan,
    )
  }
  if (dryRun) return { ok: true, errors: [], plan, fullCardPath, wrote: false, backupPath: null }

  const stamp = new Date(system.now()).toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-')
  const backupPath = `${agentsPath}.bak.terrarium-${stamp}`
  await system.writeTextFile(backupPath, agentsMd)
  await system.writeTextFile(fullCardPath, renderFullCard({ ...spec, slug: originalSlug }))
  await system.writeTextFile(agentsPath, insertCompactCard(without, compact))
  return { ok: true, errors: [], plan, fullCardPath, wrote: true, backupPath }
}
