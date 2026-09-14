import { ProviderConfigService } from '../provider-config.service';

describe('ProviderConfigService', () => {
  it('normalizes a custom OpenRouter config separately from the managed catalog', () => {
    const service = new ProviderConfigService(
      {
        get: jest.fn().mockReturnValue({
          openrouter: {
            apiKey: 'custom',
            models: [
              {
                label: 'Legacy manual',
                name: 'legacy-manual',
                source: 'manual',
              },
              {
                label: 'Explicit unstructured',
                name: 'explicit-unstructured',
                source: 'manual',
                supportsStructuredOutputs: false,
              },
              {
                label: 'Catalog model',
                name: 'catalog-model',
                source: 'catalog',
              },
            ],
          },
        }),
      } as never,
      {
        getDefaultAiCatalog: jest.fn().mockReturnValue({
          openrouter: { npm: '@ai-sdk/openai-compatible', models: [] },
        }),
      } as never,
    );

    expect(service.getResolvedProviders()).toEqual({
      openrouter: expect.objectContaining({
        npm: '@ai-sdk/openai-compatible',
        models: [],
      }),
      'openrouter-custom': {
        apiKey: 'custom',
        name: 'openrouter',
        models: [
          {
            label: 'Legacy manual',
            name: 'legacy-manual',
            source: 'manual',
            supportsStructuredOutputs: true,
          },
          {
            label: 'Explicit unstructured',
            name: 'explicit-unstructured',
            source: 'manual',
            supportsStructuredOutputs: false,
          },
          {
            label: 'Catalog model',
            name: 'catalog-model',
            source: 'catalog',
          },
        ],
      },
    });
  });

  it('treats an unlisted workspace as eligible on the wildcard allowlist', () => {
    const values: Record<string, unknown> = {
      MANAGED_OPENROUTER_ENABLED: true,
      MANAGED_OPENROUTER_FUNDING_WORKSPACE_IDS: ['*'],
    };
    const service = new ProviderConfigService(
      { get: jest.fn((key: string) => values[key]) } as never,
      { getDefaultAiCatalog: jest.fn() } as never,
    );

    expect(
      service.isManagedOpenRouterWorkspaceEligible('unlisted-workspace-id'),
    ).toBe(true);
  });
});
