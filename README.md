# Terrarium

A sealed little ecosystem for your companion bot. Terrarium installs,
configures, supervises, and monitors the whole stack — OpenClaw gateway,
Ollama, ComfyUI, pic daemon — in one window: guided setup, hardware-aware
model guidance, truthful detected status, a Bot Builder, and one unified log
pane. No stray cmd windows.

Architecture: headless supervisor core (`@terrarium/core`, zero UI deps,
Functional Core / Imperative Shell) consumed by an Ink TUI
(`@terrarium/tui`); an Electron GUI lands later on the same core.

## Dev quickstart

```
npm install
npm test              # core unit tests (Vitest)
npm run typecheck
npm run smoke         # one read-only pass against the live system, prints statuses
npm run tui           # status board + unified log pane (read-only in M1); q quits
```

## Status

- **M0 scaffold** — done
- **M1 detect & observe (read-only)** — done. `npm run smoke` / `npm run tui`
  observe the live system without touching it.
- **M2 own the processes** — done. The TUI can start/stop/restart services it
  owns (piped stdio, hidden windows, tiered ordering, crash backoff).
  Ownership is a deliberate, reversible switch: press `m` (migrate) in the TUI
  to disable the OpenClaw scheduled tasks and take over; `g` (release) or
  `npm run release` hands everything back. Until migrated, the TUI stays a
  read-only observer.
- **M3 config + secrets** — done. `npm run capture-secrets` moves the
  plaintext secrets from `openclaw.json` into a DPAPI-encrypted store
  (one-time; already run). From then on, migrating writes a **secretless**
  config (secrets injected as env vars at spawn) and releasing restores the
  inline config the scheduled tasks need. The TUI header shows which bot the
  stored token actually belongs to (getMe).
- **M4a installers (part one)** — done. `npm run install-status` shows what's
  installed vs. needed with honest sizes; OpenClaw is version-pinned into an
  app-owned runtime (`npm run install-openclaw`, live-proven idempotent);
  models pull through Ollama's streaming API (`npm run pull-model -- <name>`);
  Ollama itself installs via winget on machines that lack it. ComfyUI install
  execution (the ~20 GB fragile piece) is M4b and needs a clean test target.
- **M5a bot builder core** — done. `npm run brain-options` traffic-lights
  every brain against detected hardware (context-aware VRAM math, reasoning
  models excluded, refusal tiers labeled). `npm run create-bot -- spec.json
  [--write]` generates full + compact character cards with the proven
  structure, enforces the 18+ floor and the 12k AGENTS.md truncation budget,
  and always backs up before writing.
- **M5b in-app chat** — done. Press `c` in the TUI to chat with your bot
  directly, no Telegram needed — it connects to the gateway WebSocket and
  shares the same conversation/brain as Telegram. Proven live end-to-end.
- **M5c brain picker** — done. Press `b` in the TUI to switch your bot's brain
  from a hardware-aware menu (traffic lights, refusal tiers). The choice
  regenerates the config with a backup and survives migrate/release. Reasoning
  models, size placeholders, and un-keyed providers (Claude) are refused with
  clear reasons.
- **M4b ComfyUI runtime install** — done. `npm run install-comfyui` fetches
  the pinned portable (bundled Python + CUDA, ~2 GB), extracts it to a managed
  dir, and `npm run verify-comfyui` boots it on port 8189 and confirms it
  serves — all proven live on the RTX 4070 without touching the live
  `C:\ComfyUI`. Models, custom nodes, and a real render are M4c.
- **M4c ComfyUI render path** — done. The managed ComfyUI renders real images
  via its HTTP API (proven live on the RTX 4070); a model-asset catalog
  downloads HF checkpoints (Civitai ones flagged as needing a token). Custom
  nodes + the face-locked pipeline are M4d.
- **M4d ComfyUI custom-node install** — done. Terrarium clones + pip-installs
  ComfyUI custom nodes against the embedded Python (proven live: ComfyUI loaded
  the installed node); the model catalog covers the face-pipeline aux models.
- **M4e ComfyUI full pipeline + adopt** — done. `npm run assemble-comfyui`
  brings the managed install to full parity: all git + bundled custom nodes
  (the 4 bespoke ones ship with Terrarium) and every model asset, copied from
  a detected live install where possible (~24 GB borrowed, not re-downloaded)
  with download/manual fallbacks for fresh machines. The exact face-locked
  pipeline from the proven `generate.py` (IPAdapter + FaceDetailer face/hand
  passes) is transcribed as `buildFaceWorkflow` and proven live with a real
  character ref. The service definition now prefers the managed install —
  same port 8188, so the pic pipeline never notices the switch.
- **M5d Claude door** — done. `npm run set-anthropic-key` captures an
  Anthropic API key (stdin, verified against the live API, DPAPI-stored).
  Once present, the Claude brain unlocks in the picker and config
  regeneration wires the built-in anthropic provider (SecretRef in env-refs
  mode, inline for tasks); without it, nothing changes and Claude is
  honestly refused.
- **M6a errors that explain themselves** — done. Failures now surface as a
  plain summary + a remedy + "press `l` for the log", driven by a pure,
  unit-tested `explainError` in core. `npm run doctor` and the TUI never dump
  a raw stack at the operator.
- **M6b reset to working state** — done. `npm run doctor` diagnoses drift
  (config, credentials, ownership, brain) and `npm run doctor -- --repair`
  regenerates the known-good config from the proven template (backs up first).
  TUI `d` opens the same checklist; `r` repairs.
- **M6c first-run setup** — done. `npm run setup` shows the full-install plan
  for a fresh machine (read-only); `npm run setup -- --run` installs Ollama,
  OpenClaw, and ComfyUI in dependency order (idempotent, resumable) and pulls
  the local fallback brain. The TUI shows a first-run banner pointing at it when
  the machine is a blank slate. The elaborate GUI wizard is deferred to the
  Electron era.
- **M6d clean-VM first-run pass** — **done, and it paid off.** `npm run setup
  -- --run` was proven end-to-end on a blank Hyper-V Windows 11 VM: Ollama,
  OpenClaw, ComfyUI, and the `dolphin3:8b` fallback all installed in order from
  nothing. The run flushed out three real bugs invisible on a dev machine, now
  all fixed with regression tests: (1) the winget installs lacked `--source
  winget`, so a fresh VM's flaky msstore source aborted them; (2) a failed
  installer threw an uncaught stacktrace instead of a clean `✗` step; (3) the
  ComfyUI 7-Zip step ran through winget, which hangs indefinitely on a fresh
  machine — replaced with a direct pinned download. Delivery is one-shot:
  `scripts\make-vm-bundle.ps1` → `vm-bootstrap.ps1 -Run`. Walkthrough +
  prerequisites in [docs/m6d-vm-runbook.md](docs/m6d-vm-runbook.md) and
  [docs/m6d-vm-setup-guide.md](docs/m6d-vm-setup-guide.md). **This completes the
  M0→M6 roadmap.**
