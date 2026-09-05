import { build } from 'esbuild'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { performanceDir } from '../packages/core/src/inference/settings'
import { createDpapiSecretStore, SECRET_NAMES } from '../packages/core/src/secrets/store'
import { createWindowsSystem } from '../packages/core/src/system/windows'
import { VENICE_MODELS } from '../packages/core/src/inference/venice'
import { OLLAMA_MODELS } from '../packages/core/src/config/provider-models'

const root = resolve(import.meta.dirname, '..')
const data = performanceDir()
const runtime = join(data, 'runtime')
const workspace = join(homedir(), '.openclaw', 'workspace')
const daemon = join(workspace, 'skills', 'comfyui-imagegen')
const backup = join(data, 'performance-backups', new Date().toISOString().replace(/[:.]/g, '-'))
mkdirSync(runtime, { recursive: true }); mkdirSync(backup, { recursive: true })
const changes: { path: string; text: string }[] = []
const original = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
const replaceOnce = (text: string, from: string, to: string) => {
  if (!text.includes(from) || text.indexOf(from) !== text.lastIndexOf(from)) throw new Error('Installed daemon differs from expected source; no live source has been changed')
  return text.replace(from, to)
}
const generateFile = join(daemon, 'generate.py')
const daemonFile = join(daemon, 'pic_daemon.py')
const visionFile = join(daemon, 'vision.py')
if (existsSync(visionFile)) {
  let vision = original(visionFile)
  if (!vision.includes('# terrarium-performance-v1')) {
    vision = replaceOnce(vision, 'OLLAMA = "http://127.0.0.1:11434"', '# terrarium-performance-v1\nOLLAMA = "http://127.0.0.1:18790/ollama"')
    vision = replaceOnce(vision, 'VISION_MODEL = "qwen2.5vl:7b"', 'VISION_MODEL = "qwen2.5vl:3b"')
    vision = replaceOnce(vision, '"images": [b64], "stream": False}', '"images": [b64], "stream": False, "keep_alive": "20s",\n               "options": {"num_ctx": 4096, "num_predict": 256}}')
    changes.push({ path: visionFile, text: vision })
  }
}
let generate = original(generateFile), pic = original(daemonFile)
if (!generate.includes('# terrarium-performance-v1')) {
  generate = replaceOnce(generate, 'if __name__ == "__main__":', '# terrarium-performance-v1\nfrom terrarium_performance import configure_generate\nconfigure_generate(sys.modules[__name__])\n\nif __name__ == "__main__":')
  const renderEnd = generate.indexOf('\ndef download(')
  const renderSource = generate.slice(0, renderEnd)
  generate = replaceOnce(renderSource, '                    return img', '                    img["seed"] = seed\n                    return img') + generate.slice(renderEnd)
  changes.push({ path: generateFile, text: generate })
}
if (!pic.includes('# terrarium-performance-v1')) {
  pic = replaceOnce(pic, 'if __name__ == "__main__":', '# terrarium-performance-v1\nfrom terrarium_performance import install as install_performance\ninstall_performance(globals())\n\nif __name__ == "__main__":')
  pic = replaceOnce(pic, '    use_noob = bool(extras and NOOB_RE.search(extras))', `    scene = scene_for(name)
    if scene and not strict:
        extras = ", ".join([str(v) for v in scene.values()] + [extras])
    use_noob = bool(extras and NOOB_RE.search(extras))`)
  const start = pic.indexOf('    paths = []\n    for _ in range(count):', pic.indexOf('def handle_pic('))
  const end = pic.indexOf('\n\ndef ', start)
  if (start < 0 || end < 0) throw new Error('Cannot locate installed photo delivery block')
  const delivery = `    paths = []
    manifests = []
    started = time.monotonic()
    for _ in range(count):
        img = generate.generate(prompt, character=name, anime=anime, anime_ckpt=anime_ckpt,
                                face_lock=face_lock, detailers=detailers)
        path = generate.download(img)
        params = {"anime": anime, "noob": use_noob, "strict": strict, "count": count,
                  "seed": img.get("seed"), "preset": settings.get("preset", "balanced"), "scene": scene}
        # Publish each finished base image before any optional work or external delivery.
        manifests.append(mirror_to_inbox([path], None, name, prompt, params,
                                        command=state.get("last_pic_text")))
        performance_metric("first-image" if len(paths) == 0 else "next-image",
                           totalMs=round((time.monotonic() - started) * 1000))
        if hd_auto and settings.get("preset") != "preview":
            try:
                path = generate.download(generate.upscale(path))
                manifests.append(mirror_to_inbox([path], None, name, prompt, dict(params, hd=True),
                                                command=state.get("last_pic_text")))
            except Exception:
                log("Optional upscale failed; base image already delivered locally")
        paths.append(path)
    state["last_image"] = str(paths[-1])
    state["last_image_anime"] = anime
    caption = character_caption(name, prompt)
    for manifest in manifests:
        update_caption(manifest, caption)
    try:
        if len(paths) == 1:
            generate.send_telegram(paths[0], chat_id, caption)
        else:
            generate.send_telegram_album(paths, chat_id, caption)
    except Exception:
        from terrarium_performance import queue_delivery
        queue_delivery(paths, chat_id, caption)
        log("Telegram delivery failed; image remains available in Terrarium and retry is queued")
    performance_metric("image-job-complete", totalMs=round((time.monotonic() - started) * 1000))
`
  pic = pic.slice(0, start) + delivery + pic.slice(end)
  // The retry loop is rate-limited by the adapter and never rerenders a photo.
  pic = replaceOnce(pic, '        time.sleep(0.5)', '        from terrarium_performance import retry_delivery\n        retry_delivery(generate)\n        time.sleep(0.5)')
  changes.push({ path: daemonFile, text: pic })
}

const stagedServer = join(backup, 'candidate-inference-server.cjs')
await build({ entryPoints: [join(root, 'packages/core/scripts/inference-server.ts')], outfile: stagedServer, bundle: true, platform: 'node', format: 'cjs', target: 'node22' })
changes.push({ path: join(runtime, 'inference-server.cjs'), text: original(stagedServer) })
changes.push({ path: join(daemon, 'terrarium_performance.py'), text: original(join(root, 'packages/core/assets/performance/terrarium_performance.py')) })
const configFile = join(homedir(), '.openclaw', 'openclaw.json')
const cfg = JSON.parse(original(configFile))
const candidate = OLLAMA_MODELS.find(model => model.id === 'huihui_ai/qwen3.5-abliterated:9b')!
if (!cfg.models.providers.ollama.models.some((m: { id: string }) => m.id === candidate.id)) cfg.models.providers.ollama.models.push(candidate)
for (const model of cfg.models.providers.ollama.models) {
  if (model.id === 'dolphin3:8b' || /qwen3.*abliterated/.test(model.id)) {
    model.contextWindow = 16384; model.params = { ...model.params, num_ctx: 16384 }
  }
}
const venice = await createDpapiSecretStore(createWindowsSystem()).get(SECRET_NAMES.veniceApiKey)
if (!venice) throw new Error('Store the Venice key before installing this profile')
cfg.models.providers.venice = { baseUrl: 'http://127.0.0.1:18790/chat/venice/v1', api: 'openai-completions',
  apiKey: 'terrarium-coordinator', timeoutSeconds: 120, models: VENICE_MODELS }
for (const name of ['ollama', 'arliai']) {
  if (!cfg.models.providers[name]) continue
  cfg.models.providers[name].baseUrl = `http://127.0.0.1:18790/chat/${name}${name === 'ollama' ? '' : '/v1'}`
  if (name === 'arliai') cfg.models.providers[name].apiKey = 'terrarium-coordinator'
}
// Keep the existing primary until the provider comparison establishes the better choice.
changes.push({ path: configFile, text: JSON.stringify(cfg, null, 2) })
// OpenClaw may retain explicit endpoints in its per-agent model registry.
const agentModels = join(homedir(), '.openclaw', 'agents', 'main', 'agent', 'models.json')
if (existsSync(agentModels)) {
  const cached = JSON.parse(original(agentModels))
  cached.providers ??= {}
  for (const name of ['ollama', 'arliai', 'venice']) {
    if (!cfg.models.providers[name]) continue
    cached.providers[name] = { ...cfg.models.providers[name], ...cached.providers[name],
      baseUrl: cfg.models.providers[name].baseUrl, apiKey: cfg.models.providers[name].apiKey }
    if (name === 'venice' || name === 'ollama') cached.providers[name].models = cfg.models.providers[name].models
  }
  changes.push({ path: agentModels, text: JSON.stringify(cached, null, 2) })
}
const profile = join(data, 'performance.json')
if (!existsSync(profile)) changes.push({ path: profile, text: JSON.stringify({ enabled: true, compactPrompt: true, localContext: 16384, veniceBudgetUsd: 1 }, null, 2) })
const genFile = join(data, 'gen_settings.json')
const gen = existsSync(genFile) ? JSON.parse(original(genFile)) : {}
changes.push({ path: genFile, text: JSON.stringify({ ...gen,
  alwaysInclude: (gen.alwaysInclude ?? []).filter((term: string) => !/adolescent|underdeveloped proportions/i.test(term)),
  preset: gen.preset ?? 'balanced', hdAuto: gen.hdAuto ?? false }, null, 2) })
const manifest: { target: string; backup: string | null }[] = []
for (const [i, change] of changes.entries()) {
  const saved = existsSync(change.path) ? join(backup, `${i}-${change.path.split(/[\\/]/).pop()}`) : null
  if (saved) copyFileSync(change.path, saved)
  manifest.push({ target: change.path, backup: saved })
}
writeFileSync(join(backup, 'manifest.json'), JSON.stringify(manifest, null, 2))
for (const change of changes) writeFileSync(change.path, change.text)
console.log(`Installed performance profile; backups: ${backup}`)
console.log('Start coordinator before restarting the gateway. Live services were not restarted by this command.')
