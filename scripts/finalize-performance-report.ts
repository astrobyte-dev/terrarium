import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { performanceDir } from '../packages/core/src/inference/settings'
const old = 'docs/performance-tuning.md', archive = 'docs/performance-audit-2026-09-05.md'
if (!existsSync(archive)) copyFileSync(old, archive)
writeFileSync(old, '# Chat and image performance\n\nThe audit has been implemented and tested. See the [upgrade results, measurements, controls, and rollback notes](performance-results-2026-09-06.md).\n\nThe [original read-only audit](performance-audit-2026-09-05.md) is preserved for comparison.\n')
const dir = join(performanceDir(), 'benchmarks')
const result: Record<string, unknown> = {}
for (const name of ['baseline', 'local', 'hosted', 'gateway', 'model-sources']) {
  const file = join(dir, name + '.json')
  if (existsSync(file)) result[name] = JSON.parse(readFileSync(file, 'utf8'))
}
result.images = JSON.parse(readFileSync(join(dir, 'images/results.json'), 'utf8'))
writeFileSync('docs/performance-benchmarks.json', JSON.stringify(result, null, 2))
console.log('Report index and neutral benchmark evidence saved.')
