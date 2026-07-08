# M8b — Packaging & Install Runbook

*The installable tray app. Written 2026-07-09.*

## What M8b delivers

`Terrarium.exe` — an NSIS-installed tray app that runs independently of any dev
terminal. This is what makes **Migrate a persistent mode**: once Terrarium owns
the services, they run as children of the tray app, which stays alive after you
close its window (it hides to tray). Closing `npm run gui` used to take Ella down;
the installed app doesn't.

## Building the installer

```
npm run gui:package        # electron-vite build + electron-builder --win
```

Output: `C:\TerrariumBuild\dist\Terrarium Setup 0.1.0.exe` (~76 MB, NSIS one-click).

Notes baked into `packages/gui/electron-builder.yml`:
- **Output is outside OneDrive** (`C:\TerrariumBuild\dist`). OneDrive locks files
  inside a synced `dist` mid-build, so electron-builder's rmdir of `win-unpacked`
  fails with EBUSY between rebuilds. Plain NTFS avoids it.
- `electronVersion: 33.4.11` is pinned explicitly — electron is hoisted to the
  workspace root, so electron-builder can't detect it from `packages/gui`. Bump
  this together with the `electron` devDependency.
- `extraMetadata.name: terrarium` gives a clean unscoped app identity, so userData
  lives at `%APPDATA%\terrarium` (not the scoped `@terrarium/gui`).
- `asar: true`, `tray.png` ships in `extraResources` (main resolves it via
  `process.resourcesPath` when packaged).
- Icon: `build/icon.ico` — regenerate with `npm run gen-installer-icon -w @terrarium/gui`
  (zero-dep PNG-in-ICO encoder, matches the tray droplet).

### DEBUG GOTCHA (cost hours on 2026-07-09 — read this)

If a freshly built `Terrarium.exe` **launches and exits instantly without a window**
(no processes, no `%LOCALAPPDATA%\Terrarium\gui-boot.log`), check for a leaked
**`ELECTRON_RUN_AS_NODE=1`** in the environment:

```
$env:ELECTRON_RUN_AS_NODE     # must be empty
```

When set, electron.exe runs as plain Node, so `require('electron')` returns a path
STRING instead of the API, `app` is `undefined`, and the main crashes at the first
`app.*` call. It is NOT an asar/fuse/OneDrive/signing problem (all were chased and
cleared). Clear it and relaunch: `Remove-Item Env:\ELECTRON_RUN_AS_NODE`.

The app writes boot milestones to `%LOCALAPPDATA%\Terrarium\gui-boot.log`
(`boot → ready → setup complete`) — check there first when a launch misbehaves.

## Installing

Run `Terrarium Setup 0.1.0.exe` (double-click, or `/S` for silent). One-click,
per-user install to `%LOCALAPPDATA%\Programs\@terrariumgui\`. Creates a Start-menu
+ desktop shortcut named **Terrarium**.

Verified 2026-07-09 (win-unpacked, env clean):
- Boots to 4 processes (main + gpu + utility + renderer) with a real window.
- **Single-instance lock holds**: a second launch boots, logs
  "second instance — quitting", and exits — exactly one main survives. This is the
  guard against the duplicate-gateway poison loop; it is non-negotiable and it works.
- Tray menu: Open Terrarium · Start on login (checkbox) · Quit Terrarium.
  "Start on login" uses `app.setLoginItemSettings` (enabled only when packaged).

## Migration story (persistent ownership)

1. Install the .exe and launch it (tray app, independent of any terminal).
2. **Migrate to Terrarium** (NavRail button — safe post-M8a; it preserves your
   hand-tuned config, only secret placement changes). Terrarium now owns the
   services and runs them as its children.
3. Close the window → it hides to tray → **Ella keeps answering on Telegram.**
4. One-time documented admin step: from an ELEVATED PowerShell,
   `Disable-ScheduledTask -TaskName 'OpenClaw Gateway'` — that task's ACL denies a
   non-elevated disable (known since M3), so migrate can't disable it itself and
   would otherwise fight for the port at next logon.
5. Scheduled tasks remain the documented fallback: **Release** hands the services
   back to them any time. Keep them as the safety net until the tray app is trusted.

## Known follow-ups

- A copy was installed to `%LOCALAPPDATA%\Programs\@terrariumgui\` during 2026-07-09
  testing. Harmless (it owns nothing until you Migrate); uninstall via
  "Uninstall Terrarium.exe" in that folder or Windows Apps settings if unwanted.
- Code signing: electron-builder invokes signtool; there's no real cert, so the exe
  is effectively unsigned — SmartScreen will warn on first run of the installer.
  A real cert is a later polish item, not a blocker for personal use.
