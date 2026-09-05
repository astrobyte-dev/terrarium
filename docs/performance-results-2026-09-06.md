# Performance upgrade — 6 September 2026

The installed backend now uses Venice Gemma 4 Uncensored for primary chat, with local Dolphin first in the fallback order and existing ArliAI retained after it. A shared inference coordinator manages local GPU work and Venice spending. The desktop build adds current-gateway streaming support, image presets, character memory controls, and a Venice allowance display. The old application can stay open until the user saves their draft and quits from the tray; the desktop shortcut will open the updated version afterward.

This is a measured improvement on this PC, not evidence of superiority over every commercial service. Content and quality checks used neutral adult companion dialogue and clothed adult portraits. The existing adult NSFW model choices remain available; refusal behavior still depends on the chosen model.

## Hardware and adopted settings

- Ryzen 5 7600, RTX 4070 with 12,282 MiB VRAM, 32 GB RAM.
- Ollama 0.32.5: Flash Attention enabled, q8_0 KV cache, one parallel request, one loaded model. Main local chat uses 16K context; small helpers choose 4K or larger based on input size, with bounded output and 20-second retention.
- Live ComfyUI: `C:\ComfyUI`, Python 3.14.3, Torch 2.11.0+cu128. Startup uses `--reserve-vram 1.5 --cache-ram 6`. This cache option means a RAM-headroom threshold, not a six-gigabyte hard memory limit.
- A stranded runner from the old Ollama process, using about 7.6 GiB RAM and a 40K context, was stopped after confirming its parent had exited. Later image measurements exclude it.

The coordinator waits for accepted ComfyUI jobs to finish before giving the GPU to local chat. It unloads Ollama before image jobs and frees ComfyUI models before local inference. Interactive requests precede queued background helpers. Hosted chat can run while the GPU renders. Programs bypassing the coordinator are outside its mutual-exclusion guarantee, although it also observes ComfyUI's direct queue.

## Chat measurements

Two short direct-provider tests used a character-voice prompt and a corrected-fact recall prompt. They are small samples, not p50/p95 estimates or a full intelligence evaluation.

| Provider/model | First visible text in direct tests |
| --- | --- |
| ArliAI Gemma 4 31B | 1.02–6.29 seconds initially; later requests returned HTTP 403 |
| Venice Uncensored 1.2 | 0.65–0.97 seconds |
| Venice Role Play | 0.69–0.74 seconds; the recall answer was unusually terse |
| Venice Gemma 4 Uncensored | 0.50–0.67 seconds |

Venice Gemma was selected on latency, useful recall, and its lower listed API rate. Three Venice models are available in Brains. The actual gateway originally rejected Venice's broad tool payload; companion-model metadata now omits those schemas, and the coordinator maps `max_completion_tokens` to the provider's accepted `max_tokens`. App commands continue through their existing handlers.

The gateway's current stream format nests text under `message.content` and marks completion with `state: final`. The app now handles that format, including cumulative replacements and stable run IDs. It waits up to five seconds between fallback history reads and wakes immediately for final reconciliation. Earlier validation took about 12 seconds to visible text. After these changes, two gateway checks took **6.17 and 5.56 seconds** to visible text, with **7.35 and 6.69 seconds** through final history verification. Both verified that Venice, rather than a fallback, produced the reply. Gateway preparation still adds several seconds; direct API latency must not be advertised as end-to-end app latency.

Ordinary companion turns replace framework-heavy system text with the active personality, bounded memory retrieval, and scene state. A measured system prompt fell from 28,471 to 7,697 characters, about **73% smaller**. Tool-bearing conversations bypass this compaction to preserve tool sequences.

Local tests observed roughly **80–89 output tokens/second** for Dolphin and Qwen 3 8B, and **75–77** for Qwen 3.5 9B. Qwen 3.5 had a slow cold start, so Dolphin remains the local fallback. Context sizes and load state differed from the initial baseline; these numbers do not establish a controlled percentage speedup from Flash Attention alone.

## Image measurements and controls

All four tests used the same neutral adult portrait prompt and seed 42. Node-result caches were cleared between presets so Balanced could not reuse Quality's finished image. Models could remain warm. The comparison did not use a face reference, automatic upscale, Telegram delivery, or caption generation.

| Preset | Render and download | Peak sampled VRAM | Peak sampled system RAM |
| --- | ---: | ---: | ---: |
| Quality | 23.36 s | 9,799 MiB | 24,780 MiB |
| Balanced | 14.96 s | 8,039 MiB | 24,710 MiB |
| Preview | 8.13 s | 7,814 MiB | 24,750 MiB |
| Lightning | 4.64 s | 7,750 MiB | 24,666 MiB |

These sampled peaks left at least 2,483 MiB VRAM in this run. Short peaks between one-second samples may be missed. Cold checkpoint loads, reference conditioning, other applications, and different subjects change the timings. Earlier runs affected by concurrent jobs, an orphaned runner, or cached outputs were excluded from this table.

A later face-reference trial was interrupted after a separate `sdxl_train_network.py` LoRA training process began using the GPU. It provides no valid isolated face-lock timing. That training was left running and further GPU benchmarks stopped. The coordinator now declines new local inference while it detects a known LoRA training process, with an explanatory error; hosted chat remains available. It cannot stop an external program starting after its check or identify every possible GPU workload. Interrupted renders now report failure instead of being described as successful empty images.

- **Balanced** is the default preset. It omits the hand-detail pass and respects the existing detailer and face-lock switches. The user's detailer switch was already off and remains off.
- **Preview** uses 768×1024 and 18 base steps, omits detailers, and skips automatic upscale.
- **Quality** retains the original face/hand detail workflow when detailers are enabled.
- **Lightning** uses the official four-step SDXL-Lightning checkpoint with Euler, `sgm_uniform`, and CFG 1. It is a separate experimental look and does not use face locking. Its anatomy, identity consistency, and adult-content suitability are not guaranteed to match the existing specialized checkpoints.

Completed images now publish locally before captions, optional upscale, or Telegram. Captions update the same image message and gallery entry. Failed external delivery is queued for three bounded retries without rerendering; ambiguous network failures may still cause duplicate external delivery. New image metadata records seed, preset, and scene. A previous speckle-producing Hyper LoRA remains disabled.

An adolescent/underdeveloped descriptor conflict was removed from the shared image settings. Companion image prompts and parsed character cards now require adult subjects. No explicit image was generated for validation.

## Memory and scene controls

Use `/remember My dog is Pip` for a note associated with the active character. The Memories panel displays those notes and can forget them. Its existing editable pinned list contains shared user facts. Retrieval selects at most eight relevant/pinned bullet memories and labels their source; ordinary fictional dialogue is not automatically promoted by this new layer into durable facts. The existing daemon's learned-fact feature remains separate.

Use `/scene At the cafe`, `/wardrobe Blue sweater`, and `/pose Sitting at the table` for structured scene fields. Chat and the image daemon read the same per-character state. A recognized `/be` boundary removes previous-character dialogue from model input. This is context separation inside the existing shared gateway session, not a new independent transcript/database for every character. Conflicting notes can still need manual correction; this is bounded keyword retrieval, not a full semantic memory system.

Diagnostic sessions are excluded from the daemon's memory observer. Diagnostic markers written during initial validation were removed with backups.

## Venice costs

The supplied key is stored in Windows DPAPI. The coordinator supplies it at request time; configuration contains only a coordinator placeholder.

**The Terrarium Venice cap is US$1 total, without automatic reset.** It applies to requests through this coordinator, not all usage on the Venice account. Requests reserve a conservative input/output allowance before dispatch and reconcile to returned token usage. Failed or interrupted requests without usage can retain a reservation, so the displayed counter is not an invoice or account balance. At the cap, the gateway can use its configured fallback. Do not delete the ledger to conceal or reset spending.

API requests consume API credits/balance. A Venice chat subscription does not imply unlimited free API access. No subscription change, balance top-up, or automatic recharge was enabled. The initial short provider comparison reported approximately US$0.00027 of Venice token usage; later gateway validation added further small usage and conservative reservations. Current accounting is visible in Brains and the coordinator's `/health` response. [Venice pricing](https://venice.ai/pricing), [chat API](https://docs.venice.ai/api-reference/endpoint/chat/completions).

## Hugging Face review

- Installed **Huihui Qwen 3.5 9B abliterated**, using the publisher-linked Ollama tag `huihui_ai/qwen3.5-abliterated:9b`. Tested with `think: false`; slower cold starts make it optional. [Publisher model card](https://huggingface.co/huihui-ai/Huihui-Qwen3.5-9B-abliterated).
- Installed official **SDXL-Lightning four-step full checkpoint**, pinned to revision `c9a24f48e1c025556787b0c58dd67a091ece2e44`. Its SHA-256 matches publisher LFS metadata: `e0d996ee0013e79d9d3561f50fcafb9a17e3ff07b780358e3b66d67932c4d490`. [Model card and sampler instructions](https://huggingface.co/ByteDance/SDXL-Lightning).
- Reviewed **Z-Image Turbo**. Its documented full workflow targets more VRAM than this 12 GB shared-GPU setup comfortably provides. It was not installed as another default or presented as a proven upgrade. A quantized/offloaded workflow would need its own quality and latency evaluation. [Model card](https://huggingface.co/Tongyi-MAI/Z-Image-Turbo).
- Reviewed **SageAttention**. It requires compatible Triton/CUDA components; a supported installation on the current Windows/Python 3.14/Torch 2.11 stack was not established. No attention-kernel or Torch replacement was applied. Its kernel benchmarks are not whole-image speedups. [Official project](https://github.com/thu-ml/SageAttention).
- Speculative decoding and larger dense local models remain unadopted experiments: extra draft-model memory and integration costs are unproven benefits here. [llama.cpp speculative decoding](https://github.com/ggml-org/llama.cpp/tree/master/examples/speculative).

## Reproduce, files, and rollback

Final checks passed: TypeScript typechecking; 381 unit/integration tests; five Python adapter tests; twelve desktop checks against the packaged preload/renderer; package creation and staged-archive checksum verification. The latest read-only live check confirmed Venice availability, the US$1 allowance, local-first fallback ordering, and no stale model override on the existing conversation. It accounted for about US$0.04090 including retained reservations, leaving about US$0.95910 of the app allowance. This is not a billed-usage total. The separate training process was no longer detected at that final check; training-conflict rejection is covered by the coordinator test.

From the repository:

```powershell
npm run typecheck
npm test
npm run test:desktop
C:/Python314/python.exe scripts/test-performance-adapter.py
npx tsx scripts/validate-tuned-chat.ts
npx tsx scripts/benchmark-images.ts
npx tsx scripts/verify-performance-models.ts
```

Live benchmarks create test sessions or images and can consume a small amount of API credit. They do not intentionally send Telegram messages. The Python delivery-order test mocks external delivery.

Settings, accounting, and measurements live in `%LOCALAPPDATA%\Terrarium`:

- `performance.json`: enablement, prompt compaction, local context, Venice cap.
- `venice-usage.json`: persistent conservative accounting; `performance.jsonl`: timing/token metadata only.
- `gen_settings.json`: presets and existing generation switches.
- `benchmarks\`: provider/local/gateway results, model checksums, and image outputs.
- `performance-backups\`: timestamped manifests and original files. The original main-config/Python snapshot is `2026-09-05T13-51-12-082Z`; cached model-registry and vision-file changes have their own first backups in subsequent manifests. Inspect the manifests before restoring. Later installs also back up the coordinator and adapter.

The hidden `Terrarium Inference` logon task starts the coordinator before use. Ollama user environment changes and the existing watchdog's ComfyUI arguments persist across restarts. The application supervisor also understands the coordinator service. The desktop build is staged in `%LOCALAPPDATA%\Programs\Terrarium-20260906` with Electron 44.2.0; the old Electron 33 installation and its open window remain available until the user quits it. Both use the existing `terrarium` user-data identity. The original desktop shortcut was backed up.

To undo the backend profile, stop active work, restore the desired manifest's existing-file backups to their listed original targets, then restart the gateway and image daemon. Restore `ollama-environment.json` values for the four Ollama user variables and restore the watchdog's `.bak.performance` copy. Disable the new coordinator task after the restored gateway uses direct provider endpoints. Added model files and benchmark artifacts can remain; rollback does not require deleting them. Restore the backed-up desktop shortcut to use the previous desktop installation. Keep current conversation/memory files rather than blindly replacing them with old snapshots.

Known limits: ArliAI later returned HTTP 403; no account entitlement or external-service fix was fabricated. Gateway preparation still contributes latency. The finite tests establish operation and a useful performance comparison, not universal model superiority, perfect recall, or guaranteed VRAM headroom for every workflow.
