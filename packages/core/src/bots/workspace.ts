import type { SystemPort } from '../system/system-port'
import { validateBotSpec, type BotSpec } from './spec'
import { renderCompactCard, renderFullCard } from './render'
import { insertCompactCard, planInsert, type InsertPlan } from './agents-file'

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
