import { ManagedProviderPoolState } from 'src/engine/core-modules/managed-provider-billing/enums/managed-provider-pool-state.enum';

export const MANAGED_OPENROUTER_PROVIDER_NAME = 'openrouter';
export const MANAGED_OPENROUTER_PROVIDER_LABEL = 'Myah Managed OpenRouter';
export const MANAGED_OPENROUTER_PROVIDER_NPM = '@ai-sdk/openai-compatible';
export const MANAGED_OPENROUTER_PROVIDER_BASE_URL =
  'https://openrouter.ai/api/v1';
export const MANAGED_OPENROUTER_PROVIDER_API_KEY = '{{OPENROUTER_API_KEY}}';

export const MANAGED_OPENROUTER_EVENT_TYPE = 'managed_openrouter_generation';

// Versioned tariff facts are part of every reservation and completion receipt.
// The source manifest below is the sole billing authority. Keep this file
// reviewable: activation requires replacing the unfunded acquisition facts and
// digest in the same source change.
const REVIEWED_MANAGED_OPENROUTER_TARIFF_VERSION = '2026-07-19-v2';

export const MANAGED_OPENROUTER_GEMMA_PAID_REFERENCE_PRICE_PER_MILLION = {
  input: 0.22,
  output: 0.55,
  cacheRead: 0.12,
  cacheWrite: 0.22,
} as const;

export const MANAGED_OPENROUTER_MODEL_IDS = [
  'openrouter/deepseek/deepseek-v4-flash',
  'openrouter/x-ai/grok-4.5',
  'openrouter/openai/gpt-5.6-luna',
  'openrouter/google/gemma-4-31b-it:free',
] as const;

export type ManagedOpenRouterModelId =
  (typeof MANAGED_OPENROUTER_MODEL_IDS)[number];

type ManagedOpenRouterManifestModel = {
  input: number;
  output: number;
  cachedInput: number;
  cacheCreation: number;
  contextWindowTokens: number;
  maxOutputTokens: number;
  providerMax: { prompt: number; completion: number };
  longContext?: {
    input: number;
    output: number;
    cachedInput: number;
    cacheCreation: number;
    thresholdTokens: number;
  };
};

// Complete reviewed catalogue facts. These values intentionally remain present
// while acquisition is unfunded so disabled bootstrap remains valid.
export const MANAGED_OPENROUTER_TARIFF_MANIFEST = {
  providerKey: MANAGED_OPENROUTER_PROVIDER_NAME,
  tariffVersion: REVIEWED_MANAGED_OPENROUTER_TARIFF_VERSION,
  acquisition: {
    cashPaidMicrousd: null,
    usableCreditsReceivedMicrousd: null,
    evidenceIdentity: null,
  },
  models: {
    'openrouter/deepseek/deepseek-v4-flash': {
      input: 0.098,
      output: 0.196,
      cachedInput: 0.0196,
      cacheCreation: 0.098,
      contextWindowTokens: 1048576,
      maxOutputTokens: 128000,
      providerMax: { prompt: 0.098, completion: 0.196 },
    },
    'openrouter/x-ai/grok-4.5': {
      input: 2,
      output: 6,
      cachedInput: 0.3,
      cacheCreation: 2,
      contextWindowTokens: 500000,
      maxOutputTokens: 128000,
      providerMax: { prompt: 4, completion: 12 },
      longContext: {
        input: 4,
        output: 12,
        cachedInput: 0.6,
        cacheCreation: 4,
        thresholdTokens: 200000,
      },
    },
    'openrouter/openai/gpt-5.6-luna': {
      input: 1,
      output: 6,
      cachedInput: 0.1,
      cacheCreation: 1.25,
      contextWindowTokens: 1050000,
      maxOutputTokens: 128000,
      providerMax: { prompt: 2, completion: 9 },
      longContext: {
        input: 2,
        output: 9,
        cachedInput: 0.2,
        cacheCreation: 2.5,
        thresholdTokens: 272000,
      },
    },
    'openrouter/google/gemma-4-31b-it:free': {
      input: 0.22,
      output: 0.55,
      cachedInput: 0.12,
      cacheCreation: 0.22,
      contextWindowTokens: 262144,
      maxOutputTokens: 32768,
      providerMax: { prompt: 0, completion: 0 },
    },
  } satisfies Record<ManagedOpenRouterModelId, ManagedOpenRouterManifestModel>,
} as const;

export const MANAGED_OPENROUTER_TARIFF_VERSION =
  MANAGED_OPENROUTER_TARIFF_MANIFEST.tariffVersion;

export const MANAGED_OPENROUTER_MINIMUM_PRICE_PER_MILLION = Object.fromEntries(
  Object.entries(MANAGED_OPENROUTER_TARIFF_MANIFEST.models).map(
    ([modelId, model]) => [
      modelId,
      { input: model.input, output: model.output },
    ],
  ),
) as Record<
  ManagedOpenRouterModelId,
  { readonly input: number; readonly output: number }
>;

export const MANAGED_OPENROUTER_PROVIDER_MAX_PRICE_PER_MILLION =
  Object.fromEntries(
    Object.entries(MANAGED_OPENROUTER_TARIFF_MANIFEST.models).map(
      ([modelId, model]) => [
        modelId.slice(`${MANAGED_OPENROUTER_PROVIDER_NAME}/`.length),
        model.providerMax,
      ],
    ),
  ) as Record<string, { readonly prompt: number; readonly completion: number }>;

export const MANAGED_OPENROUTER_TARIFF_MANIFEST_DIGEST =
  '91920e85fef98a8729b7e33e800d4602f0b80da60cc579f7bf3ef9081b4a8a13' as const;

export const MANAGED_OPENROUTER_TARIFF_MANIFEST_IS_FUNDED =
  MANAGED_OPENROUTER_TARIFF_MANIFEST.acquisition.cashPaidMicrousd !== null &&
  MANAGED_OPENROUTER_TARIFF_MANIFEST.acquisition
    .usableCreditsReceivedMicrousd !== null &&
  MANAGED_OPENROUTER_TARIFF_MANIFEST.acquisition.evidenceIdentity !== null;

export const MANAGED_OPENROUTER_POOL_DESIRED_MANIFEST = {
  providerKey: MANAGED_OPENROUTER_PROVIDER_NAME,
  configurationDigest: MANAGED_OPENROUTER_TARIFF_MANIFEST_DIGEST,
  tariffVersion: null,
  epoch: '1',
  state: ManagedProviderPoolState.DISABLED,
} as const;

export const getManagedOpenRouterManifestModel = (
  modelId: string,
): ManagedOpenRouterManifestModel | undefined =>
  (
    MANAGED_OPENROUTER_TARIFF_MANIFEST.models as Record<
      string,
      ManagedOpenRouterManifestModel
    >
  )[modelId];

export const assertManagedOpenRouterCatalogMatchesManifest = (catalog: {
  npm?: string;
  name?: string;
  label?: string;
  baseUrl?: string;
  apiKey?: string;
  models?: Array<{
    name: string;
    inputCostPerMillionTokens?: number;
    outputCostPerMillionTokens?: number;
    cachedInputCostPerMillionTokens?: number;
    cacheCreationCostPerMillionTokens?: number;
    contextWindowTokens?: number;
    maxOutputTokens?: number;
    longContextCost?: {
      inputCostPerMillionTokens?: number;
      outputCostPerMillionTokens?: number;
      cachedInputCostPerMillionTokens?: number;
      cacheCreationCostPerMillionTokens?: number;
      thresholdTokens?: number;
    };
  }>;
}): void => {
  const actualProviderMetadata = {
    name: catalog.name,
    label: catalog.label,
    npm: catalog.npm,
    baseUrl: catalog.baseUrl,
    apiKey: catalog.apiKey,
  };
  const expectedProviderMetadata = {
    name: MANAGED_OPENROUTER_PROVIDER_NAME,
    label: MANAGED_OPENROUTER_PROVIDER_LABEL,
    npm: MANAGED_OPENROUTER_PROVIDER_NPM,
    baseUrl: MANAGED_OPENROUTER_PROVIDER_BASE_URL,
    apiKey: MANAGED_OPENROUTER_PROVIDER_API_KEY,
  };
  if (
    JSON.stringify(actualProviderMetadata) !==
    JSON.stringify(expectedProviderMetadata)
  ) {
    throw new Error('Managed OpenRouter provider metadata mismatch');
  }

  const expectedModelNames = MANAGED_OPENROUTER_MODEL_IDS.map((modelId) =>
    modelId.slice(`${MANAGED_OPENROUTER_PROVIDER_NAME}/`.length),
  );
  const actualModelNames = catalog.models?.map((model) => model.name);
  const actualModelNameSet = new Set(actualModelNames);

  if (
    actualModelNames === undefined ||
    actualModelNames.length !== expectedModelNames.length ||
    actualModelNameSet.size !== actualModelNames.length ||
    expectedModelNames.some((name) => !actualModelNameSet.has(name))
  ) {
    throw new Error('Managed OpenRouter catalogue membership mismatch');
  }

  for (const modelId of MANAGED_OPENROUTER_MODEL_IDS) {
    const name = modelId.slice(`${MANAGED_OPENROUTER_PROVIDER_NAME}/`.length);
    const expected = getManagedOpenRouterManifestModel(modelId);
    const actual = catalog.models?.find((model) => model.name === name);
    if (!expected || !actual) {
      throw new Error(`Managed OpenRouter catalogue is missing ${modelId}`);
    }
    const actualFacts = {
      input: actual.inputCostPerMillionTokens,
      output: actual.outputCostPerMillionTokens,
      cachedInput: actual.cachedInputCostPerMillionTokens,
      cacheCreation: actual.cacheCreationCostPerMillionTokens,
      contextWindowTokens: actual.contextWindowTokens,
      maxOutputTokens: actual.maxOutputTokens,
      longContext: actual.longContextCost && {
        input: actual.longContextCost.inputCostPerMillionTokens,
        output: actual.longContextCost.outputCostPerMillionTokens,
        cachedInput: actual.longContextCost.cachedInputCostPerMillionTokens,
        cacheCreation: actual.longContextCost.cacheCreationCostPerMillionTokens,
        thresholdTokens: actual.longContextCost.thresholdTokens,
      },
    };
    const { providerMax: _providerMax, ...expectedCatalogFacts } = expected;
    if (JSON.stringify(actualFacts) !== JSON.stringify(expectedCatalogFacts)) {
      throw new Error(`Managed OpenRouter catalogue mismatch for ${modelId}`);
    }
  }
};
