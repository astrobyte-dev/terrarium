/** Pull an Ollama model with live progress: npm run pull-model -- <name> */
import { pullModel } from '../src/install/models'

const name = process.argv[2]
if (name === undefined) {
  console.error('usage: npm run pull-model -- <model:tag>')
  process.exit(1)
}
let lastLine = ''
const outcome = await pullModel(name, (p) => {
  const line = p.percent === null ? p.phase : `${p.phase} ${p.percent}%`
  if (line !== lastLine) console.log(`  ${line}`)
  lastLine = line
})
console.log(outcome.ok ? `OK: ${outcome.message}` : `FAIL: ${outcome.message}`)
process.exit(outcome.ok ? 0 : 1)
