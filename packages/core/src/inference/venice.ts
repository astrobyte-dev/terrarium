export const VENICE_BASE_URL = 'https://api.venice.ai/api/v1'
export const VENICE_MODELS = [
  { id: 'venice-uncensored-1-2', name: 'Venice Uncensored 1.2', contextWindow: 128000, inputCost: 0.2, outputCost: 0.9 },
  { id: 'venice-uncensored-role-play', name: 'Venice Role Play', contextWindow: 128000, inputCost: 0.5, outputCost: 2 },
  { id: 'gemma-4-uncensored', name: 'Gemma 4 Uncensored (Venice)', contextWindow: 256000, inputCost: 0.1625, outputCost: 0.5 },
].map(m => ({ id: m.id, name: m.name, reasoning: false, input: ['text'], contextWindow: m.contextWindow,
  maxTokens: 1024, cost: { input: m.inputCost, output: m.outputCost, cacheRead: m.inputCost, cacheWrite: m.inputCost },
  // Companion chat uses the app's command handlers; omit the gateway's broad tool schemas.
  compat: { supportsTools: false, supportsUsageInStreaming: true } }))

export function veniceRequest(body: Record<string, unknown>): Record<string, unknown> {
  return { ...body, venice_parameters: { include_venice_system_prompt: false, enable_web_search: 'off',
    disable_thinking: true, strip_thinking_response: true },
    ...(body.stream === true ? { stream_options: { include_usage: true } } : {}) }
}
