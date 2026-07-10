# Terrarium — decisions log

## 2026-07-07 — project locked in (Corey, via Q&A)

1. **Tray app owns everything.** Terrarium spawns and owns all services
   (piped stdio, hidden windows). Closing the window minimizes to tray;
   services stop only on explicit Quit. Core is designed so a detached
   background-service mode can be added later without rewrite.
2. **This is the companion product**, not a general OpenClaw launcher.
   Companion personas and the photo pipeline are first-class. Brains are
   three doors: local uncensored model / hosted OpenAI-compatible endpoint
   (ArliAI-style, what production uses) / Claude API (smartest, labeled
   honestly as refusing explicit content).
3. **Adopt early, migrate when stable.** M1 runs read-only against the live
   system. Ownership migration is a deliberate switch; `migrate()` and
   `release()` are symmetric so the bot can be handed back to the scheduled
   tasks between dev sessions.
4. **Windows + NVIDIA only for v1.** Core keeps OS-agnostic interfaces
   (`SystemPort` seam); other platforms get an honest "not yet supported".

Name: **Terrarium** (Corey's pick over Hearth).

## Technical decisions

- **npm workspaces, not pnpm.** Zero extra tooling (npm 11 is installed);
  pnpm's symlinked node_modules interacts badly with OneDrive, where this
  repo lives. Boundary rule (core must not import UI libs) is enforced by
  core having no such dependencies and a boundary unit test.
- **Core has zero runtime dependencies in M1.** Node built-ins only.
  Typed EventEmitter over RxJS — Node-native, bridges to Electron IPC later.
- **Packages ship TS source, run via tsx** (no build step) until a packaging
  milestone; `moduleResolution: bundler`, `noEmit`.
- **Status is always re-detected, never remembered.** The manifest (M3) will
  store intent and keychain references only. It lives in
  `%LOCALAPPDATA%\Terrarium`, deliberately outside OneDrive.
- **Health is a ladder, not a boolean**: `not-installed → stopped → starting
  → port-open → live`, with `quiet`/`wedged` for the proven
  port-200-while-hung failure mode (gateway once sat wedged 16 h with HTTP
  200). Gateway liveness = port + log freshness (quiet 15 min, wedged 60 min;
  tune with observation). `crashed` arrives in M2 when we own processes.
- **Log freshness via file mtime**, not parsed timestamps — robust and cheap.
- **Read-only M1 log sources**, sampled from the live machine 2026-07-07:
  - Gateway: newest `%LOCALAPPDATA%\Temp\openclaw\openclaw-*.log`; JSONL with
    `_meta.date` (UTC ISO), `_meta.logLevelName`, clean `message` field.
  - Pic daemon: `...\skills\comfyui-imagegen\daemon.log`; plain
    `YYYY-MM-DD HH:mm:ss  text` (local time, two spaces).
  - Ollama: `%LOCALAPPDATA%\Ollama\server.log` (rotates to `server-N.log`;
    current is always `server.log`). Plain text.
  - **ComfyUI writes no log file** — port-only health until M2 pipes its
    stdout. Verified: no `C:\ComfyUI\user\comfyui.log`.
- ComfyUI process match is `python*` + `main.py` + `8188` — its command line
  does not contain the string "ComfyUI" (cwd-relative `main.py` launch).

## M2 — owning the processes (2026-07-07)

- **Windows has no graceful kill for hidden console-less children**
  (`CREATE_NO_WINDOW` ⇒ no Ctrl events), so stop = `taskkill /T /F` + wait for
  exit. The gateway-specific safety is *pacing*, not signals: 5 s restart
  cooldown, and never auto-rapid-restarting (rapid kills mid-reply poisoned
  sessions historically).
- **Start tiers**: 0 = Ollama + ComfyUI (parallel), 1 = gateway, 2 = pic
  daemon. Stop is the exact reverse. Ready gates: port answering (or, for the
  portless daemon, staying alive `readySettleMs`).
- **Stray policy per service**: `adopt` for Ollama/ComfyUI (a healthy stray on
  the port is fine — e.g. the Ollama tray app after reboot), `strict` for
  gateway/daemon (duplicates double-reply / double-send). `start()` refuses on
  a strict stray and says to migrate.
- **Crash backoff**: 2 s → 5 s → 15 s → 60 s, counter resets after 10 min
  stable. Owned state overlays detected health (`backoff` ⇒ `crashed` rung).
- **migrate()/release() are symmetric and ledger-backed**
  (`%LOCALAPPDATA%\Terrarium\ownership.json`). Migrate: stop+disable the three
  OpenClaw tasks (watchdog first-class — it would resurrect what we stop),
  **move** Startup-folder launchers to `%LOCALAPPDATA%\Terrarium\startup-disabled`,
  kill strays dependents-first, write ledger, `startAll()`. Release: `stopAll()`,
  sweep orphans (crash recovery), move the launchers back, re-enable **and start**
  the tasks (starting the watchdog revives Ollama/ComfyUI immediately).
  - **Moving out beats renaming in place.** Until 2026-07-10 migrate renamed
    launchers to `*.terrarium-disabled` and left them in Startup. Windows
    shell-executes *every* file in that folder whatever the extension, so each
    one raised an "open this file with?" dialog at logon — and a failed release
    stranded them there for good (the restore was wrapped in `safe()`). Migrate
    now sweeps any such stray, and a failed restore only leaves the launcher
    parked (inert) and throws instead of losing it silently.
- **The daemon runs as `python.exe` (not `pythonw`) when owned** — hidden
  window + piped stdout feeds the log pane; `PYTHONUNBUFFERED=1`.
- **We spawn the gateway with `TMPDIR=%LOCALAPPDATA%\Temp`** so its JSONL log
  stays where the tailer watches (gateway.cmd parity); env-var secret
  injection lands here in M3.
- **TUI quit stops owned services** (with confirm) — tray semantics arrive
  with Electron; until then `g` (release) hands the bot back to the scheduled
  tasks between sessions, and `npm run release` is the no-TUI emergency
  hand-back (kills orphans, re-enables tasks).

## M3 — config + secrets (2026-07-07)

- **Secrets live in a DPAPI store** (`%LOCALAPPDATA%\Terrarium\secrets.json`,
  blobs bound to this Windows user+machine), encrypted/decrypted via
  PowerShell `ConvertFrom/To-SecureString`. Values travel exclusively through
  child-process **env vars** — never command lines, never files. Zero new
  dependencies; the `SecretStore` interface allows a native keyring later.
- **openclaw.json is generated, not hand-edited** (decision 5). The template
  transcribes the proven live config; parity was verified live — generated
  inline config was *identical* to the hand-evolved file. Every write rotates
  a `*.bak.terrarium-<stamp>` backup (keep 5).
- **Two secret modes, flipped at the ownership boundary**: `migrate()` writes
  the env-refs config (provider keys as `{source:"env"}` SecretRefs — support
  confirmed in OpenClaw's `model-auth` code — and no `botToken`; the gateway
  gets `TELEGRAM_BOT_TOKEN` / `ARLIAI_API_KEY` / `OLLAMA_API_KEY` injected at
  spawn). `release()` restores inline secrets, because the task launchers set
  no env. Config-at-rest is secretless whenever Terrarium owns the stack; task
  mode equals today's status quo. A failed rewrite during release still
  restores the tasks, then surfaces the error.
- **pic_daemon/generate.py patched env-first**: `_token()` prefers
  `TELEGRAM_BOT_TOKEN`, falls back to config, and fails loudly if neither
  (backups: `*.bak.terrarium-m3`).
- **Bot identity via getMe** shown in the TUI header ("bot: Ella
  (@Harry_the_hbot)") — the wrong-bot trap, made visible.
- **PowerShell 5.1 emits cp1252**; `runPowerShell` forces
  `[Console]::OutputEncoding` to UTF-8 globally (caught by the DPAPI
  round-trip test with non-ASCII).
- Pairing requests: gateway log lines matching /pairing/ surface a hint with
  the approve command. The full approve-flow waits until a real pairing event
  shows us the exact log format.

## M4a — installers, part one (2026-07-07)

- **Installer contract**: `plan()` (detect + human-readable actions + honest
  download/disk sizes + blockers, never swallowed) → `install(onProgress)` →
  `verify()`. Everything idempotent; plans are the component picker's data.
- **OpenClaw is pinned by owning the install**: `openclaw@2026.6.11` npm-installed
  into `%LOCALAPPDATA%\Terrarium\runtime` (~86 MB). Gateway definitions prefer
  the pinned copy (`mode: managed`) over the driftable global npm copy
  (`adopted`); spawn uses the pinned dist when present. Live-proven: installed,
  verified, second run no-ops.
- **Models install through Ollama's own streaming API** (`POST /api/pull`) —
  Ollama does download/resume/verify; we surface per-layer percent progress.
  Live-proven idempotent on dolphin3:8b. `npm run pull-model -- <name>`.
- **Ollama installs via winget** (silent, agreements accepted); winget absence
  is a plan blocker with a manual-download pointer, not a crash.
- **ComfyUI is plan-only this milestone** (detect + ~18.5 GB action list +
  explicit execution blocker). Its installer needs a clean test target to
  prove anything — a VM or sacrificial directory, next milestone (M4b).
- Network calls (Ollama API, npm registry via npm) stay out of SystemPort;
  they're injectable `fetchFn` params per module — SystemPort is the machine
  seam, not the network seam.
- Scripts: `npm run install-status` (read-only report), `install-openclaw`,
  `pull-model`. TUI install screen intentionally deferred to the M5/M6 wizard
  work, where the component picker UI actually earns its place.

## M5a — bot builder core + brain guidance (2026-07-07)

- **Traffic lights are hardware math, not vibes**: local brains need
  weights + KV-cache at 24k context + runtime overhead to fit VRAM (minus a
  resident ComfyUI). Amber = CPU offload (≤ 75% of RAM), red = doesn't fit.
  Reasoning models are red on sight — they break OpenClaw's pipe (proven in
  production). Hosted brains are green with `refusalTier` labels so the UI can
  say honestly that Claude refuses explicit content. `npm run brain-options`.
- **The bot builder generates both card forms** from one `BotSpec`: the full
  `characters/<slug>.md` (proven structure: Look/Vibe/Loves/Relationship/
  Speech/Backstory/Hard rules/Photo prompts/Openers) and the compact AGENTS.md
  card. The age marker is injected into the photo Identity line automatically.
- **Safety is validation, not convention**: age ≥ 18 is a hard validation
  floor, and age-coded terms in photo prompts are rejected outright. Universal
  hard rules (adult statement, never-break-character, /pic reaction) are
  renderer-injected on every card.
- **The 12k AGENTS.md truncation cliff is a first-class check**: every insert
  is planned (current/card/headroom, 200-char safety margin) and refused when
  it would not fit — the live workspace sits at ~10.3k, so this guard is not
  theoretical. Writes always back up AGENTS.md first and never overwrite an
  existing character. `npm run create-bot -- spec.json [--write]`, dry-run by
  default. Verified live: Nova (22) dry-run fits at 743 compact chars.
- **Honest limitation**: in the current single-agent OpenClaw design the brain
  is global (`agents.defaults.model.primary`) — characters are personas
  switched with `/be`, all sharing one model. The builder's brain door will
  set the global primary (M5b wiring); per-character brains would need
  multi-agent routing, out of scope for now.
- M5b: in-app test chat (done below), TUI builder/wizard forms,
  brain-choice → config wiring.

## M5b — in-app chat (2026-07-07)

- **In-app chat is a second front end on the same brain**, exactly the model
  we wanted: it connects to the gateway WebSocket and shares the
  `agent:main:main` session with Telegram. No transport/adapter layer needed —
  OpenClaw already treats front ends as interchangeable channels.
- **The gateway WS handshake was reverse-engineered from the bundled client
  and proven live**: `connect.challenge` → sign a pipe-joined v3 payload
  (`v3|deviceId|clientId|clientMode|role|scopes|signedAtMs|token|nonce|platform|deviceFamily`)
  with the device's ed25519 key → `connect` with a device block. Critical
  gotcha: the requested `client.id`/`mode`/`platform`/`scopes` must match the
  **approved** record in `devices/paired.json` exactly (here: `cli`/`cli`/
  `win32`/`["operator.write"]`) — asking for more triggers a re-pairing prompt.
  Terrarium reuses OpenClaw's already-paired CLI identity from
  `~/.openclaw/identity`, so no new pairing is needed.
- **Reply handling is poll-based, not stream-parse-based**: `chat.send`
  resolves on *acceptance*, and the `chat` streaming-event shape is
  under-documented, so after sending we poll `chat.history` (watermark by
  timestamp) until the assistant's reply to this turn lands. Robust and
  correct even though we don't decode every streaming field; `chat` events
  still feed live text for responsiveness. `chat.send` requires an
  `idempotencyKey`. OpenClaw mirrors each delivered turn (model
  `delivery-mirror`) so consecutive duplicate assistant entries are collapsed.
- **TUI**: `c` opens a full chat screen (history + input + live replies),
  `esc` returns to the dashboard. Uses `ink-text-input`. Proven live
  end-to-end: sent messages, got Ella's replies back.
- Deferred to M5c/M6: TUI-native bot builder + wizard forms, brain-choice →
  config wiring, inline ComfyUI image rendering (Electron-era), pairing-
  approval UI for brand-new senders.

## M4b — ComfyUI runtime install (2026-07-07)

- **The reproducible path is the official portable, not a git clone.** The
  live `C:\ComfyUI` is a git clone on system Python (`C:\Python314`) — not
  reproducible on an arbitrary machine. Terrarium installs the pinned
  **`ComfyUI_windows_portable_nvidia` v0.27.0** (bundled Python + CUDA torch,
  ~2 GB) instead.
- **Sacrificial parallel install, proven live**: installs to
  `C:\Terrarium\comfyui`, boots on **port 8189** (never collides with the
  adopted `C:\ComfyUI` on 8188), and was verified end to end — booted,
  reported v0.27.0 + `cuda:0 RTX 4070`, served `/system_stats`, killed
  cleanly. The live bot was untouched throughout.
- **Reusable download utility** (`install/download.ts`): streams any URL to a
  `.part` file with progress, renames on success (a crash never leaves a
  truncated file looking complete), rejects size mismatches, idempotent on
  `expectedBytes`. Models will reuse it. Network stays out of SystemPort —
  `fetchImpl` is injected (M4a rule).
- **7-Zip is a managed dependency**: the installer probes for `7z.exe`
  (Program Files + WinGet Links) and `winget install 7zip.7zip` if missing.
  On this machine 7-Zip existed but wasn't on PATH — the file-probe found it
  anyway. The ~2 GB archive is deleted after the extraction verifies.
- **Deliberately NOT rewired into the supervisor.** The managed install is a
  sacrificial proof; the supervisor's ComfyUI definition still points at the
  adopted `C:\ComfyUI` on 8188. Adopting the managed portable as the real one
  is a separate deliberate step (like the gateway migration) — **M4c**, which
  also covers models + custom nodes + a real face-locked render (the bulky,
  less-fragile part). `managedComfySpawn()` is ready for that.
- Scripts: `npm run install-comfyui`, `npm run verify-comfyui`.

## M4c — ComfyUI render path + model assets (2026-07-07)

- **The managed ComfyUI renders, proven live**: booted the fresh portable,
  submitted a real txt2img workflow (sd_xl_turbo, 512², 1 step) via the HTTP
  API, and got a correct mountain-lake PNG on disk — the full path
  fresh-install → checkpoint → workflow → GPU render → file, on the RTX 4070.
- **Render pieces (reusable core)**: `render/workflow.ts` builds the ComfyUI
  API prompt graph (checkpoint→encode→KSampler→VAEDecode→SaveImage);
  `render/client.ts` `renderImage()` does POST `/prompt` → poll
  `/history/{id}` → returns output image descriptors, with rejection/timeout/
  unreachable all handled. Pure graph builder + mocked client are unit-tested.
- **Model-asset catalog** (`install/comfy-models.ts`): HF-hosted checkpoints
  (WAI-Illustrious, NoobAI) download via the proven `downloadFile`;
  **CyberRealisticPony is Civitai/token-gated → `url: null`**, surfaced as a
  manual/advanced step rather than a silent failure (the fragility the design
  flagged). `installModel` places assets in the right `models/<subfolder>`.
- Proof used a **local copy** of an existing checkpoint (the 2 GB portable
  already proved `downloadFile`; re-pulling 6 GB proves nothing new). Managed
  render ran alongside the live ComfyUI without VRAM trouble (turbo, 512²).
- **Still M4d**: custom nodes (Impact Pack/Subpack, IPAdapter_plus,
  comfyui-ollama, character_ipadapter, prompt_model_switcher) + IPAdapter/
  FaceDetailer models + the face-locked pipeline, then adopting the managed
  ComfyUI as the real one (deliberate switch, like the gateway). The base
  render path is now proven under it.

## M4d — ComfyUI custom-node install (2026-07-07)

- **The fragile capability, proven live**: cloned `comfyui-ollama` into the
  managed ComfyUI, pip-installed its requirements against the *embedded*
  Python, booted, and confirmed ComfyUI actually loaded all 9 Ollama node
  classes via `/object_info` — the real test that git+pip worked, not just
  that files landed.
- **`installGitNode`** clones `--depth 1`, then pip-installs `requirements.txt`
  (only if present) using the portable's `python_embeded\python.exe` — never
  the system Python; dep isolation is the reason for the portable. Idempotent
  (present node skipped), clone/pip failures reported distinctly.
- **Node catalog splits git repos from bespoke bundled nodes**: 4 standard
  repos (Impact-Pack, Impact-Subpack, IPAdapter_plus, comfyui-ollama) clone;
  the 4 small custom nodes from the original build (character_ipadapter,
  prompt_model_switcher, random_seed, write_text_file) have no upstream —
  `repo: null`, `bundled`, copied not cloned (they'll ship with Terrarium).
- **Model catalog extended** with the face-pipeline aux models — all
  HF-downloadable via the proven `downloadFile`: `face_yolov8m`/`hand_yolov8s`
  (FaceDetailer, from Bingsu/adetailer), `4x-UltraSharp` (the `/hd` upscaler),
  `ip-adapter-faceid-plusv2_sdxl` (face-lock).
- **Still M4e**: install the full node set + all models, ship the 4 bundled
  nodes, reproduce generate.py's exact face-locked workflow (IPAdapter delayed
  `start_at`, FaceDetailer passes), and adopt the managed ComfyUI as the real
  one (deliberate switch, like the gateway). Node + render + model-download
  paths are all individually proven now; M4e is assembly.

## M5c — brain picker → config wiring (2026-07-07)

- **The brain choice is the reusable core**, threaded through the existing
  config pipeline so the GUI reuses it unchanged: catalog entries gained
  `provider` + `configRef` (the `agents.defaults.model.primary` string, null
  for guidance-only size placeholders). `resolveBrainChoice(entry)` gates on
  reasoning (breaks OpenClaw), placeholder rows, and provider-configured —
  ArliAI + Ollama are wired; Anthropic is honestly refused ("add its API key
  first") rather than half-wired.
- **The choice persists in `%LOCALAPPDATA%\Terrarium\brain.json`** and
  `applyConfig` reads it on every regeneration, so a migrate/release rewrite
  never snaps the brain back to the template default. `buildOpenclawConfig`
  takes optional `primaryModel`/`fallbacks`; fallbacks always include the
  local safety net `ollama/dolphin3:8b` (never self-referential).
- **`supervisor.setBrain(catalogId)`** validates → persists → regenerates
  config (mode follows ownership: inline for tasks, env-refs for us) with a
  backup, and tells the user to restart the gateway. `currentBrain()` reports
  the active primary. Live-proven: correctly refuses the reasoning model, the
  size placeholder, and Claude (no key yet), touching nothing on reject.
- **TUI**: `b` opens a brain picker showing per-brain traffic lights against
  detected hardware, refusal tiers, and the current selection; ↑↓ + enter to
  switch. (Interactive TUI screens aren't headlessly capturable — raw-mode
  input needs a TTY — so the data paths are proven live instead, as with chat.)
- Deferred to M5d/M6: Anthropic provider + key capture (the Claude door),
  TUI-native character-creation form (the `create-bot` script covers it),
  wizard/onboarding flow.

## M4e — ComfyUI full pipeline assembly + adopt (2026-07-07)

- **Assembly is copy-first**: `planModelAssembly` prefers, per asset, already-
  in-managed (skip) → **copy from a detected live install** (fast, no
  bandwidth, and works even for token-gated files) → download → manual. On a
  fresh machine the plan degrades to download/manual honestly. Live: all 8
  assets copied from `C:\ComfyUI` (~24 GB, size-parity verified per file) —
  including the Civitai-token-gated CyberRealisticPony, which is exactly why
  copy beats download here. `npm run assemble-comfyui`.
- **Catalog corrected against the machine**: the face lock actually loads
  `ip-adapter-plus-face_sdxl_vit-h.safetensors` + `CLIP-ViT-H` clip_vision
  (what IPAdapterUnifiedLoader's "PLUS FACE (portraits)" preset resolves),
  NOT the FaceID bin previously cataloged. The live models dir was the tell:
  trust the machine over the docs.
- **The 4 bespoke nodes now ship with Terrarium**: vendored into
  `packages/core/assets/comfy-nodes/` (each is one `__init__.py`; reviewed —
  clean, adult-only quality tags), installed by `installBundledNode` (copy,
  idempotent, fails loudly if the app's own asset is missing). Note: the
  rebuilt `generate.py` doesn't reference their classes — they're GUI-era
  helpers; kept for parity, but the pipeline doesn't depend on them.
- **Full node set proven live**: Impact-Pack + Impact-Subpack (pip'd against
  the embedded Python), IPAdapter_plus, comfyui-ollama, and all 4 bundled
  nodes installed; boot + `/object_info` confirmed every pipeline class:
  FaceDetailer, UltralyticsDetectorProvider, IPAdapterUnifiedLoader/Advanced,
  CharacterReferenceLoader, PromptModelSwitcher.
- **`buildFaceWorkflow` transcribes `generate.py` EXACTLY** (node IDs mirror
  the Python so the two stay diffable): photoreal CyberRealistic dpmpp_2m/
  karras 24 steps, anime WAI/NoobAI euler_ancestral 28 steps, IPAdapter
  face-lock at `start_at 0.2 / weight 0.8 / ease in-out` (text establishes
  pose before the ref engages), FaceDetailer face pass (locked model, 0.45)
  then hand pass (base model, 0.40). The anti-underage negative terms are
  hard-wired and tested as a floor — not caller-overridable. Plus
  `buildUpscaleWorkflow` (4x-UltraSharp → lanczos) and `uploadImage`
  (ref upload; the in-app photo path will reuse it).
- **Adopt = same port, better files** (the gateway precedent): the comfyui
  service definition now prefers the managed portable at detect/spawn time —
  embedded Python, mode `managed`, **still port 8188** — so `generate.py`,
  the pic daemon, and every health probe keep working with zero changes.
  Port 8189 remains verification-only (proof scripts never collide with a
  live 8188). Machine is currently released; on the next migrate a healthy
  old ComfyUI is adopted as-is, and the first restart of the service boots
  the managed install. No forced switch.
- **Not copied** (deliberately): `bigasp`/`lustify` checkpoints and the
  Hyper-SD LoRA — the rebuilt pipeline never references them (SPEED_LORA
  disabled; MODEL: routing only reaches CyberRealistic/WAI/NoobAI). The old
  install keeps them; copy later if a workflow wants them.

## M5d — the Claude door (2026-07-07)

- **Anthropic is an OpenClaw built-in** (bundled docs: auth = `ANTHROPIC_API_KEY`,
  model refs `anthropic/claude-*`) — so the door is small: a
  `models.providers.anthropic.apiKey` entry (SecretRef in env-refs mode,
  inline value for task ownership), emitted ONLY when the key is captured.
  With no key, the generated config is byte-identical to before — and the
  key never appears in an env-refs config or on any command line.
- **`npm run set-anthropic-key`** reads the key from stdin (never an
  argument — command lines are visible machine-wide), sanity-checks the
  `sk-ant-` shape, **verifies it against `api.anthropic.com/v1/models`
  before storing** (a bad key is refused, not stored), then DPAPI-stores it
  as `anthropic-api-key`.
- **The brain gate follows the store**: `resolveBrainChoice(entry,
  {anthropicConfigured})` — supervisor `setBrain` and the TUI picker both
  read the real key presence, so Claude unlocks the moment the key lands
  and stays honestly refused before that. A captured key does NOT bypass
  the reasoning gate. The gateway spawn injects `ANTHROPIC_API_KEY` via the
  same secretEnv channel as the other keys (absent → omitted).
- **Live proof** (no real key on this machine): gate refuses claude-sonnet
  with "add its API key first", production ArliAI brain unaffected
  (`claude-door-proof.ts`). The open-state path is unit-tested end to end;
  it goes live the first time a real key is pasted.

## M6a — errors that explain themselves (2026-07-07)

- **Codes for us, messages for humans.** `explainError(err)` (pure,
  `errors/explain.ts`) translates any thrown value into
  `{code, summary, remedy, logHint, detail}`. The TUI branches on nothing but
  renders those fields — summary (what happened) + remedy (what to do) + "press
  l for `<service>` log" when a log tells the story. Raw `err.message` no longer
  reaches the operator; `detail` preserves it for diagnosis.
- **Two ways in.** A `TerrariumError` carries its own explanation (thrown from
  core when the failure is expected); everything else is pattern-matched from
  the real throw sites (stray-process, not-ready, crashed-on-start,
  not-installed, secret-missing, anthropic-missing, no-paired-identity,
  not-migrated, unknown-service). Unmatched → an honest generic "something went
  wrong" that still shows the raw error. Rules mirror the throw sites; a site
  adopting `TerrariumError` makes its rule dead-but-harmless.
- **`logHint` reuses the existing log filter**: pressing `l` on a hinted error
  sets the dashboard's service filter, so "show me the log" is one keypress into
  a pane that already exists. 11 unit tests; TUI wiring typecheck-verified.

## M6b — reset to working state / doctor (2026-07-07)

- **Diagnosis is a pure function over gathered facts.** `buildDoctorReport`
  (`supervisor/doctor.ts`) takes `DoctorFacts` and returns a four-item
  checklist (config, credentials, ownership, brain) with ok/warn/fail + an
  optional `fix`. `gatherDoctorFacts` is the thin shell that collects them
  (never throws — a failed probe degrades to a fact).
- **The one safe reset is regenerate-config.** `repair()` re-runs `applyConfig`
  (mode follows ownership: inline for tasks, env-refs when we own it), which
  already rotates a backup and is proven byte-identical to the hand-evolved
  working file. Config drift (or a missing config) is the only auto-fixable
  finding; secrets/ownership issues are surfaced with the manual remedy
  (capture-secrets, admin disable) rather than half-automated.
- **Ownership honesty**: warns when Terrarium owns the stack yet an OpenClaw
  task is still enabled (they fight for the port), and when released-but-tasks-
  left-disabled (bot won't autostart). Otherwise states plainly who owns it.
- **`npm run doctor` (+ `--repair`)** is the headless escape hatch and the live
  proof; TUI `d` opens the same checklist with `r` to repair. 8 unit tests;
  live read-only run on this machine reported all-ok.

## M6c — first-run setup (2026-07-07)

- **Scope call (Corey, mid-build).** He'll run the install himself once it's
  proven, and asked for "whatever is easiest" — so the deliverable is a
  **headless setup engine** plus **blank-slate detection**, not an elaborate
  gated Ink wizard. The full GUI wizard is deferred to the Electron era, where
  a real wizard UI earns its cost. Locked earlier: **full auto-install** of the
  components; **clean GPU-less VM** is the M6d proof target; the flow ends at
  installed + ready-to-migrate with the default Ella persona (bot-building
  stays a separate step).
- **The install orchestrator is the testable core.** `runInstallSequence`
  (`install/orchestrator.ts`) runs the component installers in dependency order;
  each is idempotent, so a re-run after a partial failure **resumes** (completed
  steps re-plan to nothing and skip). A blocker or failed install/verify stops
  the run by default (dependents would fail anyway). `summarizeInstallPlan`
  folds the per-component plans into one wizard-facing summary (needed steps,
  total download/disk over *needed* steps only, component-labeled blockers,
  `ready`). Pure; 9 unit tests.
- **Blank-slate detection.** `needsOnboarding(facts)` / `onboardingReason` (pure,
  3+3 tests) decide wizard-vs-dashboard from missing components + missing
  required secrets; `gatherOnboardingFacts` is the shell. `supervisor.onboarding()`
  exposes it, and the TUI shows a yellow first-run banner pointing at
  `npm run setup` + `npm run capture-secrets` when the slate is blank.
- **`npm run setup [--run]`** is both the install-yourself tool and the M6d
  proof engine: prints the machine, the onboarding decision, and the full plan
  (read-only); with `--run` it installs Ollama → OpenClaw → ComfyUI in order
  with streamed progress, then pulls the local fallback brain (dolphin3:8b), and
  ends with the honest next steps (capture-secrets; assemble-comfyui — big, GPU
  to render; migrate). **Honest ceiling**: secrets need the user's own token
  (can't be automated), and the Civitai-token-gated photo checkpoint stays a
  manual step — the flow never pretends otherwise. Preview-proven live on this
  machine (correctly read as fully set up); `--run` proof is M6d on a clean VM.
