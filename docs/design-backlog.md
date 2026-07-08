# Terrarium — GUI design backlog

*Corey's feature ideas, triaged 2026-07-09. Ordered by value ÷ effort ÷ risk, with
dependencies called out. Nothing here is committed; this is the queue to pull from.*

Design bar for all of it: **thoughtful, never tacky** (see the GUI design direction memo).
Each visible item gets a real design pass + sign-off before build — same as every screen so far.

---

## The one architectural fork that gates several ideas

OpenClaw is **single-agent**: every character is a `/be` persona sharing ONE session and
memory (`agent:main:main`), which is also the live Telegram conversation. Ideas that assume
"each character = its own chat with its own history/gallery" therefore need a **feasibility
spike** first:

- The gateway persists multiple session files, so per-character session keys
  (`agent:main:<slug>`) are probably viable.
- But `pic_daemon` tracks the active character **globally** (one `daemon_state`), so
  per-session chats would confuse it — the daemon would need per-session character tracking,
  or the GUI must always re-assert `/be <slug>` on that session before a `/pic`.
- And non-`main` character chats would **diverge from Telegram** (Telegram stays on `main`).
  That's a product call: is a character's GUI chat the same convo as Telegram, or its own?

**Spike deliverable:** confirm multi-session behaviour on the gateway + decide the Telegram
relationship, before committing the per-character epic. Small, do it before Tier 3.

---

## Tier 1 — cheap delight, pure renderer, no backend risk

Do these in a single "chat polish" pass; several can ride along with M8c since it already
opens ChatScreen.

1. **Different bubble colours for user vs bot.** Trivial — ChatScreen already tags
   `.msg-row.user`/`.assistant`; just distinct tokens per theme. *Effort: XS. Deps: none.*
2. **Typing-peek avatar (Snapchat-style).** The character's avatar peeks in while you type.
   Pure CSS/animation. *Effort: S. Deps: per-character avatar asset (#8) for the real image;
   can ship first with the bot-initial disc already in use.*
3. **`/command` buttons behind an expandable popout.** A tidy command palette (⌘-style) that
   inserts/sends `/pic`, `/pic?`, `/be`, `/hd`, `/again`, `x3`, `anime`, `/pic!` — hidden until
   opened so it never clutters. Onboards new users off memorised commands. *Effort: S–M. Deps:
   none (commands are known). Synergises with per-image buttons (#5) and the character rail (#7).*

## Tier 2 — self-contained features, medium effort

4. **Per-image action buttons (redo · variation · x3 · hd).** Buttons on each generated
   bubble mapping to daemon commands: redo=`/again`, hd=`/hd`, x3=re-`/pic` with `x3`,
   variation=re-`/pic` same prompt/new seed. **Requires the image's prompt to be known to the
   GUI** → captured by the M8c manifest change below. High perceived value. *Effort: M. Deps:
   M8c manifest carries `prompt`+`character`+params (do now).*
5. **Delete + multi-select + clear chat.** Split by cost:
   - *Clear chat* = start a fresh session (`/new`) — already the proven fix for poisoned
     history; a real gateway action. *Effort: S.*
   - *Delete an image* = remove its inbox PNG + drop the bubble. Clean with the M8c inbox.
     *Effort: S.*
   - *Delete a text message from the real gateway history* = **hard** (needs gateway edit
     support or risky jsonl surgery the daemon tails). v1 = hide-from-view only; be honest it
     doesn't rewrite history. *Effort: M and partial.*
   - Multi-select is renderer state over the above. *Effort: S once the singles exist.*
6. **Bot-builder AI assist + SFW/NSFW presets.** "Draft this for me" buttons that fill
   look/vibe/backstory from a short seed (local Ollama, like the daemon's caption calls), plus
   SFW/NSFW starter prompt templates. Standalone, no chat dependency; the 18+ floor stays hard.
   *Effort: M. Deps: a core `draftBotSection` helper.*
7. **Character rail (select instead of `/be`) + per-character avatars.** A permanent sidebar
   of characters (read `~/.openclaw/workspace/characters/*.md`); clicking sets the active
   persona. Each character (and the user) gets an avatar the user can change — including
   **setting a generated pic as the avatar** (nice synergy with the gallery). *Effort: M for
   the rail + avatars as a persona SELECTOR on the single shared session. Effort jumps to L if
   "each character = its own chat" — that's the Tier-3 epic, not this.* Ship the selector +
   avatars first on the shared session; separate chats come later.
8. **PIN-lock a chat.** Gate a chat view behind a hashed PIN. *Effort: S.* Honest caveat:
   this is **soft** privacy — data is still plaintext on disk; real privacy = encryption at
   rest (much bigger). Ship as a screen-lock, label it as such.

## Tier 3 — the per-character epic (needs the spike above first)

9. **Per-character live chats.** Each character its own conversation/history. Depends entirely
   on the multi-session spike + the Telegram-divergence decision. *Effort: L.*
10. **Per-character image galleries.** Each character's pics in its own deletable gallery, with
    **revisit → reroll / variation**. The M8c manifest already tags each image with its
    `character`, `prompt`, and params, so the *data* exists from day one — this is the UI +
    a "re-fire this prompt" path. Pairs with #4. *Effort: M–L. Deps: manifest capture (now),
    ideally the character rail (#7).*

## Tier 4 — largest standalone project

11. **Phone QR → live chat web portal (bedtime chat).** A QR that opens the chat on your phone
    over the local network. Biggest piece and security-sensitive: needs a LAN-bound web server
    (not the current localhost-only gateway), auth/token in the QR, firewall + pairing, and the
    chat working in a mobile browser (the gateway's bundled WebChat channel is the natural base).
    **Reuses the M8c inbox/delivery abstraction** for pics to the phone. Best as its own project
    after the per-character work. *Effort: XL. Deps: web-serving layer, auth, WebChat channel.*

---

## What to bank NOW during M8c (cheap now, expensive to backfill)

The M8c inbox manifest should record, per delivered photo: **`prompt`, `character`, and the
generation params** (`anime`/`noob`, `strict`, `count`). No UI cost today, but without it every
pic generated before the change is un-rerollable and un-galleryable. This single amendment
unblocks #4 (per-image actions) and #10 (galleries) later. Folded into `docs/m8c-design.md`.

Optional ride-alongs while ChatScreen is already open for M8c: bubble colours (#1) and the
bot-initial typing peek (#2, without the custom avatar yet). Everything else is cleaner as its
own pass.

## Rough recommended sequence

M8c (pics in chat, + manifest capture) → chat-polish pass (#1, #3, #4, #2) →
clear/delete (#5) → bot-builder assist (#6) → character rail + avatars selector (#7, #8) →
**spike** → per-character chats + galleries (#9, #10) → phone portal (#11).
