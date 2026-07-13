# Terrarium — Intimacy features (foot-first, kink-extensible)

*Design pass, 2026-07-13. Adult (18+) companion, fictional adult characters. Everything
keys off the per-character **kink profile** already shipped (KinkProfile.tsx → folds into
her hard rules), and generalises to other kinks (spit, etc.) through the same profile +
preset + prompt machinery — new vocabulary, no new architecture.*

The thesis: take **one desire seriously** and wire it through the things Terrarium already
has that competitors don't combine — persistent kink memory, "she texts first"
proactivity, reference-locked generation, and voice. Video is **deferred** (LTX is its own
project).

---

## Build order

1. **Slow tease (P1)** — app-side, no daemon/gateway changes. *This doc's main decision.*
2. **Kink chips + focus/wardrobe presets** — Bot Builder photo pipeline. Prerequisite data
   (she must *know* she's into feet/spit) + a fast, self-contained win.
3. **Foot-lock** — reference-consistent feet; extends `core/render/face-workflow.ts`.
4. **Kink-aware proactive drops + rituals** — extends `proactive/decide.ts` + gateway `cron`.
5. **Preference-learning loop** — reactions → memory → biased prompts.

---

## 1 · Slow tease (PRIORITY 1)

**Key insight:** a spicy `/pic` already takes ~1 min to render. That latency (or a
deliberate hold) *is* the tease window — we don't fight it, we dress it. Fully app-side:
`inbox.ts` already fires when a pic lands, and `voice.ts` can speak a line. No changes to
the pic daemon or gateway.

Three mechanic options (the fork to decide):

- **A — Blur-reveal (lowest risk, ship first).** The pic arrives blurred under a tease
  caption ("mmm… you sure you're ready? 👀"); it auto-unblurs after a beat, or on tap.
  Pure renderer change over the inbox delivery. Caption templated from her kink profile.
- **B — Voice-first orchestration (richest).** On a spicy pic, the app asks the brain for a
  1–2 line tease, shows it + auto-speaks it via Kokoro, *then* the pic reveals on delivery.
  Touches chat orchestration (an extra brain round-trip) + voice; best payoff.
- **C — Typing-tease.** During the render, show her "typing…" with streamed tease lines,
  then reveal. Middle ground.

**Recommended path:** ship **A** now (self-contained, immediate feel), then layer **B**'s
voice + brain line on top as v2. C folds into A/B as a presentation detail.

Hook points: renderer `ChatScreen` (hold + blur + reveal), a "tease mode" toggle, tease
lines keyed to the kink profile. Later (B): `chat.ts` for the tease-line round-trip +
`voice:say`.

---

## 2 · Kink chips + focus / wardrobe presets

- Extend `KinkProfile` INTO list: **feet, soles, toes, pedicure, worship** (+ **spit,
  drool** and others for the extra-kinks pass). These are the signal every later feature
  reads.
- Bot Builder photo pipeline gains a **Focus** control (feet-forward, POV-in-lap,
  over-the-shoulder, dangle) and a **foot wardrobe** (polish colour, anklet/toe-ring,
  barefoot / socks / heels / sandals). Composes into the `/pic` prompt like the existing
  appearance composers; her favourites get remembered.

---

## 3 · Foot-lock (reference-consistent feet)

Every companion app re-rolls different feet every generation — the immersion-killer for
this kink. We already do **face-lock** (IPAdapter PLUS FACE + FaceDetailer off
`refs/<name>.png`). Mirror it for feet:

- Optional **foot reference** `refs/<name>-feet.png` (or a stored foot descriptor: toe
  ratio, arch, sole, default polish).
- A **FootDetailer** pass (SEGS detector on feet) analogous to FaceDetailer, run only when
  the shot involves feet, reusing the already-loaded checkpoint so VRAM stays under the
  12 GB budget (no second model resident).
- Result: *her* feet, consistently.

Lives in `core/render/face-workflow.ts` (+ the workspace `generate.py` mirror).

---

## 4 · Kink-aware proactive drops + rituals

She already texts first (`proactive/decide.ts` + `main/proactive.ts`). Gate a kink-tailored
opener on: kink profile contains feet/spit **AND** idle/waking-hours allow **AND** positive
engagement history. Occasionally she initiates ("heels off, feet are wrecked 🦶 wanna
see?") with an optional pic. **Rituals** via the gateway's native `cron.add` (goodnight
foot pic, "fresh-pedi Friday"). Reactive apps can't do this; the desire lives in memory.

---

## 5 · Preference-learning loop

On a positive reaction (save / ❤ / "more like this"), write the *specifics* to her memory
("red toes, soles, high arch, POV-in-lap") and bias future `/pic` prompts toward them. Over
weeks she converges on *your* flavour of the kink, not just the category. Reuses the
memory system + the prompt composer.

---

## Extra kinks (spit, …)

No new architecture: add chips to the kink profile, prompt tokens to the composer, and
tease templates. The slow tease, proactive drops, and learning loop all read the same kink
profile, so a new kink lights up across every feature for free.

---

## Deferred

- **Video (LTX)** — motion is huge for this kink, but it's a separate project. Park it.
