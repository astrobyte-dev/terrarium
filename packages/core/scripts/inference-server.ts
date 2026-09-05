import { createDpapiSecretStore, SECRET_NAMES } from '../src/secrets/store'
import { createWindowsSystem } from '../src/system/windows'
import { createInferenceProxy } from '../src/inference/proxy'
import { externalTrainingActive } from '../src/inference/external-gpu'

async function main() {
  const store = createDpapiSecretStore(createWindowsSystem())
  const broker = createInferenceProxy({ externalGpuBusy: externalTrainingActive, credentials: {
    venice: await store.get(SECRET_NAMES.veniceApiKey), arliai: await store.get(SECRET_NAMES.arliaiApiKey),
  } })
  await broker.listen()
  console.log('Terrarium inference coordinator listening on loopback port 18790')
  const stop = () => { void broker.close().finally(() => process.exit(0)) }
  process.on('SIGINT', stop); process.on('SIGTERM', stop)
}
main().catch(() => { console.error('Inference coordinator failed to start. Check encrypted store and port 18790.'); process.exitCode = 1 })
