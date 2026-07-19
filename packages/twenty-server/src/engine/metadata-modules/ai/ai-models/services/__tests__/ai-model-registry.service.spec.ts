import { Test, type TestingModule } from '@nestjs/testing';

import { ConfigGroupHashService } from 'src/engine/core-modules/twenty-config/services/config-group-hash.service';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { AiModelPreferencesService } from 'src/engine/metadata-modules/ai/ai-models/services/ai-model-preferences.service';
import { AiModelRegistryService } from 'src/engine/metadata-modules/ai/ai-models/services/ai-model-registry.service';
import { ProviderConfigService } from 'src/engine/metadata-modules/ai/ai-models/services/provider-config.service';
import { SdkProviderFactoryService } from 'src/engine/metadata-modules/ai/ai-models/services/sdk-provider-factory.service';
import { AUTO_SELECT_SMART_MODEL_ID } from 'twenty-shared/constants';

describe('AiModelRegistryService', () => {
  let service: AiModelRegistryService;
  let mockConfigService: jest.Mocked<TwentyConfigService>;
  let mockPreferencesService: {
    getPreferences: jest.Mock;
    getRecommendedModelIds: jest.Mock;
  };

  beforeEach(async () => {
    mockConfigService = {
      get: jest.fn().mockReturnValue({}),
    } as any;

    const mockProviderConfigService = {
      hasCustomOpenRouterProvider: jest.fn().mockReturnValue(false),
      isManagedOpenRouterEnabled: jest.fn().mockReturnValue(false),
      getResolvedProviders: jest.fn().mockReturnValue({}),
    };

    mockPreferencesService = {
      getPreferences: jest.fn().mockReturnValue({}),
      getRecommendedModelIds: jest.fn().mockReturnValue(new Set()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiModelRegistryService,
        {
          provide: TwentyConfigService,
          useValue: mockConfigService,
        },
        {
          provide: ProviderConfigService,
          useValue: mockProviderConfigService,
        },
        {
          provide: SdkProviderFactoryService,
          useValue: { clearCache: jest.fn() },
        },
        {
          provide: AiModelPreferencesService,
          useValue: mockPreferencesService,
        },
        {
          provide: ConfigGroupHashService,
          useValue: { computeHash: jest.fn().mockReturnValue('') },
        },
      ],
    }).compile();

    service = module.get<AiModelRegistryService>(AiModelRegistryService);
  });

  it('should throw when no models are available for AUTO_SELECT_SMART_MODEL_ID', () => {
    expect(() =>
      service.getEffectiveModelConfig(AUTO_SELECT_SMART_MODEL_ID),
    ).toThrow(
      'No AI models are available. Configure at least one AI provider.',
    );
  });
  it('keeps managed OpenRouter models alongside a custom OpenRouter provider', () => {
    const providerConfigService = service[
      'providerConfigService' as keyof AiModelRegistryService
    ] as unknown as {
      isManagedOpenRouterEnabled: jest.Mock;
      hasCustomOpenRouterProvider: jest.Mock;
      getResolvedProviders: jest.Mock;
    };

    providerConfigService.isManagedOpenRouterEnabled.mockReturnValue(true);
    providerConfigService.hasCustomOpenRouterProvider.mockReturnValue(true);
    providerConfigService.getResolvedProviders.mockReturnValue({
      openrouter: {
        apiKey: 'managed-key',
        npm: '@ai-sdk/openai-compatible',
        models: [{ name: 'managed-model', label: 'Managed model' }],
        name: 'Managed OpenRouter',
      },
      'openrouter-custom': {
        apiKey: 'custom-key',
        npm: '@ai-sdk/openai-compatible',
        models: [{ name: 'custom-model', label: 'Custom model' }],
        name: 'Custom OpenRouter',
      },
    });
    const sdkProviderFactory = (
      service as unknown as {
        sdkProviderFactory: {
          createProvider: jest.Mock;
        };
      }
    ).sdkProviderFactory;
    sdkProviderFactory.createProvider = jest.fn().mockReturnValue({
      createModel: (name: string) => ({ name }),
    });

    expect(service.getModel('openrouter/managed-model')).toBeDefined();
    expect(service.getModel('openrouter-custom/custom-model')).toBeDefined();
  });

  it('fails closed for global client selectors without workspace identity', () => {
    jest.spyOn(service, 'getAvailableModels').mockReturnValue([
      {
        modelId: 'openrouter/managed-model',
        providerName: 'openrouter',
        sdkPackage: '@ai-sdk/openai-compatible',
        model: {} as any,
      },
      {
        modelId: 'openai/gpt-4',
        providerName: 'openai',
        sdkPackage: '@ai-sdk/openai',
        model: {} as any,
      },
    ]);

    expect(
      service.getAdminFilteredModels().map(({ modelId }) => modelId),
    ).toEqual(['openai/gpt-4']);
  });

  it('should return effective model config for AUTO_SELECT_SMART_MODEL_ID when models are available', () => {
    jest.spyOn(service, 'getAvailableModels').mockReturnValue([
      {
        modelId: 'openai/gpt-5.2',
        sdkPackage: '@ai-sdk/openai',
        model: {} as any,
      },
    ]);

    jest.spyOn(service, 'getModel').mockReturnValue({
      modelId: 'openai/gpt-5.2',
      sdkPackage: '@ai-sdk/openai',
      model: {} as any,
    });

    const result = service.getEffectiveModelConfig(AUTO_SELECT_SMART_MODEL_ID);

    expect(result).toBeDefined();
    expect(result.modelId).toBe('openai/gpt-5.2');
    expect(result.sdkPackage).toBe('@ai-sdk/openai');
  });

  it('should return effective model config for AUTO_SELECT_SMART_MODEL_ID with custom model', () => {
    jest.spyOn(service, 'getAvailableModels').mockReturnValue([
      {
        modelId: 'custom/mistral',
        sdkPackage: '@ai-sdk/openai-compatible',
        model: {} as any,
      },
    ]);

    jest.spyOn(service, 'getModel').mockReturnValue({
      modelId: 'custom/mistral',
      sdkPackage: '@ai-sdk/openai-compatible',
      model: {} as any,
    });

    const result = service.getEffectiveModelConfig(AUTO_SELECT_SMART_MODEL_ID);

    expect(result).toBeDefined();
    expect(result.modelId).toBe('custom/mistral');
    expect(result.sdkPackage).toBe('@ai-sdk/openai-compatible');
    expect(result.label).toBe('custom/mistral');
    expect(result.inputCostPerMillionTokens).toBe(0);
    expect(result.outputCostPerMillionTokens).toBe(0);
  });

  it('should return effective model config for custom model', () => {
    jest.spyOn(service, 'getModel').mockReturnValue({
      modelId: 'custom/mistral',
      sdkPackage: '@ai-sdk/openai-compatible',
      model: {} as any,
    });

    const result = service.getEffectiveModelConfig('custom/mistral');

    expect(result).toBeDefined();
    expect(result.modelId).toBe('custom/mistral');
    expect(result.sdkPackage).toBe('@ai-sdk/openai-compatible');
    expect(result.label).toBe('custom/mistral');
    expect(result.inputCostPerMillionTokens).toBe(0);
    expect(result.outputCostPerMillionTokens).toBe(0);
  });

  it('should throw error for non-existent model', () => {
    jest.spyOn(service, 'getModel').mockReturnValue(undefined);

    expect(() => service.getEffectiveModelConfig('non-existent-model')).toThrow(
      'Model with ID non-existent-model not found',
    );
  });

  it('should find first available model from preferences list', () => {
    mockPreferencesService.getPreferences.mockReturnValue({
      defaultFastModels: [
        'openai/gpt-5-mini',
        'anthropic/claude-haiku-4-5-20251001',
        'google/gemini-3-flash-preview',
      ],
    });

    const getModelSpy = jest
      .spyOn(service, 'getModel')
      .mockImplementation((modelId: string) => {
        if (modelId === 'anthropic/claude-haiku-4-5-20251001') {
          return {
            modelId: 'anthropic/claude-haiku-4-5-20251001',
            sdkPackage: '@ai-sdk/anthropic',
            model: {} as any,
          };
        }

        return undefined;
      });

    const result = service.getDefaultSpeedModel();

    expect(result).toBeDefined();
    expect(result.modelId).toBe('anthropic/claude-haiku-4-5-20251001');
    expect(getModelSpy).toHaveBeenCalledWith('openai/gpt-5-mini');
    expect(getModelSpy).toHaveBeenCalledWith(
      'anthropic/claude-haiku-4-5-20251001',
    );
  });

  it('should fall back to any available model if none in list are available', () => {
    mockPreferencesService.getPreferences.mockReturnValue({
      defaultFastModels: ['model-a', 'model-b', 'model-c'],
    });

    jest.spyOn(service, 'getModel').mockReturnValue(undefined);
    jest.spyOn(service, 'getAvailableModels').mockReturnValue([
      {
        modelId: 'fallback-model',
        sdkPackage: '@ai-sdk/openai-compatible',
        model: {} as any,
      },
    ]);

    const result = service.getDefaultSpeedModel();

    expect(result).toBeDefined();
    expect(result.modelId).toBe('fallback-model');
  });
});
