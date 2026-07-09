# Terrarium — QoL & competitive roadmap (benchmarked vs Kindroid)

*A "have a good think" pass across engine, GUI, and pipeline, 2026-07-09. Grounded in the
actual hardware (RTX 4070 / 12 GB, 31 GB RAM, cloud ArliAI brain). Nothing here is
committed — it's the vision to pull from, same as `design-backlog.md`.*

## The hand we're actually holding

Terrarium's architecture is unusual and, read correctly, a **strength** against Kindroid:

- **Brain is CLOUD (ArliAI), uncensored.** Intelligence, memory, personality, proactivity —
  none of it is VRAM-bound. It scales with the cloud model, not the GPU. This is why most of
  the highest-impact features below are *cheap*.
- **GPU is LOCAL (RTX 4070, 12 GB).** Private images + voice that never leave the machine —
  something Kindroid *can't* offer. But 12 GB is the whole ballgame: ComfyUI alone sits at
  ~9 GB resident, so **everything GPU-side must serialise** (image OR video OR voice, not all
  at once). The voice system's existing "ComfyUI VRAM handoff" is the template for that.
- **Local vision model** (`qwen2.5vl:3b`) already does captions + persona drafting for free.

**Net:** where we lose to Kindroid is mostly *presence, continuity, and polish* — not raw
capability. Where we already win: uncensored brain, and fully-local (private) media.

## Honest gap analysis vs Kindroid

| Capability | Kindroid | Terrarium today | Gap / cost to close |
|---|---|---|---|
| Selfie appearance consistency | strong | strong (IPAdapter face-lock + FaceDetailer) | **at parity / ahead** |
| Uncensored / adult | limited | yes | **we win** |
| Private (local) media | cloud | local | **we win** |
| Voice calls / voice notes | realtime calls | built but parked | big leap, medium VRAM |
| Proactive "texts you first" | yes | no | medium value, **near-zero VRAM** |
| Editable memory / journal | central feature | daemon extracts it, but it's hidden | medium value, **near-zero VRAM** |
| Time / presence awareness | yes | partial | cheap |
| Mood / emotional state | yes | none surfaced | cheap |
| Response controls (length, regen, edit) | yes | partial | cheap, GUI-side |
| Short video selfies | yes | none | big, **VRAM-hungry** |
| Group chats (multiple companions) | yes | gated on per-character epic | see spike doc |

## Roadmap, prioritised by value ÷ VRAM cost

### Tier 1 — "make her feel alive" · near-zero VRAM (cloud brain + local files)
These are the cheapest big wins because they never touch the GPU.

1. **Proactive messages — she texts first.** A scheduler (extend `pic_daemon`, or a small new
   service) that on idle + time-of-day + mood composes an opener via the brain and pushes it to
   the chat (the GUI already has the unread badge; Telegram already has `send_text`). *Investigate
   the cleanest inject path — daemon-composed vs a gateway self-prompt.* Single biggest "it's
   alive" upgrade for the least GPU.
2. **Time & presence awareness.** Inject real clock + "last seen 3h ago" + day/night into the
   system prompt each turn. Tiny change, transformative realism (she knows it's 2am, or that you
   vanished for a week).
3. **Editable Memory panel (the Kindroid signature).** The daemon *already* extracts facts about
   you and writes daily notes — surface it per-character as "what she remembers": view, **pin**
   (always in context), edit, forget. We generate the data today; it's just invisible.
4. **Mood / emotional state.** A lightweight per-character mood that drifts with the conversation,
   colours her tone, and tints her avatar ring in the GUI. Cheap, and it makes her feel reactive.
5. **Response controls.** Length/chattiness slider, "regenerate", "continue", edit-and-resend.
   Pure GUI + gateway; standard companion-app table stakes.

### Tier 2 — Voice · the biggest single leap · medium VRAM (handoff already solved)
6. **Voice notes in the GUI.** Re-enable the parked chatterbox engine and play her `ogg` replies
   inline as chat bubbles. ~5-min re-enable (see `voice-tts/DEACTIVATED.md`) + a GUI player.
7. **Voice-call mode ("walkie-talkie").** Local Whisper STT → brain → TTS, push-to-talk. Not true
   realtime on one 4070 (GPU serialises), but a real, shippable feature — and closer to Kindroid's
   headline than anything else.
8. **TTS quality fork.** Chatterbox clones voices but its prosody wobbles (why it was shelved).
   Evaluate **Kokoro** (82M, CPU-capable, clean prosody, *no* cloning) for instant chatty voice
   notes, keeping chatterbox for when a *cloned* voice matters. Possibly run both: Kokoro default,
   chatterbox on request.

### Tier 3 — Image bells & whistles · moderate VRAM (model already loaded)
9. **Wardrobe & scene presets.** Outfit / background / pose libraries in the composer — one-tap
   "same girl, new outfit/scene." Leans on the consistency we already have.
10. **In-chat image editing.** Inpaint ("change her outfit", "make it night") + a variation grid.
    Extends the existing Redo/×3/HD pic-actions.
11. **Generated pic → persistent avatar.** Set any gallery photo as her avatar (backlog #7 synergy).

### Tier 4 — the flashy, VRAM-hungry dream
12. **Short video selfies.** **LTX-Video** is the realistic 12 GB path (fast, short clips);
    AnimateDiff/SVD are heavier. Requires aggressive VRAM juggling (unload the ComfyUI checkpoint,
    serialise against voice). Prototype behind a "this will pin your GPU for ~N s" warning — treat
    as a one-at-a-time luxury, not always-on.

## Engine-level bets (cross-cutting)

- **Streaming responses.** Token-by-token in the GUI is the single biggest "feels alive" upgrade
  after proactivity. *Check whether the gateway can stream `chat.send`;* if so, wire it through.
- **Memory that scales.** Move from flat daily-notes to a small **retrieval layer** — embed
  memories locally (a tiny embed model), recall only the relevant ones per turn — so a months-long
  relationship stays coherent without blowing the context window. Underpins Tier-1 #3.
- **Model tiering.** A smarter ArliAI tier for emotional depth, a fast tier for banter; a small
  *local* fallback when ArliAI is down/offline so she's never fully dead.
- **Per-character epic** (already spec'd in `per-character-spike.md`) — unlocks group chats +
  per-character galleries/journals. Gated on the pic_daemon per-session refactor.

## Hardware reality check (the honest constraints)

- **12 GB VRAM is the ceiling.** ComfyUI resident ≈ 9 GB. You cannot run a big local LLM +
  ComfyUI + TTS at once — GPU work must serialise. Every GPU feature should assume it's borrowing
  the card and hand it back (the voice handoff is the pattern to copy).
- **Brain is cloud → Tier 1 is cheap.** Memory, proactivity, mood, longer context, group chat all
  scale with ArliAI, not the 4070. Spend the "free" wins there first.
- **Video bites hardest.** Keep it serialised and opt-in; never let it collide with a `/pic` or a
  voice call.
- **31 GB RAM is comfy** for model offload/swap between the serialised GPU tasks.

## Recommended first pull

Highest value ÷ effort ÷ VRAM: **Tier 1 #1 (proactive) + #3 (memory panel)** to make her feel
alive and continuous, then **Tier 2 #6 (voice notes)** as the flashy quick win off already-built
code. That trio alone closes most of the *felt* gap to Kindroid without touching the VRAM budget
in anger.
