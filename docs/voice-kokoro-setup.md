# Voice notes — Kokoro TTS engine (setup)

The Terrarium GUI code for voice notes is in-repo (`packages/gui/src/main/voice.ts` +
`VoicePicker` / the chat 🔊 button). The **engine itself lives outside git**, in the
openclaw workspace, same as the ComfyUI pipeline. This doc reproduces it on a fresh box.

## Why Kokoro / CPU-ONNX
Chosen for QoL roadmap #3. **CPU/ONNX so it never touches the 12 GB GPU** — voice never
contends with ComfyUI. ~50 built-in preset voices (US/UK, ♀/♂); each character is assigned
a preset (no cloning). Renders a short reply in ~2.4 s cold (most of that is model load).

## Location
`~/.openclaw/workspace/skills/voice-kokoro/`
- `venv/` — Python **3.10** venv (base `…/Programs/Python/Python310`). 3.14 is too new for the wheels.
- `kokoro_tts.py` — the engine: text → `.wav`, `--voice <preset|blend>`.
- `voices.json` — the preset catalogue the GUI shows (id, label, gender, accent) + `default`.
- `voice_map.json` — `{ <be-slug>: <preset id> }`, written by the per-character picker.
- `kokoro-v1.0.onnx` (~310 MB) + `voices-v1.0.bin` (~27 MB) — model files (git-ignored, re-downloadable).
- `out/` — cached renders (`<hash>.wav`), served over `terrarium://voice/`.

## Reproduce
```sh
KDIR=~/.openclaw/workspace/skills/voice-kokoro
"C:/Users/<you>/AppData/Local/Programs/Python/Python310/python.exe" -m venv "$KDIR/venv"
"$KDIR/venv/Scripts/python.exe" -m pip install --upgrade pip
"$KDIR/venv/Scripts/python.exe" -m pip install kokoro-onnx soundfile "misaki[en]"
# models (GitHub release model-files-v1.0):
curl -sSL -o "$KDIR/voices-v1.0.bin"  https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
curl -sSL -o "$KDIR/kokoro-v1.0.onnx" https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
# smoke test:
"$KDIR/venv/Scripts/python.exe" "$KDIR/kokoro_tts.py" --text "hey you" --voice af_bella --out "$KDIR/out/test.wav"
```
Note: `misaki[en]` pulls spaCy + a CPU torch (~120 MB) for G2P, and `espeakng-loader`
provides the espeak-ng binary — no manual espeak install needed. All CPU; **no VRAM**.

## How the app uses it
- `voice:say(text, slug)` → main strips emoji, hashes `(voice+text)`, reuses the cached
  `.wav` or spawns `kokoro_tts.py`, returns `terrarium://voice/<hash>.wav`.
- Voice per character = `voice_map[slug]` (from the Characters screen picker), else `default`.
- The engine is optional: if the venv/model is absent, `voice:catalog().ready` is false and
  the UI hides voice controls; `voice:say` returns `{ ok:false }` gracefully.

## Caveats / next
- Accents are US/UK only — no true Aussie/Vietnamese match (that needs cloning: chatterbox/XTTS).
- Cold render reloads the 310 MB model each spawn (~1.5 s of the 2.4 s). For the auto-voice
  toggle (roadmap v2) add a **persistent worker** so subsequent notes are ~0.3 s.
- Output is `.wav` (GUI playback). Telegram voice notes would need `.ogg/opus` (ffmpeg) later.
- `--voice` also accepts a blend, e.g. `af_bella:0.6,af_sky:0.4`, for semi-custom voices.
