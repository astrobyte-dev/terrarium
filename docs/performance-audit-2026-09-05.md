# Chat and image performance review

Reviewed 2026-09-05 on the actual PC and current working tree. This is an audit and implementation proposal, not a completed speed upgrade. No live settings, services, subscriptions, or models were changed. Existing uncommitted work was preserved. No paid inference or messages to Telegram were sent.

The recommended architecture is hosted primary chat, local image generation, and a local chat fallback. The user confirmed this approach and has an active Venice subscription. Venice should be compared with ArliAI before selecting a new default. A 12 GB GPU can provide an excellent personalized companion experience, but there is no evidence here that it can beat every commercial product in general intelligence or image quality.

## Observed hardware and runtime

| Item | Observation |
| --- | --- |
| GPU | NVIDIA RTX 4070, 12,282 MiB reported VRAM |
| CPU | Ryzen 5 7600, 6 cores / 12 threads |
| RAM | 32 GB installed; about 31 GiB OS-visible, about 15 GiB available during inspection |
| Storage | About 266 GiB free on C: and 263 GiB on G: |
| Primary chat | `arliai/Gemma-4-31B-it`, as read from the live config |
| Chat fallback | `ollama/dolphin3:8b`, Q4_K_M weights, approximately 4.92 GB on disk |
| Helper model | `mannix/llama3.1-8b-abliterated:latest`, Q4_0, approximately 4.68 GB on disk |
| Ollama | 0.32.5; global context 16,384; startup log says Flash Attention false and parallelism 1 |
| ComfyUI | 0.18.1, Python 3.14.3, PyTorch 2.11.0+cu128; live install is `C:\ComfyUI` |
| ComfyUI arguments | `--listen 127.0.0.1 --port 8188 --reserve-vram 1.0` |

Ollama reported no loaded models and ComfyUI reported an empty queue. Nevertheless, NVIDIA reported roughly 7.7–7.9 GiB VRAM occupied. Windows process counters attributed about 6.6 GiB of dedicated GPU allocation to the ComfyUI Python process. These counters are not additive physical-memory accounting: the desktop compositor also reported overlapping allocations. ComfyUI's own Torch allocator statistic was much smaller, so GPU scheduling must use actual free-device memory and verified release behavior rather than that allocator statistic alone.

The main session's saved prompt report contains 28,286 system-prompt characters, including 11,547 project-context characters and 6,582 skill-prompt characters. Skills are part of the prompt, not an additional amount to sum. The saved input-token counter is 8,669; this is a session report, not a measured per-turn latency or a precise token count for the system prompt alone. There is already streaming support in the client.

## Highest-value changes

1. **Deliver completed images immediately.** The live Python daemon generates and downloads every image, optionally upscales them, then calls `character_caption`, then sends to Telegram, and only then mirrors images into Terrarium. Captions use a separate 8B model with two possible 180-second request attempts. A finished picture can therefore remain invisible while an optional caption loads or times out. Publish each finished image to the local inbox first with a stable job/image ID; attach its caption later. External delivery should have its own retry state so a Telegram failure cannot hide a locally completed image. Keep captions off the image-display critical path.

2. **Give small helper tasks small contexts and output budgets.** `createOllamaChat` supplies neither `num_ctx`, `num_predict`, nor `keep_alive`. The daemon caps output and retains its model for 20 seconds, but also omits `num_ctx`. Both inherit the 16K global context. Start helper experiments at 4K context and task-specific output caps: about 96–160 tokens for a short caption, 256–512 for structured extraction, and a larger explicit budget for character drafting. Count input first and expand when necessary; do not silently truncate a character card. Keep helper settings separate from main-chat settings.

3. **Coordinate GPU ownership across the whole app.** Put local chat, drafting, vision, portraits, image jobs, and background memory work behind one shared scheduler. Explicitly release an idle local LLM before a render and release ComfyUI's resident models when local chat needs space. Do not unload anything during an active job. A 20-second keep-alive is not a resource lock, and a one-gigabyte ComfyUI reserve cannot guarantee room for an 8B LLM. Maintain approximately 1.5–2 GiB of measured headroom as an initial target, then adjust from observed peaks. Hosted chat can continue while the GPU renders. Defer background extraction while interactive work is pending.

4. **Reduce the prompt while improving memory.** Measure exactly which skills and workspace material are injected on ordinary chat turns. Keep stable personality instructions first, followed by selected durable memories, a compact current-scene summary, and recent messages. Load image/tool instructions when needed. Start with a proposed 2K–4K token budget for fixed instructions, then validate character fidelity. Preserve important memories before reducing local context: the live Dolphin entry currently requests 40,960 tokens, whereas the checked-in entry requests 24,576. Reconcile the actual request, runtime allocation, and catalog estimates before changing defaults.

5. **Make provider concurrency explicit.** Existing daemon comments document ArliAI collisions with the gateway. The GUI's model probe still makes real completion requests, and proactive chat shares the same gateway. Add a per-provider request queue so diagnostics and background work cannot consume the interactive slot. Use streaming for delivery and history polling for reconciliation; the current client polls every 1.5 seconds even though it receives streaming events. Polling improvements will not accelerate model inference, but can reduce redundant requests and completion-state delay.

## Local inference experiments

Test these in a controlled launch before adopting them as defaults:

```text
OLLAMA_FLASH_ATTENTION=1
OLLAMA_KV_CACHE_TYPE=q8_0
OLLAMA_NUM_PARALLEL=1
OLLAMA_MAX_LOADED_MODELS=1
```

Ollama documents that q8_0 KV cache uses roughly half the memory of f16, with model-dependent quality effects. It also documents model preloading, unloading, and the memory cost of parallel contexts. These are supported tuning controls, not measured speed gains on this PC. [Ollama FAQ](https://docs.ollama.com/faq)

The local log records a 2,048 MiB f16 KV cache at 16K context for the observed Llama-family load. At the same architecture and context, q8 would be roughly 1 GiB; at 4K context, roughly 256 MiB. This is cache-memory arithmetic, not a reduction in model weight size. Runtime buffers still need space. If Terrarium adopts an already-running Ollama server, changing its child-process environment alone will not apply the tuning to that server.

Retain an 8B quantized fallback initially. A 12B–14B quantized candidate is a later experiment with image models unloaded and measured headroom; larger dense models that require CPU offload are unlikely to serve the low-latency objective on this six-core CPU. Model size alone does not establish better character writing.

The blanket exclusion of every reasoning model should become a tested capability rule. Ollama supports `think: false` for supported models. Test the already-installed Qwen3 variant for non-thinking output, clean streaming, correct chat-template behavior, and memory fit before exposing it. Removing `<think>` text after generation does not save the computation already spent generating it. [Ollama thinking controls](https://docs.ollama.com/capabilities/thinking)

## Venice versus ArliAI

Venice's current official list includes `venice-uncensored-role-play`, `venice-uncensored-1-2`, and `gemma-4-uncensored`. These are useful candidates for a character-writing comparison; the documentation labels them uncensored, but that label is not evidence of superior quality or zero refusals. Resolve current IDs and account availability through its models endpoint when implementing. [Venice text models](https://docs.venice.ai/models/text)

The current pricing page lists 100 monthly credits on Pro, 7,500 on Pro Plus, and 22,500 on Max, with 100 credits equal to US$1. It separately describes API access and limits. Older API documentation still mentions a one-time Pro credit grant, so use the account's current balance and rate-limit endpoints as the authority for available usage. An active chat subscription must not be treated as unlimited API inference. [Venice pricing](https://venice.ai/pricing), [API rate limits](https://docs.venice.ai/api-reference/rate-limiting)

Use Venice's OpenAI-compatible streaming API for a controlled comparison. Explicitly supply Terrarium's persona and evaluate disabling the provider's additional system prompt to avoid conflicting character instructions. Keep web search off for ordinary companion turns; use reasoning only for tasks that benefit from it. These parameters must be verified in the gateway's outgoing request, not merely written into a config field that may be ignored. [Venice chat API](https://docs.venice.ai/api-reference/endpoint/chat/completions)

Venice is not yet implemented as a durable provider in this repository. Add its catalog/provider metadata, encrypted secret-store entry, launch-time credential injection, parameter mapping, and config round-trip coverage. Simply adding it to `openclaw.json` is insufficient: `applyUserTuning` only preserves model lists and params for providers emitted by the config template. A later repair or ownership change could otherwise lose it. No Venice account credentials or balances were accessed in this audit.

## Image quality and useful experiments

Keep the current SDXL-family checkpoints as the baseline. The face workflow uses 832×1216, 24 photoreal or 28 anime base steps, plus face and hand detailer nodes configured for 14 steps per detected region. This is not a fixed 52-step full-frame render: detector results determine which crops run. The live Python workflow and TypeScript workflow already differ in available options, so tuning must cover both paths.

Introduce explicit presets, initially as benchmark candidates:

| Preset | Proposed behavior |
| --- | --- |
| Preview | Batch 1, about 768×1024, 16–20 base steps, no automatic upscale; compare against the current baseline |
| Balanced | Current 832×1216 base, preserve identity conditioning, face repair when useful, optional hand repair |
| Quality | Current base plus selected detailers; upscale or inpaint the chosen image on demand |

Use saved seeds and identical prompts to judge faces, composition, consistency, and artifacts. For consistency across chat and images, share structured scene state: participants, setting, outfit, pose, and reference identity. This is more controllable than reconstructing a picture from the entire chat history each time. Store these fields with the output so edits can change a specific property without losing everything else.

Two later experiments merit attention:

- **Distilled image workflows:** SDXL-Lightning provides low-step models and LoRAs, with specific sampler and step requirements. It is not valid to set an arbitrary checkpoint to four steps and expect equivalent quality. The live `generate.py` explicitly disables a previous Hyper LoRA because it caused speckle artifacts on CyberRealisticPony. Preserve that lesson and compare a compatible fast workflow separately. [SDXL-Lightning model card](https://huggingface.co/ByteDance/SDXL-Lightning)
- **Attention acceleration:** SageAttention is an optional benchmark in a separate compatible environment. Its kernel speedups are not whole-image speedups, and compatibility with this Windows/Python/Torch/custom-node stack must be established first. [SageAttention project](https://github.com/thu-ml/SageAttention)

Speculative decoding is lower priority: it can require a draft model, extra memory, compatible tokenization, and a different serving integration. Its benefit depends on draft acceptance rate and workload, so do not assume it helps an already memory-constrained 8B setup. [llama.cpp speculative example](https://github.com/ggml-org/llama.cpp/tree/master/examples/speculative)

## Making the companion feel smarter

Use separate durable facts and temporary scene state; isolate each character's history while allowing explicitly shared user preferences. Retrieve a small number of relevant memories with provenance and recency, resolve contradictions, and allow corrections. Prefer structured extraction over an additional large reasoning call before every reply. Run memory maintenance when idle. Test character voice, recall, instruction-following, repetition, and continuity with the same scripted conversations across candidate models.

Tune sampling per model using its documented defaults as the baseline. Compare a few controlled temperature/output-length settings rather than maximizing randomness or stacking repetition penalties. Maintain adult-content capability through suitable model selection and tested routing. No prompt trick can guarantee that a provider or model supports every requested content category, and inference-speed settings do not themselves change those capabilities.

## Implementation order and proof

1. Add stage timings: queue wait, model load, prompt evaluation, first visible token, tokens/sec, render completion, first visible image, caption completion, and peak VRAM/RAM.
2. Fix image publication order and add bounded helper context/output settings.
3. Add shared GPU scheduling and verified Ollama launch profiles.
4. Reduce the ordinary-chat prompt and add bounded, character-aware memory retrieval.
5. Add Venice with durable configuration, then compare it against the current ArliAI model.
6. Benchmark image presets; only then test alternative attention kernels or distilled models.

Run repeatable short and long chat trials, cold and warm local loads, fixed-seed clothed portrait scenes, and concurrent hosted-chat/image jobs. Report median and slow-tail latency separately, plus errors, memory peaks, and subjective quality scores. Preserve current seeds/settings as the rollback baseline. Targets can include first visible hosted text under two seconds and prompt-size reduction of at least a third, but these are proposed acceptance goals, not established capabilities or provider guarantees.

This audit performed read-only hardware, process, API, config-metadata, session-metadata, log, and source inspection. It did not run a new inference benchmark, generate images, grade model responses, or establish an ArliAI-versus-Venice winner. No production code changed, so runtime regression tests were not needed for this documentation-only change.
