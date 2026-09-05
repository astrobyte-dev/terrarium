# Terrarium project review

Reviewed 2026-09-05 against the current working tree, including existing uncommitted changes.

## Desktop follow-up

The subsequent desktop pass added persistent drafts, offline drafting, clear reconnect
status, reading-position preservation, a Jump to latest button, safe reset acceptance,
and a responsive chat layout at the supported minimum window width. Renamed characters
now retain their stable file identities across chat, editing, galleries, and voice
selection. Activation backs up the active prompt and checks its size before writing.

The Electron sandbox is enabled, navigation and new windows are restricted, and all
preload requests now validate the sending window/frame/document and their runtime
arguments. A new isolated Electron harness exercises the built UI and real preload,
captures screenshots, and tests negative security cases. Unit/hook coverage is now
363 passing tests. See [desktop validation](desktop-validation.md) for repeatable
commands and the exact limits of the fixture and packaging checks.

The original assessment below describes the starting point for these passes. Its
desktop-test and sandbox gaps are now partly addressed; clean-VM installation,
real-service interaction tests, and major dependency upgrades remain outstanding.

## Assessment

This is a substantial desktop application with a sound core architecture. Its best
qualities are the separation between the headless supervisor and its interfaces,
injectable system boundaries, reversible process ownership, backup-aware config
changes, and an existing suite of 312 passing tests. It has progressed well beyond
the core-only milestone list previously presented in the README.

The main weakness is uneven verification: the supervisor and installer have extensive
tests, while the Electron bridge and React interaction flows had no tests in the
configured suite. The normal typecheck command also omitted the GUI. Passing the
old checks therefore did not establish desktop-app reliability.

## Improvements in this pass

- Reuse a pending/established chat connection, including concurrent startup calls.
- Bound the gateway handshake to 15 seconds and reject it when the socket closes.
- Clear request timers on responses and reject pending requests on explicit close,
  even if the socket's close event arrives later. Ignore events from obsolete sockets.
- Reject malformed frame shapes and ignore chat events with another session key.
- Confirm outgoing messages after gateway acceptance so an unaccepted send remains
  eligible for recovery. A later reply-poll failure no longer marks an accepted send
  as undelivered in the renderer.
- Preserve legitimate repeated history messages; collapse explicitly identified
  delivery mirrors. Keep timestamped fallback IDs stable across history windows.
- Merge authoritative history over stale local delivery/streaming state. Match each
  provisional echo only once and preserve unsent repeated messages.
- Validate stored outbox records and restore interrupted sends with their original
  idempotency keys. Read the latest queue between sends rather than retaining a stale
  batch across connection or conversation changes.
- Ignore obsolete React startup callbacks and avoid overwriting a newer disconnected
  status when a slow history/photo load finishes.
- Retry an initial connection failure and start proactive scheduling after successful
  recovery, using the existing user settings.
- Include GUI TypeScript checking and provide `npm run check` for the complete local
  verification sequence.

## Follow-up implementation and verification

The follow-up adds persistent drafts, offline composition, reading-position
preservation, responsive chat layout, guarded conversation reset, stable character
identities, and backup-preserving activation. The Electron boundary now validates
IPC senders and arguments, enables sandboxing, and restricts navigation and windows.

Electron and the build tools were upgraded; the full dependency audit now reports
zero vulnerabilities. Verification includes 366 passing tests, production builds,
10 packaged-renderer/preload checks, real local gateway chat/reconnection, Ollama
text generation, ComfyUI image generation, and Kokoro audio generation.

See [desktop validation](desktop-validation.md) for reproducible commands and the
precise boundary between fixture tests, real service checks, and remaining checks.

## Remaining release work

Clean Windows VM installation and the first-run experience remain unverified:
Hyper-V access was denied and Windows Sandbox was unavailable. A checksum-verified
installer test bundle is prepared at `C:\TerrariumBuild\clean-install`.
The installer is unsigned. Real gateway process-restart recovery and audible UI
playback also remain separate from the successful client-reconnection and voice
file-generation checks. Existing uncommitted work was preserved; no commit was made.
