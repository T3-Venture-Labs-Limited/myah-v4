import { MODULE_METADATA } from '@nestjs/common/constants';

import { AdminPanelManagedProviderBillingService } from 'src/engine/core-modules/admin-panel/services/admin-panel-managed-provider-billing.service';
import { ManagedProviderBillingModule } from 'src/engine/core-modules/managed-provider-billing/managed-provider-billing.module';
import { AiModelsModule } from 'src/engine/metadata-modules/ai/ai-models/ai-models.module';
import { ManagedOpenRouterModelService } from 'src/engine/metadata-modules/ai/ai-models/services/managed-openrouter-model.service';

import { AdminPanelModule } from '../admin-panel.module';
import { AdminPanelResolver } from '../admin-panel.resolver';

type TestableAdminPanelResolver = {
  aiModelRegistryService: unknown;
  defaultAiCatalogService: unknown;
  getAiProviders: AdminPanelResolver['getAiProviders'];
};
type TestableFundingResolver = {
  adminManagedProviderBillingService: {
    correctFunding: jest.Mock;
    grantCredit: jest.Mock;
    recordOfflineCommitment: jest.Mock;
  };
  correctManagedProviderFunding: AdminPanelResolver['correctManagedProviderFunding'];
  grantManagedProviderCredit: AdminPanelResolver['grantManagedProviderCredit'];
  recordManagedProviderOfflineCommitment: AdminPanelResolver['recordManagedProviderOfflineCommitment'];
};
type TestableProviderMutationResolver = {
  twentyConfigService: {
    get: jest.Mock;
    set: jest.Mock;
  };
  addAiProvider: AdminPanelResolver['addAiProvider'];
  addModelToProvider: AdminPanelResolver['addModelToProvider'];
  removeAiProvider: AdminPanelResolver['removeAiProvider'];
  removeModelFromProvider: AdminPanelResolver['removeModelFromProvider'];
};

describe('managed provider module wiring', () => {
  it.each([
    {
      consumerModule: AiModelsModule,
      service: ManagedOpenRouterModelService,
    },
    {
      consumerModule: AdminPanelModule,
      service: AdminPanelManagedProviderBillingService,
    },
  ])(
    'registers $service.name with managed billing available',
    ({ consumerModule, service }) => {
      const imports = Reflect.getMetadata(
        MODULE_METADATA.IMPORTS,
        consumerModule,
      ) as unknown[];
      const providers = Reflect.getMetadata(
        MODULE_METADATA.PROVIDERS,
        consumerModule,
      ) as unknown[];

      expect(imports).toContain(ManagedProviderBillingModule);
      expect(providers).toContain(service);
    },
  );
});

describe('AdminPanelResolver managed funding mutations', () => {
  it('threads the authenticated operator identity through every funding action', async () => {
    const resolver = Object.create(
      AdminPanelResolver.prototype,
    ) as TestableFundingResolver;
    const receipt = {
      contractId: 'contract-id',
      creditId: 'credit-id',
      customerId: 'customer-id',
    };

    resolver.adminManagedProviderBillingService = {
      correctFunding: jest.fn().mockRejectedValue(new Error('unsupported')),
      grantCredit: jest.fn().mockResolvedValue(receipt),
      recordOfflineCommitment: jest
        .fn()
        .mockRejectedValue(new Error('unsupported')),
    };
    const actor = { id: 'operator-id' };
    const grantInput = {
      amountCents: 100,
      endingBefore: new Date('2027-01-01T00:00:00.000Z'),
      idempotencyKey: 'grant-1',
      reason: 'pilot',
      workspaceId: '11111111-1111-4111-8111-111111111111',
    };

    await expect(
      resolver.grantManagedProviderCredit(grantInput, actor as never),
    ).resolves.toEqual(receipt);
    await expect(
      resolver.recordManagedProviderOfflineCommitment(
        {
          amountCents: 100,
          currency: 'USD',
          externalReference: 'wire-1',
          idempotencyKey: 'offline-1',
          paymentEvidence: 'receipt-1',
          reason: 'verified payment',
          workspaceId: grantInput.workspaceId,
        },
        actor as never,
      ),
    ).rejects.toThrow('unsupported');
    await expect(
      resolver.correctManagedProviderFunding(
        {
          amountCents: 100,
          correctedOperationId: '22222222-2222-4222-8222-222222222222',
          currency: 'USD',
          externalReference: 'correction-1',
          idempotencyKey: 'correction-1',
          reason: 'manual correction',
          workspaceId: grantInput.workspaceId,
        },
        actor as never,
      ),
    ).rejects.toThrow('unsupported');

    expect(
      resolver.adminManagedProviderBillingService.grantCredit,
    ).toHaveBeenCalledWith(grantInput, actor.id);
    expect(
      resolver.adminManagedProviderBillingService.recordOfflineCommitment,
    ).toHaveBeenCalledWith(expect.any(Object), actor.id);
    expect(
      resolver.adminManagedProviderBillingService.correctFunding,
    ).toHaveBeenCalledWith(expect.any(Object), actor.id);
  });
});

describe('AdminPanelResolver.getAiProviders', () => {
  it('returns catalog config variable and masked key for standard providers', async () => {
    const resolver = Object.create(
      AdminPanelResolver.prototype,
    ) as TestableAdminPanelResolver;
    resolver.aiModelRegistryService = {
      getResolvedProvidersForAdmin: () => ({
        openai: { apiKey: 'resolved-key', label: 'OpenAI' },
      }),
      getCatalogProviderNames: () => new Set(['openai']),
    };
    resolver.defaultAiCatalogService = {
      getDefaultAiCatalog: () => ({
        openai: { apiKey: '{{OPENAI_API_KEY}}', label: 'OpenAI' },
      }),
    };

    await expect(resolver.getAiProviders()).resolves.toEqual({
      openai: {
        apiKey: 'resolved...',
        apiKeyConfigVariable: 'OPENAI_API_KEY',
        hasAccessKey: false,
        label: 'OpenAI',
        npm: undefined,
        source: 'catalog',
      },
    });
  });

  it('exposes only hasApiKey for OpenRouter', async () => {
    const resolver = Object.create(
      AdminPanelResolver.prototype,
    ) as TestableAdminPanelResolver;
    resolver.aiModelRegistryService = {
      getResolvedProvidersForAdmin: () => ({
        openrouter: {
          apiKey: 'resolved-secret',
          label: 'OpenRouter',
        },
      }),
      getCatalogProviderNames: () => new Set(['openrouter']),
    };
    resolver.defaultAiCatalogService = {
      getDefaultAiCatalog: () => ({
        openrouter: { apiKey: '{{OPENROUTER_API_KEY}}', label: 'OpenRouter' },
      }),
    };

    await expect(resolver.getAiProviders()).resolves.toEqual({
      openrouter: {
        hasAccessKey: false,
        hasApiKey: true,
        label: 'OpenRouter',
        npm: undefined,
        source: 'catalog',
      },
    });
  });
});

describe('AdminPanelResolver custom OpenRouter mutations', () => {
  const model = {
    name: 'deepseek/deepseek-v4-flash',
    label: 'DeepSeek V4 Flash',
  };

  const createResolver = (providers: Record<string, unknown>) => {
    const resolver = Object.create(
      AdminPanelResolver.prototype,
    ) as TestableProviderMutationResolver;

    resolver.twentyConfigService = {
      get: jest.fn().mockReturnValue(providers),
      set: jest.fn().mockResolvedValue(undefined),
    };

    return resolver;
  };

  it('stores a displayed openrouter-custom provider under its canonical key', async () => {
    const resolver = createResolver({});
    const providerConfig = {
      apiKey: 'secret',
      models: [],
      npm: '@ai-sdk/openai-compatible',
    };

    await expect(
      resolver.addAiProvider('openrouter-custom', providerConfig as never),
    ).resolves.toBe(true);
    expect(resolver.twentyConfigService.set).toHaveBeenCalledWith(
      'AI_PROVIDERS',
      { openrouter: providerConfig },
    );
  });

  it('adds a structured-output model through the displayed openrouter-custom alias', async () => {
    const openrouter = {
      apiKey: 'secret',
      models: [],
      npm: '@ai-sdk/openai-compatible',
    };
    const resolver = createResolver({ openrouter });

    await expect(
      resolver.addModelToProvider('openrouter-custom', model as never),
    ).resolves.toBe(true);
    expect(resolver.twentyConfigService.set).toHaveBeenCalledWith(
      'AI_PROVIDERS',
      {
        openrouter: {
          ...openrouter,
          models: [
            {
              ...model,
              source: 'manual',
              supportsStructuredOutputs: true,
            },
          ],
        },
      },
    );
  });

  it('removes a model through the displayed openrouter-custom alias', async () => {
    const openrouter = {
      apiKey: 'secret',
      models: [model],
      npm: '@ai-sdk/openai-compatible',
    };
    const resolver = createResolver({ openrouter });

    await expect(
      resolver.removeModelFromProvider(
        'openrouter-custom',
        'deepseek/deepseek-v4-flash',
      ),
    ).resolves.toBe(true);
    expect(resolver.twentyConfigService.set).toHaveBeenCalledWith(
      'AI_PROVIDERS',
      {
        openrouter: {
          ...openrouter,
          models: [],
        },
      },
    );
  });

  it('removes a provider through the displayed openrouter-custom alias', async () => {
    const resolver = createResolver({
      openrouter: {
        apiKey: 'secret',
        models: [],
        npm: '@ai-sdk/openai-compatible',
      },
    });

    await expect(resolver.removeAiProvider('openrouter-custom')).resolves.toBe(
      true,
    );
    expect(resolver.twentyConfigService.set).toHaveBeenCalledWith(
      'AI_PROVIDERS',
      {},
    );
  });
});
