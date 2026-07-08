/** Live read-only proof: connect the real chat client and print recent history. */
import { createChatClient } from '../src/chat/client'
import { createWindowsSystem } from '../src/system/windows'

const client = createChatClient({ system: createWindowsSystem() })
client.on('status', (s, d) => console.log(`[${s}] ${d}`))
await client.connect()
const messages = await client.history(6)
console.log(`\n${messages.length} recent messages in the shared session:\n`)
for (const m of messages) {
  console.log(`${m.role === 'user' ? 'you ' : 'bot '} ${m.text.replace(/\s+/g, ' ').slice(0, 100)}`)
}
client.close()
process.exit(0)
