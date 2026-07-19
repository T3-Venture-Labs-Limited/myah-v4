import defaultAiProviders from 'src/engine/metadata-modules/ai/ai-models/ai-providers.json';
import {
  assertManagedOpenRouterCatalogMatchesManifest,
  MANAGED_OPENROUTER_MINIMUM_PRICE_PER_MILLION,
} from 'src/engine/metadata-modules/ai/ai-models/constants/managed-openrouter.constants';
import { aiProvidersConfigSchema } from 'src/engine/metadata-modules/ai/ai-models/types/ai-providers-config.schema';
import { type AiProvidersConfig } from 'src/engine/metadata-modules/ai/ai-models/types/ai-providers-config.type';
import { buildCompositeModelId } from 'src/engine/metadata-modules/ai/ai-models/utils/composite-model-id.util';
import { normalizeAiProviders } from 'src/engine/metadata-modules/ai/ai-models/utils/normalize-ai-providers.util';

const PROVIDERS = normalizeAiProviders(defaultAiProviders as AiProvidersConfig);

const EXPECTED_PROVIDER_NAMES = [
  'openai',
  'anthropic',
  'google',
  'xai',
  'mistral',
  'openrouter',
];

describe('ai-providers.json integrity', () => {
  it('should pass Zod schema validation', () => {
    expect(() =>
      aiProvidersConfigSchema.parse(defaultAiProviders),
    ).not.toThrow();
  });

  it('should have at least one model per expected provider', () => {
    EXPECTED_PROVIDER_NAMES.forEach((providerName) => {
      const config = PROVIDERS[providerName];

      expect(config).toBeDefined();
      expect((config?.models?.length ?? 0) > 0).toBe(true);
    });
  });

  it('should have all required fields for each model', () => {
    Object.values(PROVIDERS).forEach((config) => {
      (config.models ?? []).forEach((model) => {
        expect(model.name).toBeDefined();
        expect(model.label).toBeDefined();
        expect(model.inputCostPerMillionTokens).toBeDefined();
        expect(model.outputCostPerMillionTokens).toBeDefined();
        expect(model.contextWindowTokens).toBeGreaterThan(0);
        expect(model.maxOutputTokens).toBeGreaterThan(0);
      });
    });
  });

  it('should have unique composite model IDs across all providers', () => {
    const allCompositeIds: string[] = [];

    Object.entries(PROVIDERS).forEach(([key, config]) => {
      (config.models ?? []).forEach((model) => {
        allCompositeIds.push(buildCompositeModelId(key, model.name));
      });
    });

    expect(new Set(allCompositeIds).size).toBe(allCompositeIds.length);
  });

  it('should have at least one non-deprecated model per expected provider', () => {
    EXPECTED_PROVIDER_NAMES.forEach((providerName) => {
      const config = PROVIDERS[providerName];
      const hasActiveModel = (config?.models ?? []).some(
        (model) => !model.isDeprecated,
      );

      expect(hasActiveModel).toBe(true);
    });
  });

  it('should set source to catalog for all models after normalization', () => {
    Object.values(PROVIDERS).forEach((config) => {
      (config.models ?? []).forEach((model) => {
        expect(model.source).toBe('catalog');
      });
    });
  });

  it('should have npm field set for all providers', () => {
    Object.values(PROVIDERS).forEach((config) => {
      expect(config.npm).toBeDefined();
      expect(config.npm).toMatch(/^@ai-sdk\//);
    });
  });
  it('registers only the reviewed managed OpenRouter catalog', () => {
    expect(PROVIDERS.openrouter).toMatchObject({
      apiKey: '{{OPENROUTER_API_KEY}}',
      baseUrl: 'https://openrouter.ai/api/v1',
      npm: '@ai-sdk/openai-compatible',
    });
    expect(PROVIDERS.openrouter?.models).toEqual([
      expect.objectContaining({
        name: 'deepseek/deepseek-v4-flash',
        label: 'DeepSeek V4 Flash',
      }),
      expect.objectContaining({
        name: 'x-ai/grok-4.5',
        label: 'Grok 4.5',
      }),
      expect.objectContaining({
        name: 'openai/gpt-5.6-luna',
        label: 'GPT-5.6 Luna',
      }),
      expect.objectContaining({
        name: 'google/gemma-4-31b-it:free',
        label: 'Gemma 4 31B — Temporary Test Tariff',
      }),
    ]);
  });
  it('uses the reviewed 30 percent minimum-margin list prices', () => {
    for (const model of PROVIDERS.openrouter?.models ?? []) {
      const modelId =
        `openrouter/${model.name}` as keyof typeof MANAGED_OPENROUTER_MINIMUM_PRICE_PER_MILLION;
      const minimumPrice =
        MANAGED_OPENROUTER_MINIMUM_PRICE_PER_MILLION[modelId];

      expect(minimumPrice).toBeDefined();
      expect(model.inputCostPerMillionTokens).toBe(minimumPrice.input);
      expect(model.outputCostPerMillionTokens).toBe(minimumPrice.output);
    }
  });
  it('exposes structured output capability for every managed model', () => {
    for (const model of PROVIDERS.openrouter?.models ?? []) {
      expect(model.supportsStructuredOutputs).toBe(true);
    }
  });
  it('accepts the reviewed managed OpenRouter catalog facts', () => {
    expect(() =>
      assertManagedOpenRouterCatalogMatchesManifest(PROVIDERS.openrouter!),
    ).not.toThrow();
  });

  it('rejects extra managed OpenRouter catalog entries', () => {
    const altered = structuredClone(PROVIDERS.openrouter!);

    altered.models!.push({
      ...altered.models![0],
      name: 'unreviewed/model',
    });

    expect(() =>
      assertManagedOpenRouterCatalogMatchesManifest(altered),
    ).toThrow(/catalogue membership mismatch/);
  });

  it('rejects duplicate managed OpenRouter catalog entries', () => {
    const altered = structuredClone(PROVIDERS.openrouter!);

    altered.models![1] = structuredClone(altered.models![0]);

    expect(() =>
      assertManagedOpenRouterCatalogMatchesManifest(altered),
    ).toThrow(/catalogue membership mismatch/);
  });

  it('rejects altered managed OpenRouter transport metadata', () => {
    const altered = structuredClone(PROVIDERS.openrouter!);
    altered.baseUrl = 'https://evil.example/api/v1';

    expect(() =>
      assertManagedOpenRouterCatalogMatchesManifest(altered),
    ).toThrow(/provider metadata mismatch/);
  });

  it('rejects managed model tariff drift', () => {
    const altered = structuredClone(PROVIDERS.openrouter!);
    altered.models![0].inputCostPerMillionTokens = 999;

    expect(() =>
      assertManagedOpenRouterCatalogMatchesManifest(altered),
    ).toThrow(/catalogue mismatch/);
  });

  it('does not advertise unsupported modalities for managed models', () => {
    for (const model of PROVIDERS.openrouter?.models ?? []) {
      expect(model.modalities).toBeUndefined();
    }
  });
});
