/**
 * Component picker's data source, as a report: what is installed, what an
 * install would involve, and which local models exist. Read-only.
 */
import { componentInstallers } from '../src/install/registry'
import { listLocalModels } from '../src/install/models'
import { createWindowsSystem } from '../src/system/windows'

const system = createWindowsSystem()
console.log('Terrarium install status\n')

for (const installer of componentInstallers(system)) {
  const plan = await installer.plan()
  if (plan.installed !== null && plan.actions.length === 0) {
    const v = plan.installed.version === null ? '' : ` v${plan.installed.version}`
    console.log(`✓ ${plan.id.padEnd(9)} installed${v} — ${plan.installed.path}`)
    continue
  }
  const fmt = (mb: number) => (mb >= 1000 ? `${Math.round(mb / 1000)} GB` : `${mb} MB`)
  console.log(`○ ${plan.id.padEnd(9)} needs install — ~${fmt(plan.downloadMb)} download, ~${fmt(plan.diskNeededMb)} disk`)
  for (const action of plan.actions) console.log(`    · ${action}`)
  for (const blocker of plan.blockers) console.log(`    ! ${blocker}`)
}

console.log(`\nDisk free C: ${Math.round((await system.freeDiskMb('C:')) / 1024)} GB`)

const models = await listLocalModels()
console.log(`\nLocal Ollama models (${models.length}):`)
for (const m of models) console.log(`  ${m.name.padEnd(42)} ${(m.sizeMb / 1024).toFixed(1)} GB`)
process.exit(0)
