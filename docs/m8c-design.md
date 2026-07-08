# M8c — Pics in the in-app chat (design pass)

*Drafted 2026-07-09. Status: awaiting Corey's sign-off before any code.*

## The actual gap (smaller than it looks)

Triggering already works. `pic_daemon` tails the **shared** `agent:main:main` session
transcripts, so a `/pic` (or `/be`, `/hd`, `/pic?`, bare `1/2/3`) typed in the GUI
chat reaches the daemon exactly like one from Telegram — same session, same brain.
The daemon generates the photo either way.

The only thing missing is **delivery**: `generate.send_telegram` / `send_telegram_album`
push the finished photo to Telegram only. M8c makes that same photo also appear as an
image bubble in the GUI chat. Nothing about generation, routing, captions, or the 18+
floor changes.

## Architecture — mirror, don't reroute

```
 /pic in GUI chat ─┐
 /pic in Telegram ─┴─► gateway session transcript ─► pic_daemon (unchanged trigger)
                                                          │ generates via ComfyUI
                                                          ▼
                              generate.send_telegram(…)  ◄── PROVEN, byte-identical
                                                          │
                              mirror_to_inbox(paths,…)   ◄── NEW, best-effort, never raises
                                                          │  copies PNG(s) + writes manifest
                                                          ▼
                    %LOCALAPPDATA%\Terrarium\inbox\  ──►  GUI main polls (1s)
                       img_*.png  +  <id>.json             │ reads manifest, deletes .json
                                                          ▼
                              chat:message (role=assistant, images=[terrarium://…], text=caption)
                                                          ▼
                              ChatScreen image bubble  (served via terrarium:// protocol)
```

Telegram delivery runs **first and untouched**; the mirror is a second, wrapped,
best-effort step. If the mirror throws, it logs and the photo still reached Telegram.

## The pieces

**1. Daemon side (Python — the proven, careful part).**
- New `mirror_to_inbox(paths, caption, character, session_key)` in `pic_daemon.py`.
  Computes `inbox = %LOCALAPPDATA%\Terrarium\inbox` (env, present in both ownership
  modes). For each image: `shutil.copy` the PNG into the inbox. Then write a manifest
  atomically (`<uuid>.json.tmp` → rename to `<uuid>.json`) so the watcher never reads a
  half-written file. Manifest:
  `{ images:[filenames], caption, character, prompt, params:{anime,noob,strict,count}, sessionKey, ts }`.
  Whole body in `try/except` → logs, never raises.
  - **`prompt` + `character` + `params` are captured now on purpose** (zero UI cost today):
    they're what a future per-character gallery and per-image redo/variation/x3/hd buttons
    need, and they can't be backfilled for photos generated before the change. See the
    design backlog (Tier 2 #4, Tier 3 #10).
- Call it right after each existing Telegram send: in `handle_pic` (single + album) and
  `handle_hd`. Two/three one-line additions; the Telegram calls stay exactly as they are.
- **Why copy into the inbox** (vs. referencing the comfy `output/` dir in place): the GUI
  then trusts exactly one directory, the comfy output can be cleaned independently, and the
  `terrarium://` protocol scope is a single self-contained folder under our own AppData.

**2. GUI main (Electron).**
- Register a privileged `terrarium:` scheme before app-ready; after ready,
  `protocol.handle('terrarium', …)` maps `terrarium://inbox/<file>` to a file read from the
  inbox dir, **with path-traversal validation** (resolved path must stay inside inbox; else
  404). This replaces loosening CSP to `file:` (which would expose the whole disk).
- New `src/main/inbox.ts` `setupInbox(getWin)`: poll the inbox every 1000ms for `*.json`
  manifests; for each, push a `chat:message` to the renderer (images as `terrarium://inbox/…`
  URLs) then delete the manifest. On startup, prune the inbox to the most recent ~100 PNGs so
  it can't grow unbounded.
- CSP gains `terrarium:` in `img-src` (`img-src 'self' data: terrarium:`).

**3. Renderer.**
- `ChatMsg` gains `images?: string[]` (the reconcile dedupe switches to keying on
  role+text+images). Contract DTO updated.
- `ChatScreen` renders image bubbles: when `images` present, show the PNG(s) (max-width
  capped, click-to-open-full optional later); caption text above/below if any.

## Decisions I've already made (sensible defaults — flag if you disagree)

- **Copy images into the inbox** rather than serve from the comfy output dir (scoping +
  lifecycle, above).
- **Poll at 1 s**, not `fs.watch` — polling is the robust choice here (same lesson as the
  port-open-while-wedged health check); a photo appearing ≤1 s late is invisible next to a
  30–60 s generation.
- **Mirror every pic**, including Telegram-originated ones — the GUI chat is the same
  conversation as Telegram (the text already is), so pics should be unified too.
- **`py_compile` + timestamped backups** of `pic_daemon.py` and `generate.py` before/after
  patching (same discipline as the M3 daemon patches). Additive change, Telegram path
  untouched → low risk. 18+ floor and content routing are not touched at all.

## The one real UX decision for you

When you reopen Terrarium, the GUI chat reloads its **text** history from the gateway
(last 40 messages). Images aren't in the gateway's history, so past pics won't reappear
unless Terrarium keeps its own small record and replays them.

- **Ephemeral** — a pic bubble shows only if the photo arrives while the app is open.
  Reopen → text history returns, but earlier pics are gone. Least code.
- **Persisted replay** — Terrarium archives recent manifests and, on connect, interleaves
  the last ~20 pics into the loaded history by timestamp. Reopen → recent pics still inline.
  A bit more code (a small on-disk ring + a merge-by-timestamp on connect).

I lean **persisted replay** — otherwise "pics in chat" feels broken the moment you restart.

## Out of scope for v1 (call out if you want any pulled in)

- Generating pics *from* a GUI button (still `/pic` text commands — same as Telegram).
- Full-size lightbox / save-as / re-send. (Click-to-open can come in M8d polish.)
- Showing generation progress (“painting…”) — v1 just shows the finished bubble.
