/**
 * Headless first-run setup — the engine behind the TUI wizard, and the piece
 * proven on a clean VM. Shows the full-install plan; with --run it installs
 * Ollama, OpenClaw, and ComfyUI in order (idempotent, resumable) and pulls the
 * local fallback model. Secrets capture and migrate stay separate deliberate
 * steps (interactive / ownership switch). Read-only without --run.
 */
import { createSupervisor } from '../src/index'
import { createWindowsSystem } from '../src/system/windows'
import { componentInstallers } from '../src/install/registry'
import { summarizeInstallPlan, runInstallSequence } from '../src/install/orchestrator'
import { gatherOnboardingFacts, needsOnboarding, onboardingReason } from '../src/install/first-run'
import { pullModel, listLocalModels } from '../src/install/models'

const FALLBACK_MODEL = 'dolphin3:8b' // the local safety-net brain every config falls back to
const fmt = (mb: number) => (mb >= 1000 ? `${(mb / 1000).toFixed(1)} GB` : `${mb} MB`)

const system = createWindowsSystem()
const supervisor = createSupervisor(system)
const installers = componentInstallers(system)
const run = process.argv.includes('--run')

console.log('Terrarium setup\n')

const hw = await supervisor.detectSystem()
console.log(`Machine  ${hw.gpus[0]?.name ?? 'no NVIDIA GPU detected'} · ${Math.round(hw.ramMb / 1024)} GB RAM · ${Math.round(hw.freeDiskMbC / 1024)} GB free on C:`)
if (hw.gpus.length === 0) console.log('  note: no GPU — the photo pipeline (ComfyUI) installs but cannot render here.')

const facts = await gatherOnboardingFacts(installers, supervisor.secrets())
console.log(`\nState    ${onboardingReason(facts)}`)
console.log(`Wizard   ${needsOnboarding(facts) ? 'would run (blank slate)' : 'not needed (already set up)'}`)

const summary = summarizeInstallPlan(await Promise.all(installers.map((i) => i.plan())))
console.log(`\nInstall plan — ~${fmt(summary.totalDownloadMb)} download, ~${fmt(summary.totalDiskNeededMb)} disk:`)
for (const step of summary.steps) {
  console.log(`  ${step.needed ? '○' : '✓'} ${step.id.padEnd(9)} ${step.needed ? step.actions.join('; ') : 'already installed'}`)
  for (const b of step.blockers) console.log(`    ! ${b}`)
}
if (summary.blockers.length > 0) {
  console.log('\nBlockers must be cleared before install:')
  for (const b of summary.blockers) console.log(`  ! ${b}`)
}

if (!run) {
  console.log('\n(preview only — re-run with --run to install)')
  process.exit(0)
}

if (!summary.ready) {
  console.log('\nRefusing to install with unresolved blockers above.')
  process.exit(1)
}

console.log('\nInstalling…')
const results = await runInstallSequence(installers, {
  onProgress: (p) => process.stdout.write(`\r  ${p.component} ${p.phase}${p.percent === null ? '' : ` ${p.percent}%`}        `),
  onStep: (r) => console.log(`\r  ${r.status === 'failed' ? '✗' : '✓'} ${r.id.padEnd(9)} ${r.message}                    `),
})
const failed = results.filter((r) => r.status === 'failed')
if (failed.length > 0) {
  console.log(`\nInstall stopped — ${failed.map((f) => f.id).join(', ')} failed. Fix the cause and re-run (completed steps are skipped).`)
  process.exit(1)
}

console.log(`\nPulling the local fallback brain (${FALLBACK_MODEL})…`)
const existing = await listLocalModels()
if (existing.some((m) => m.name === FALLBACK_MODEL)) {
  console.log(`  ✓ ${FALLBACK_MODEL} already present`)
} else {
  const outcome = await pullModel(FALLBACK_MODEL, (p) =>
    process.stdout.write(`\r  ${p.phase}${p.percent === null ? '' : ` ${p.percent}%`}        `),
  )
  console.log(`\r  ${outcome.ok ? '✓' : '✗'} ${outcome.message}                    `)
}

console.log('\nCore stack installed. Next:')
console.log('  1. npm run capture-secrets   (bot token + provider keys)')
console.log('  2. npm run assemble-comfyui  (photo pipeline models — big; needs a GPU to render)')
console.log('  3. start Terrarium and press m to migrate (take ownership)')
process.exit(0)
