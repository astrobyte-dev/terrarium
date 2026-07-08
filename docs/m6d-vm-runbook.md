# M6d — clean-VM first-run runbook

The one milestone the automated suite can't prove for itself: that
`npm run setup -- --run` takes a **blank Windows machine** to an installed,
ready-to-migrate core stack. This runbook makes that a one-shot: build a
bundle here, copy it to a fresh VM, run one script, run one command, verify.

Everything here is grounded in what the installers actually do
([registry.ts](../packages/core/src/install/registry.ts) →
[ollama.ts](../packages/core/src/install/ollama.ts),
[openclaw.ts](../packages/core/src/install/openclaw.ts),
[comfyui.ts](../packages/core/src/install/comfyui.ts)) and the setup engine
([setup.ts](../packages/core/scripts/setup.ts)). No guessing.

---

## What this VM run proves — and what it can't

**Proves (the M6d goal):** the full install path on a machine that has never
seen any of it — winget-installing Ollama, npm-pinning OpenClaw into the
app-owned runtime, downloading + extracting the ComfyUI portable, pulling the
local fallback brain — in dependency order, and that **re-running is
idempotent** (a killed download resumes; a finished step skips).

**Cannot prove on a GPU-less VM (by design — already proven on your RTX 4070):**
- A real **photo render**. ComfyUI *installs* on the VM but has no CUDA GPU to
  render with. The setup engine says so out loud.
- **Live bot chat / Telegram.** That needs your own bot token + provider keys,
  which are captured separately (`npm run capture-secrets`) and never
  automated. Not part of the `--run` path.

So "green on the VM" = the install machinery is sound on a clean slate. The
render + chat halves are already live-proven on your real machine.

---

## VM prerequisites

| Need | Why | If missing |
|---|---|---|
| **Windows 10/11 x64** | v1 target | — |
| **winget** (App Installer) | installs Ollama + 7-Zip | Ollama & ComfyUI become **blockers** and `--run` refuses. Install "App Installer" from the Microsoft Store, or `Add-AppxPackage` the App Installer bundle. |
| **~20 GB free on C:** | ComfyUI precheck alone needs 8 GB; +Ollama 2 GB +dolphin3:8b ~5 GB +node_modules | ComfyUI step blocks under 8 GB free |
| **Internet** | winget, npm, GitHub, Ollama pulls | everything blocks |
| **Node.js LTS** | runs the repo (tsx) | the bootstrap script installs it via winget |
| Git | *not* required for `--run` | only needed later for `assemble-comfyui` custom nodes |

**Do this first: take a VM snapshot while the machine is still blank.** Then you
can revert and re-run the blank-slate path as many times as you want — the most
useful thing a VM gives you here.

---

## Step 1 — build the bundle (on this machine)

There's no git remote (the repo has commits nowhere to clone from), so we ship a
zip of the source. `node_modules` and `.git` are excluded; the VM does a clean
`npm ci` from the committed `package-lock.json`.

```powershell
powershell -ExecutionPolicy Bypass -File scripts\make-vm-bundle.ps1
```

Output: `dist\terrarium-vm-bundle.zip` (source only, a few MB). Copy it to the VM
— shared folder, drag-and-drop, or a network share; any transport works.

## Step 2 — bootstrap the VM (on the VM)

Unzip the bundle anywhere (e.g. `C:\terrarium`), open PowerShell in that folder,
and run:

```powershell
powershell -ExecutionPolicy Bypass -File vm-bootstrap.ps1
```

It is idempotent and check-before-act. It will:
1. Confirm Windows + report whether winget is present (warns, doesn't fail, if not).
2. Install **Node.js LTS** via winget *only if* `node` isn't already on PATH.
3. `npm ci` at the repo root.
4. Run `npm run setup` (**preview only** — touches nothing) so you see the plan.
5. Print the exact next command.

## Step 3 — the real install (on the VM)

If the preview shows a plan with **no blockers** (run in the same window; `npm`
is a `.ps1` wrapper, so lift PowerShell's script block for this session first —
it reverts on close):

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
npm run setup -- --run
```

Watch for, in order: `✓ ollama`, `✓ openclaw`, `✓ comfyui`, then the
`dolphin3:8b` pull. If a step fails it stops and tells you why; fix the cause and
re-run — completed steps skip.

## Step 4 — verify

```powershell
# components on disk
Test-Path "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe"                                   # Ollama
Test-Path "$env:LOCALAPPDATA\Terrarium\runtime\node_modules\openclaw\package.json"         # OpenClaw (pinned)
Test-Path "C:\Terrarium\comfyui\ComfyUI_windows_portable\ComfyUI\main.py"                   # ComfyUI portable
ollama list                                                                                 # dolphin3:8b present

# the engine's own read-back — should now say "already set up", all ✓
npm run setup

# health check
npm run doctor
```

**Idempotency check (the important one):** run `npm run setup -- --run` a second
time. Every step should report *already installed* / skip, and the fallback pull
should say *already present*. That's the resumability guarantee holding.

## Step 5 — reset to re-test

Either **revert the VM snapshot** (cleanest), or manually:

```powershell
winget uninstall --id Ollama.Ollama
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\Terrarium"   # runtime + secrets + ledger
Remove-Item -Recurse -Force "C:\Terrarium\comfyui"
ollama rm dolphin3:8b   # if Ollama still installed
```

---

## Expected preview output (shape)

```
Terrarium setup

Machine  no NVIDIA GPU detected · 8 GB RAM · 45 GB free on C:
  note: no GPU — the photo pipeline (ComfyUI) installs but cannot render here.

State    blank slate — Ollama, OpenClaw, ComfyUI not installed; credentials not captured
Wizard   would run (blank slate)

Install plan — ~4.8 GB download, ~10.3 GB disk:
  ○ ollama    winget install Ollama.Ollama (silent)
  ○ openclaw  npm install openclaw@2026.6.11 into the Terrarium runtime (global copy untouched)
  ○ comfyui   download ComfyUI portable v0.27.0 (bundled Python + CUDA) — ~2 GB; ...

(preview only — re-run with --run to install)
```

If instead you see a `! blocker` line (no winget, or <8 GB free), clear it before
`--run` — the engine refuses to install with unresolved blockers.

---

## If something breaks

| Symptom | Cause | Fix |
|---|---|---|
| `winget is not available` blocker | no App Installer on the VM | install App Installer from the Store; re-run bootstrap |
| ComfyUI disk blocker | <8 GB free on C: | grow the VM disk or free space |
| `npm ci` fails | no internet / registry unreachable | check the VM's network |
| openclaw "does not verify" | npm install partial | re-run `npm run setup -- --run` (resumes) |
| 7-Zip missing after winget | winget source hiccup | `winget install 7zip.7zip` manually, re-run |

Report back what the VM printed and we close M6d.
