/**
 * Model catalog entries for the generated openclaw.json, transcribed from the
 * proven live config (2026-07-07). Values here are load-bearing: reasoning
 * models break OpenClaw's pipe, context under ~24k enters the compaction
 * death-spiral, and maxTokens/contextWindow were tuned in production.
 */
const NO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }

export const ARLIAI_MODELS = [
  {
    id: 'Gemma-4-31B-DarkIdol',
    name: 'Gemma-4 31B DarkIdol',
    reasoning: false,
    input: ['text'],
    cost: NO_COST,
    contextWindow: 32768,
    maxTokens: 1024,
    compat: { supportsTools: false, supportsUsageInStreaming: true },
  },
  {
    id: 'Mistral-Medium-3.5-128B',
    name: 'Mistral Medium 3.5 128B',
    reasoning: false,
    input: ['text'],
    cost: NO_COST,
    contextWindow: 32768,
    maxTokens: 1024,
    compat: { supportsTools: false, supportsUsageInStreaming: true },
  },
]

export const OLLAMA_MODELS = [
  { id: 'huihui_ai/qwen3.5-abliterated:9b', name: 'Qwen 3.5 9B (non-thinking)', reasoning: false,
    input: ['text'], cost: NO_COST, contextWindow: 16384, maxTokens: 1024,
    params: { num_ctx: 16384, think: false }, compat: { supportsTools: false, supportsUsageInStreaming: true } },
  {
    id: 'huihui_ai/qwen3-abliterated:8b',
    name: 'qwen3-abliterated:8b',
    reasoning: false,
    input: ['text'],
    cost: NO_COST,
    contextWindow: 24576,
    maxTokens: 2048,
    params: { num_ctx: 24576 },
    compat: { supportsTools: true, supportsUsageInStreaming: true },
  },
  {
    id: 'dolphin3:8b',
    name: 'dolphin3:8b',
    reasoning: false,
    input: ['text'],
    cost: NO_COST,
    contextWindow: 24576,
    maxTokens: 2048,
    params: { num_ctx: 24576 },
    compat: { supportsTools: false, supportsUsageInStreaming: true },
  },
  {
    id: 'llama3:latest',
    name: 'llama3:latest',
    reasoning: false,
    input: ['text'],
    cost: NO_COST,
    contextWindow: 16384,
    maxTokens: 4096,
    params: { num_ctx: 16384 },
    compat: { supportsTools: false, supportsUsageInStreaming: true },
  },
  {
    id: 'qwen2.5vl:3b',
    name: 'qwen2.5vl:3b (vision)',
    reasoning: false,
    input: ['text', 'image'],
    cost: NO_COST,
    contextWindow: 32768,
    maxTokens: 1024,
    params: { num_ctx: 4096, keep_alive: '5m' },
    compat: { supportsTools: false, supportsUsageInStreaming: true },
  },
]

export const DISABLED_PLUGINS = [
  'browser',
  'talk-voice',
  'canvas',
  'phone-control',
  'device-pair',
  'file-transfer',
]

export const DISABLED_SKILLS = [
  '1password', 'blogwatcher', 'blucli', 'camsnap', 'coding-agent', 'eightctl',
  'gemini', 'gh-issues', 'gifgrep', 'github', 'gog', 'goplaces', 'himalaya',
  'nano-pdf', 'obsidian', 'openai-whisper-api', 'openhue', 'oracle',
  'ordercli', 'sag', 'session-logs', 'sherpa-onnx-tts', 'songsee', 'sonoscli',
  'spotify-player', 'summarize', 'trello', 'xurl',
]
