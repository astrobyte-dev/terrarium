# Per-character chats & galleries — feasibility spike

*Deliverable for the Tier-3 fork in `design-backlog.md`: confirm multi-session
behaviour on the gateway, and decide the Telegram relationship, before committing
the per-character epic. Investigated 2026-07-09. No code changed — findings only.*

## Question

Can each character have its **own chat (history) and gallery**, instead of every
character sharing the one `agent:main:main` session that is also the live Telegram
conversation?

## Findings

### 1. Gateway — ✅ multi-session is fully supported (not the blocker)

Verified against the installed gateway
(`AppData/Roaming/npm/node_modules/openclaw/dist`):

- **Key shape:** `classifySessionKeyShape` accepts `agent:main:<slug>` as a valid
  `agent` key (`session-key-*.js`). `toAgentStoreSessionKey` builds
  `agent:<agentId>:<rest>` for any custom `rest`, so `agent:main:linh`,
  `agent:main:maya`, … are all distinct, well-formed keys.
- **Lazy create:** `getOrCreateSession` (`acp-cli-*.js`) creates a session on first
  use — a novel key is never rejected, it just spins up a fresh event ledger.
- **Shared agent, separate history:** every `agent:main:*` session runs the **same
  `main` agent** — same system prompt, same `AGENTS.md` (all character cards), same
  tools. Only the *conversation history* is per-session. So each session can `/be`
  a different character independently, and workspace **memory files stay shared**
  (partial cross-chat continuity for free).
- Our own `createChatClient` already parameterises `sessionKey`
  (`core/src/chat/client.ts`) — the plumbing to open a second session exists today.

**Conclusion:** the gateway can host one session per character right now.

### 2. pic_daemon — ❌ this is the real blocker

`~/.openclaw/workspace/skills/comfyui-imagegen/pic_daemon.py`:

- It tails **every** transcript file indiscriminately (`transcript_files()` globs all
  `*.jsonl`) into **one global** `state["character"]`, set by the last `/be` seen in
  *any* session (`pic_daemon.py:650`).
- A `/pic` in *any* window renders that single global character. With two live
  per-character chats, whoever `/be`'d last wins globally → a `/pic` in Maya's window
  could render Linh. (Confirmed in `daemon_state.json`: a lone global
  `"character": "dirty-girl"`.)
- Delivery is hardwired: `mirror_to_inbox(... sessionKey=GUI_SESSION_KEY)` with
  `GUI_SESSION_KEY = "agent:main:main"` (`pic_daemon.py:438`). Every pic is tagged to
  `main`, so the GUI can't route a photo to the character that asked for it.
- The daemon tails by **file UUID**, and has no `file → sessionKey` map, so today it
  literally can't tell which session a `/pic` came from.

**To unblock, the daemon needs:** (a) per-transcript active-character tracking
(a `{transcript_file: character}` map instead of one global), (b) a
`transcript_file → sessionKey` mapping so it can (c) route delivery per session
(`mirror_to_inbox` tags the originating `sessionKey`; the GUI files each pic under the
right character's chat + gallery).

### 3. Telegram divergence — a product decision, not a technical one

Telegram rides `agent:main:main` (or a per-peer key). A per-character GUI session
(`agent:main:linh`) is a **different transcript**, so:

- In-app character chats will **not** appear on Telegram, and Telegram's line won't
  appear in them. Shared workspace memory gives *some* continuity, but the turn-by-turn
  history is separate.

**Recommendation:** keep `main` as the Telegram-shared line (unchanged), and make the
per-character GUI chats **separate** `agent:main:<slug>` sessions that intentionally do
**not** sync to Telegram. The app becomes the place for isolated per-character
histories; Telegram stays the single "main" thread. This is the lowest-surprise split
and needs no gateway changes.

## Verdict & sequence

The epic is **viable**, and it's gated on a **daemon refactor**, not the gateway.
Recommended order when we pull it from the backlog:

1. **Daemon: per-session character + routed delivery** — `{file: character}` tracking,
   `file → sessionKey` map, `mirror_to_inbox` stamps the originating `sessionKey`.
   *Backend-only; nothing visible changes for the current single chat.*
2. **GUI: per-character sessions** — the character rail opens/selects an
   `agent:main:<slug>` session; ChatScreen shows that session's own history. `main`
   stays the default "shared with Telegram" view.
3. **Per-character galleries** — largely falls out for free: the M8c manifest already
   tags every pic with `character`, `prompt`, and params, so once delivery is routed,
   the gallery is a filtered view + the existing "re-fire this prompt" path.

**Risk to watch:** the daemon is the same process that serves Telegram `/pic`. Any
refactor must keep the global/`main` path working exactly as today (Telegram users see
no change) — do it additively (per-session map *falls back* to the global character
when a session has no `/be` yet), and restart via `pythonw pic_daemon.py` per the usual
daemon-edit dance.
