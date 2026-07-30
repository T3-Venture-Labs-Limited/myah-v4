import { ProviderConfigService } from '../provider-config.service';

describe('ProviderConfigService', () => {
  it('names a custom OpenRouter config separately from the managed catalog', () => {
    const service = new ProviderConfigService(
      {
        get: jest.fn().mockReturnValue({ openrouter: { apiKey: 'custom' } }),
      } as never,
      {
        getDefaultAiCatalog: jest.fn().mockReturnValue({
          openrouter: { npm: '@ai-sdk/openai-compatible', models: [] },
        }),
      } as never,
    );

    expect(service.getResolvedProviders()).toEqual({
      openrouter: { npm: '@ai-sdk/openai-compatible', models: [] },
      'openrouter-custom': { apiKey: 'custom' },
    });
  });
});
