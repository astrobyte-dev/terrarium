/**
 * Read-only smoke pass against this machine: detect hardware/installs,
 * compute live health once, then tail logs for a few seconds. Touches nothing.
 */
import { createSupervisor } from '../src/index'

const sup = createSupervisor()

console.log('Terrarium smoke — read-only pass\n')

const report = await sup.detectSystem()
for (const gpu of report.gpus) console.log(`GPU   ${gpu.name} — ${gpu.vramMb} MB VRAM`)
console.log(`RAM   ${Math.round(report.ramMb / 1024)} GB`)
console.log(`Disk  C: ${Math.round(report.freeDiskMbC / 1024)} GB free`)
for (const a of report.autostart) console.log(`Auto  [${a.kind}] ${a.name} — ${a.state}`)

console.log('')
await sup.refresh()
for (const s of sup.statuses()) {
  const version = s.install?.version === null || s.install === null ? '' : ` v${s.install.version}`
  const pid = s.process === null ? '' : ` (pid ${s.process.pid})`
  console.log(`${s.health.toUpperCase().padEnd(14)}${s.name}${version}${pid} — ${s.detail}`)
}

console.log('\nTailing logs for 8 s (send the bot a message to see gateway lines)…')
sup.on('log', (e) => {
  const t = new Date(e.ts).toLocaleTimeString()
  console.log(`  [${t}] ${e.service.padEnd(9)} ${e.level.padEnd(5)} ${e.line.slice(0, 130)}`)
})

const until = Date.now() + 8000
while (Date.now() < until) {
  await sup.pollLogs()
  await new Promise((resolve) => setTimeout(resolve, 1000))
}
console.log('\nSmoke pass complete — nothing was modified.')
