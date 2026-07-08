# M6d — setting up the Hyper-V test VM (step by step)

Companion to [m6d-vm-runbook.md](m6d-vm-runbook.md). This guide gets you from
"Hyper-V just enabled" to a running clean Windows 11 VM. The runbook covers what
you do *inside* the VM once it's up.

**Status:** Hyper-V has been enabled on this machine (via DISM). It needs a
reboot to finish — that's Step 1.

---

## Step 1 — Reboot (required)

Hyper-V's hypervisor only loads at boot. Save your work and restart Windows
normally. Nothing below works until you do.

## Step 2 — Create the VM with Quick Create

1. Press Start, type **"Hyper-V Quick Create"**, open it.
2. In the left gallery pick **"Windows 11 dev environment"**.
3. Click **Create Virtual Machine**. It downloads the image (~20+ GB) and
   provisions it automatically — no ISO, no Windows setup wizard, no product
   key. This is hands-off but can take a while on a slow connection.
4. When it finishes, click **Connect**, then **Start**.

The dev image boots straight to a Windows 11 desktop. It's a real Windows, so
**winget is already present** — which is exactly why we chose it (Ollama and
ComfyUI's 7-Zip install through winget).

> It comes with some preinstalled dev tools (Visual Studio etc.). That's fine —
> none of *our* components (Ollama, OpenClaw, ComfyUI) are on it, so it's still a
> valid blank slate for the install test. The image is a 90-day evaluation;
> no activation needed for testing.

## Step 3 — (Optional) VM resources

Defaults are usually fine. If you want to check/adjust: shut the VM down, open
**Hyper-V Manager**, right-click the VM → **Settings**:
- **Memory**: 8 GB is plenty (dynamic memory is fine).
- **Disk**: the dev image's virtual disk grows on demand; you have 642 GB free
  on the host, so the ~15–20 GB the stack needs is no problem.
- **No GPU**: a Hyper-V VM has no CUDA GPU by default. That's intended — it's how
  we prove ComfyUI *installs* without one. (Rendering is already proven on your
  4070; the VM isn't for that.)

## Step 4 — Get the bundle into the VM

The bundle is here on the host:
`c:\Users\thr3e\OneDrive\Desktop\chatbot\terrarium\dist\terrarium-vm-bundle.zip`
(~0.2 MB).

The Quick Create VM uses **Enhanced Session Mode**, which shares your clipboard:
1. On the **host**, select `terrarium-vm-bundle.zip` and press **Ctrl+C**.
2. Click into the **VM** window, open a folder (e.g. the Desktop), press **Ctrl+V**.
   The file copies across.

(If clipboard file-copy is disabled, reconnect: in the VM Connection window use
the resolution prompt's **"Show Options" → Local Resources → More → Drives**, tick
your host drive, then copy the zip from there.)

## Step 5 — Unzip and run (inside the VM)

1. Right-click the copied `terrarium-vm-bundle.zip` → **Extract All…** → extract
   to e.g. `C:\terrarium`.
2. Open **PowerShell** in that folder (Shift+right-click the folder → "Open
   PowerShell window here", or `cd C:\terrarium` in a PowerShell window).
3. Lift PowerShell's default script block **for this window only** (needed
   because `npm` is a `.ps1` wrapper and Windows blocks scripts by default; this
   reverts when you close the window and changes nothing permanent):
   ```powershell
   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
   ```
4. Bootstrap (installs Node if missing, restores deps, shows the plan):
   ```powershell
   powershell -ExecutionPolicy Bypass -File vm-bootstrap.ps1
   ```
   > If winget can't find Node, make sure it's pinned to the winget source
   > (`--source winget`); a fresh VM's msstore source often fails with a cert
   > error. After Node installs, open a NEW window and re-run so it's on PATH.
5. If the printed plan has **no `! blocker` lines**, do the real install (in the
   same window from step 3, so the policy bypass is still in effect):
   ```powershell
   npm run setup -- --run
   ```
   Watch for: `✓ ollama`, `✓ openclaw`, `✓ comfyui`, then the `dolphin3:8b` pull.

## Step 6 — Verify (inside the VM)

Run the verification block from the runbook
([m6d-vm-runbook.md](m6d-vm-runbook.md), Step 4) — the Test-Path checks, `ollama
list`, `npm run setup` (should now say "already set up"), and `npm run doctor`.
Then re-run `npm run setup -- --run` once more to confirm it's **idempotent**
(everything should skip / say "already present").

## Step 7 — Report back

Copy what the VM printed (especially the `✓/✗` install lines and the final
`npm run setup` read-back) and paste it here. That closes M6d — and with it the
whole M0→M6 sequence.

---

## Snapshot tip (recommended)

Before Step 5, in Hyper-V Manager right-click the VM → **Checkpoint**. That saves
the blank-slate state so you can revert and re-run the install test as many times
as you like — the single most useful thing the VM gives us.

## If something goes wrong

| Symptom | Fix |
|---|---|
| Quick Create download stalls/fails | retry; it resumes. Or grab a Win11 ISO and use the runbook's ISO note. |
| `winget` "not recognized" in the VM | rare on the dev image; open the Microsoft Store, update **App Installer**. |
| Clipboard copy of the zip won't work | use the drive-redirection method in Step 4's note. |
| ComfyUI disk blocker | give the VM more disk in Hyper-V Manager → Settings. |
| any `✗` install line | fix the cause it prints, re-run `npm run setup -- --run` (completed steps skip). |
