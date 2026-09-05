# Desktop validation

The desktop smoke harness opens a hidden Electron window with the real production
renderer and preload. It uses a fresh temporary profile and in-memory fixture
handlers. It never imports the live supervisor, reads your character library, sends
Telegram messages, or calls a model. All chat and character operations are simulated.

## Run locally on Windows

```powershell
npm run check
npm run test:desktop
npm run gui:package
```

`test:desktop` builds the GUI, then verifies:

- Sandboxed preload startup and renderer isolation.
- Draft persistence across navigation and renderer reloads.
- Drafting while offline, reconnect status, and a successful send.
- Reading-position preservation and Jump to latest.
- Switching a renamed character by its stable file identity.
- Showing a failed character switch without changing the active selection.
- Disabling reset while sending and clearing history after reset acceptance.
- Rejecting path traversal, new windows, and external navigation.
- Header/composer containment at the supported 900px minimum width.
- Absence of renderer/preload errors during those interactions.

Screenshots and a JSON result are written to `.desktop-smoke/` (git-ignored).
The script leaves its temporary fixture profile under the Windows temp directory;
it contains test data only. A traversal rejection in the Electron console is expected
during the negative security test.

The hook regression tests additionally cover interrupted outbox delivery, queue
serialization, disconnects during a send, reply-poll failure after acceptance,
failed resets, and stale history/status recovery.

## Check the packaged assets

After `gui:package` finishes, run:

```powershell
node scripts/run-desktop-smoke.mjs C:/TerrariumBuild/dist/win-unpacked/resources/app.asar/out
```

This repeats the same interactions using renderer/preload files inside the packaged
ASAR. It does not launch the production supervisor entry point or install the app.
The configured installer is `C:\TerrariumBuild\dist\Terrarium Setup 0.1.0.exe`.

## Verified on 2026-09-05

All 366 unit/hook/filesystem tests passed across 55 files, along with TypeScript
checking and the production build. Electron is pinned to 44.2.0, electron-vite to
5.0.0, Vite to 7.3.6, and the React plugin to 5.2.0. The full npm audit reports
zero vulnerabilities. The NSIS installer rebuilt successfully, and all 10 desktop
checks passed against its packaged renderer and preload. Screenshots were inspected
at 1280px and 900px.

## Live service validation

Run `npm run test:live` only when the local services are already running. This
explicit integration command creates a dedicated gateway conversation, a ComfyUI
image, and a WAV sample. It is separate from the automatic unit suite. Results and
media are saved in `.desktop-smoke/`. A test image also remains in ComfyUI's output
folder, and the dedicated test session remains in OpenClaw.

Verified successfully:

- OpenClaw accepted a message and returned the expected response in a unique
  validation session with external delivery disabled. Closing/reconnecting the
  client preserved the test message and response.
- Ollama generated completed text with the installed `dolphin3:8b` model.
- ComfyUI rendered a 512 by 512 image using the production workflow builder and
  render client with the installed SDXL Turbo checkpoint. The PNG was downloaded,
  dimension-checked, and visually inspected.
- The installed Kokoro engine generated a valid, nonempty WAV sample.
- The actual character activation function switched synthetic cards in a temporary
  workspace, retained unrelated instructions, and preserved exact backups. Invalid
  identities and excessive prompt sizes left the workspace unchanged.

Client reconnection does not establish recovery after a real gateway process restart.
Voice generation does not establish audible playback through the desktop UI. These
checks do not change the user's active character or restart the user's services.

## Clean-machine installation

The installer is `C:\TerrariumBuild\dist\Terrarium Setup 0.1.0.exe` and is unsigned.
A prepared bundle at `C:\TerrariumBuild\clean-install` contains the installer,
SHA-256 checksum, first-run checklist, and `test-clean-install.ps1`.
Copy that folder into a fresh Windows VM and follow its README.txt. The script
verifies the checksum, installs the application, and checks basic process/boot-log
startup. The first-run UI checklist must still be completed separately.

The script was syntax-checked here, but **clean-VM installation has not been run**:
Windows denied Hyper-V enumeration and Windows Sandbox is not installed in this
session. No clean-machine or installed-supervisor success is claimed.

The desktop boundary enables sandboxing/context isolation, blocks external
navigation/new windows/webviews, denies unrequested permissions, and validates every
preload request's sender, main-frame document, and argument shape. See
[Electron's security guidance](https://www.electronjs.org/docs/latest/tutorial/security)
and the [electron-vite migration guide](https://electron-vite.org/guide/migration).
