export const MANAGED_OPENROUTER_PROVIDER_NAME = 'openrouter';
export const MANAGED_OPENROUTER_PROVIDER_LABEL = 'Myah Managed OpenRouter';
export const MANAGED_OPENROUTER_EVENT_TYPE = 'managed_openrouter_generation';

// Versioned tariff facts are part of every reservation and completion receipt.
export const MANAGED_OPENROUTER_TARIFF_VERSION = '2026-07-19-v1';

export const MANAGED_OPENROUTER_MODEL_IDS = [
  'openrouter/deepseek/deepseek-v4-flash',
  'openrouter/x-ai/grok-4.5',
  'openrouter/openai/gpt-5.6-luna',
  'openrouter/google/gemma-4-31b-it:free',
] as const;

export type ManagedOpenRouterModelId =
  (typeof MANAGED_OPENROUTER_MODEL_IDS)[number];

// Minimum Metronome list prices in USD per million tokens. Paid prices
// round up from the highest documented OpenRouter rate divided by 0.70.
export const MANAGED_OPENROUTER_MINIMUM_PRICE_PER_MILLION = {
  'openrouter/deepseek/deepseek-v4-flash': { input: 0.14, output: 0.28 },
  'openrouter/x-ai/grok-4.5': { input: 2.86, output: 8.58 },
  'openrouter/openai/gpt-5.6-luna': { input: 1.43, output: 8.58 },
  'openrouter/google/gemma-4-31b-it:free': { input: 0, output: 0 },
} as const satisfies Record<
  ManagedOpenRouterModelId,
  { input: number; output: number }
>;

// Hard OpenRouter routing ceilings in USD per million tokens. Long-context
// models use the highest reviewed upstream rate so valid requests remain
// routable without allowing a price above the source-controlled catalogue.
export const MANAGED_OPENROUTER_PROVIDER_MAX_PRICE_PER_MILLION = {
  'deepseek/deepseek-v4-flash': { prompt: 0.098, completion: 0.196 },
  'x-ai/grok-4.5': { prompt: 4, completion: 12 },
  'openai/gpt-5.6-luna': { prompt: 2, completion: 9 },
  'google/gemma-4-31b-it:free': { prompt: 0, completion: 0 },
} as const;
