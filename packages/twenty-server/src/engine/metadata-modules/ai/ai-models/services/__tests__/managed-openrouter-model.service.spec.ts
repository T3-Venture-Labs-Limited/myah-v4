import { type LanguageModelV3 } from '@ai-sdk/provider';
import { type LanguageModel } from 'ai';

import { ManagedProviderOperationState } from 'src/engine/core-modules/managed-provider-billing/enums/managed-provider-operation-state.enum';
import { type ManagedProviderOperationService } from 'src/engine/core-modules/managed-provider-billing/services/managed-provider-operation.service';
import { type TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { MANAGED_OPENROUTER_TARIFF_VERSION } from 'src/engine/metadata-modules/ai/ai-models/constants/managed-openrouter.constants';
import { type AiModelConfig } from 'src/engine/metadata-modules/ai/ai-models/types/ai-model-config.type';
import { ManagedOpenRouterModelService } from 'src/engine/metadata-modules/ai/ai-models/services/managed-openrouter-model.service';

jest.mock(
  'src/engine/metadata-modules/ai/ai-models/constants/managed-openrouter.constants',
  () => {
    const actual = jest.requireActual(
      'src/engine/metadata-modules/ai/ai-models/constants/managed-openrouter.constants',
    );

    return {
      ...actual,
      MANAGED_OPENROUTER_TARIFF_MANIFEST: {
        ...actual.MANAGED_OPENROUTER_TARIFF_MANIFEST,
        acquisition: {
          cashPaidMicrousd: '1000000',
          evidenceIdentity: 'test-funding-evidence',
          usableCreditsReceivedMicrousd: '1000000',
        },
      },
      MANAGED_OPENROUTER_TARIFF_MANIFEST_IS_FUNDED: true,
    };
  },
);

const modelConfig: AiModelConfig = {
  modelId: 'openrouter/deepseek/deepseek-v4-flash',
  label: 'DeepSeek V4 Flash',
  description: 'Managed model',
  sdkPackage: '@ai-sdk/openai-compatible',
  inputCostPerMillionTokens: 0.098,
  outputCostPerMillionTokens: 0.196,
  contextWindowTokens: 1_048_576,
  maxOutputTokens: 32_768,
};

const usage = {
  inputTokens: {
    total: 12,
    noCache: 12,
    cacheRead: 0,
    cacheWrite: 0,
  },
  outputTokens: {
    total: 7,
    text: 7,
    reasoning: 0,
  },
  raw: { cost: 0.000_002_548 },
};

const createProviderModel = () => {
  const doGenerate = jest.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'hello' }],
    finishReason: { unified: 'stop', raw: 'stop' },
    usage,
    response: { id: 'generation-1' },
    warnings: [],
  });
  const doStream = jest.fn();
  const model = {
    specificationVersion: 'v3',
    provider: 'openrouter',
    modelId: 'deepseek/deepseek-v4-flash',
    supportedUrls: {},
    doGenerate,
    doStream,
  } as unknown as LanguageModel;

  return { doGenerate, doStream, model };
};

const createService = ({
  customOpenRouter = false,
  enabled = true,
  eligible = true,
  gemmaEligible = true,
  operationState = ManagedProviderOperationState.RESERVED,
}: {
  customOpenRouter?: boolean;
  enabled?: boolean;
  eligible?: boolean;
  gemmaEligible?: boolean;
  operationState?: ManagedProviderOperationState;
} = {}) => {
  const operationService = {
    assertProviderConfigurationActive: jest.fn().mockResolvedValue(undefined),
    reserveOperation: jest.fn().mockResolvedValue({
      id: 'operation-1',
      reservedAmountCents: '1',
      state: operationState,
    }),
    attachProviderExecutionId: jest.fn().mockResolvedValue(undefined),
    completeOperation: jest.fn().mockResolvedValue(undefined),
  };
  const metricsService = {
    incrementCounterBy: jest.fn(),
  };
  const config = {
    get: jest.fn((key: string) => {
      const values: Record<string, unknown> = {
        AI_PROVIDERS: customOpenRouter ? { openrouter: {} } : {},
        MANAGED_OPENROUTER_ENABLED: enabled,
        MANAGED_OPENROUTER_CHARGE_PRODUCT_ID:
          '33333333-3333-4333-8333-333333333333',
        MANAGED_OPENROUTER_CASH_PAID_MICROUSD: '105500000',
        MANAGED_OPENROUTER_USABLE_CREDITS_MICROUSD: '100000000',
        MANAGED_OPENROUTER_MULTIPLIER_EVIDENCE_VERSION: 'topup-2026-07-19',
        MANAGED_OPENROUTER_FUNDING_WORKSPACE_IDS: eligible
          ? ['workspace-id']
          : [],
        MANAGED_OPENROUTER_GEMMA_TEST_WORKSPACE_IDS: gemmaEligible
          ? ['workspace-id']
          : [],
      };

      return values[key];
    }),
  };

  return {
    operationService,
    metricsService,
    service: new ManagedOpenRouterModelService(
      operationService as unknown as ManagedProviderOperationService,
      config as unknown as TwentyConfigService,
      metricsService as never,
    ),
  };
};

const wrap = ({
  model,
  service,
  executionSurface = 'chat',
  modelConfig: wrappedModelConfig = modelConfig,
  providerName = 'openrouter',
}: {
  model: LanguageModel;
  modelConfig?: AiModelConfig;
  service: ManagedOpenRouterModelService;
  executionSurface?:
    | 'rest-generate'
    | 'graphql-agent'
    | 'chat'
    | 'title'
    | 'evaluator-grader'
    | 'workflow-background';
  providerName?: string;
}) => {
  const wrappedModel = service.wrapModel({
    actorUserWorkspaceId: 'user-workspace-id',
    executionSurface,
    model,
    modelConfig: wrappedModelConfig,
    providerName,
    requestIdRoot: 'chat-turn-1',
    workspaceId: 'workspace-id',
  });

  return wrappedModel as LanguageModelV3;
};

describe('ManagedOpenRouterModelService', () => {
  it('returns non-OpenRouter models unchanged', () => {
    const { service } = createService({ eligible: false });
    const { model } = createProviderModel();

    expect(wrap({ model, providerName: 'openai', service })).toBe(model);
  });

  it('rejects approved OpenRouter models before provider I/O while disabled', () => {
    const { service } = createService({ enabled: false });
    const { model } = createProviderModel();

    expect(() => wrap({ model, service })).toThrow(
      'Managed OpenRouter generation failed',
    );
  });
  it('rejects an ineligible workspace before provider I/O', () => {
    const { operationService, service } = createService({ eligible: false });
    const { doGenerate, model } = createProviderModel();

    expect(() => wrap({ model, service })).toThrow(
      'Managed OpenRouter generation failed',
    );
    expect(doGenerate).not.toHaveBeenCalled();
    expect(operationService.reserveOperation).not.toHaveBeenCalled();
  });

  it('leaves an explicitly named custom OpenRouter provider on the BYOK path', () => {
    const { service } = createService({
      customOpenRouter: true,
      eligible: false,
    });
    const { model } = createProviderModel();

    expect(wrap({ model, providerName: 'openrouter-custom', service })).toBe(
      model,
    );
    expect(
      service.isManagedModel({
        modelId: modelConfig.modelId,
        providerName: 'openrouter-custom',
      }),
    ).toBe(false);
  });

  it('rejects BYOK model selection for a managed workspace', () => {
    const { service } = createService({ customOpenRouter: true });
    const { model } = createProviderModel();

    expect(() =>
      wrap({ model, providerName: 'openrouter-custom', service }),
    ).toThrow('Managed OpenRouter generation failed');
  });

  it('reserves before provider I/O and completes one billable operation', async () => {
    const order: string[] = [];
    const { operationService, service } = createService();
    operationService.reserveOperation.mockImplementation(async () => {
      order.push('reserve');

      return {
        id: 'operation-1',
        state: ManagedProviderOperationState.RESERVED,
      };
    });
    operationService.completeOperation.mockImplementation(async () => {
      order.push('complete');
    });
    const { doGenerate, model } = createProviderModel();

    doGenerate.mockImplementation(async () => {
      order.push('provider');

      return {
        content: [{ type: 'text', text: 'hello' }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage,
        response: {
          headers: { 'x-generation-id': 'generation-1' },
          id: 'response-1',
        },
        warnings: [],
      };
    });

    const managedModel = wrap({ model, service });

    await managedModel.doGenerate({
      maxOutputTokens: 100,
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
    } as never);

    expect(order).toEqual(['reserve', 'provider', 'complete']);
    expect(operationService.reserveOperation).toHaveBeenCalledWith(
      expect.any(Object),
      { rejectReplay: true },
    );
    expect(operationService.reserveOperation.mock.calls[0][0].requestId).toBe(
      'chat:chat-turn-1:0',
    );
    expect(operationService.attachProviderExecutionId).toHaveBeenCalledWith({
      operationId: 'operation-1',
      providerConfigurationKey: 'openrouter/deepseek/deepseek-v4-flash',
      providerExecutionId: 'generation-1',
      providerKey: 'openrouter',
      workspaceId: 'workspace-id',
    });
    expect(operationService.completeOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        actualUsageProperties: expect.objectContaining({
          inputUnits: 12,
          inputNoCacheUnits: 12,
          inputCacheReadUnits: 0,
          inputCacheWriteUnits: 0,
          model: 'openrouter/deepseek/deepseek-v4-flash',
          outputUnits: 7,
          tariffVersion: MANAGED_OPENROUTER_TARIFF_VERSION,
          chargeCentUnits: 1,
          charge_cent_unit: '1',
          model_id: 'openrouter/deepseek/deepseek-v4-flash',
          operation_id: 'operation-1',
          tariff_version: MANAGED_OPENROUTER_TARIFF_VERSION,
        }),
        actorUserWorkspaceId: 'user-workspace-id',
        operationId: 'operation-1',
        outcome: 'BILLABLE',
        providerCostMicrousd: '3',
        providerExecutionId: 'generation-1',
        workspaceId: 'workspace-id',
      }),
    );
  });
  it.each([
    [{ type: 'image', image: 'https://example.com/image.png' }],
    [
      {
        type: 'file',
        data: 'https://example.com/document.pdf',
        mediaType: 'application/pdf',
      },
    ],
  ])(
    'rejects URL-backed multimodal content before reservation or provider I/O',
    async (part) => {
      const { operationService, service } = createService();
      const { doGenerate, model } = createProviderModel();

      await expect(
        wrap({ model, service }).doGenerate({
          prompt: [{ role: 'user', content: [part] }],
        } as never),
      ).rejects.toThrow('Managed OpenRouter generation failed');

      expect(operationService.reserveOperation).not.toHaveBeenCalled();
      expect(doGenerate).not.toHaveBeenCalled();
    },
  );

  it('uses authoritative raw cache usage when V3 strips cache-write fields', async () => {
    const { operationService, service } = createService();
    const { doGenerate, model } = createProviderModel();
    doGenerate.mockResolvedValue({
      content: [{ type: 'text', text: 'hello' }],
      finishReason: { unified: 'stop', raw: 'stop' },
      response: { id: 'generation-1' },
      usage: {
        inputTokens: {
          total: 100,
          noCache: 99,
          cacheRead: 10,
          cacheWrite: 1,
        },
        outputTokens: { total: 7 },
        raw: {
          cost: 0.000002548,
          prompt_tokens_details: {
            cache_write_tokens: 20,
            cached_tokens: 10,
          },
        },
      },
      warnings: [],
    });

    await expect(
      wrap({ model, service }).doGenerate({ prompt: [] } as never),
    ).resolves.toEqual(
      expect.objectContaining({
        usage: expect.objectContaining({
          inputTokens: expect.objectContaining({ total: 100 }),
          outputTokens: expect.objectContaining({ total: 7 }),
        }),
      }),
    );
    expect(operationService.completeOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        actualUsageProperties: expect.objectContaining({
          inputNoCacheUnits: 70,
          inputCacheReadUnits: 10,
          inputCacheWriteUnits: 20,
          outputUnits: 7,
        }),
        outcome: 'BILLABLE',
      }),
    );
  });
  it('fails closed when cache evidence is contradictory or incomplete', async () => {
    const { operationService, service } = createService();
    const { doGenerate, model } = createProviderModel();
    doGenerate.mockResolvedValue({
      content: [{ type: 'text', text: 'hello' }],
      finishReason: { unified: 'stop', raw: 'stop' },
      response: { id: 'generation-1' },
      usage: {
        inputTokens: {
          total: 12,
          noCache: 12,
        },
        outputTokens: { total: 7 },
        raw: { cost: 0.000002548 },
      },
      warnings: [],
    });

    await expect(
      wrap({ model, service }).doGenerate({ prompt: [] } as never),
    ).rejects.toThrow('Managed OpenRouter generation failed');
    expect(operationService.completeOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'UNKNOWN',
        providerExecutionId: 'generation-1',
      }),
    );
  });

  it('bills the temporary free-route model at its paid reference tariff', async () => {
    const freeRouteModelConfig: AiModelConfig = {
      ...modelConfig,
      cachedInputCostPerMillionTokens: 0.18,
      inputCostPerMillionTokens: 0.32,
      modelId: 'openrouter/google/gemma-4-31b-it:free',
      outputCostPerMillionTokens: 0.79,
    };
    const { operationService, service } = createService();
    const { model } = createProviderModel();
    const managedModel = wrap({
      model,
      modelConfig: freeRouteModelConfig,
      service,
    });

    await managedModel.doGenerate({
      maxOutputTokens: 100,
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
    } as never);

    expect(operationService.reserveOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        maximumUsageProperties: expect.objectContaining({
          chargeCentUnits: 1,
          inputRate: 0.22,
          outputRate: 0.55,
        }),
        providerConfigurationKey: 'openrouter/google/gemma-4-31b-it:free',
      }),
      { rejectReplay: true },
    );
    expect(operationService.completeOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        actualUsageProperties: expect.objectContaining({
          chargeCentUnits: 1,
          inputRate: 0.22,
          outputRate: 0.55,
        }),
        providerConfigurationKey: 'openrouter/google/gemma-4-31b-it:free',
      }),
    );
  });

  it('rejects Gemma outside its narrower test audience', () => {
    const { service } = createService({ gemmaEligible: false });
    const { model } = createProviderModel();

    expect(() =>
      wrap({
        model,
        modelConfig: {
          ...modelConfig,
          modelId: 'openrouter/google/gemma-4-31b-it:free',
        },
        service,
      }),
    ).toThrow('Managed OpenRouter generation failed');
  });

  it('bounds provider requests and applies managed routing controls without PII', async () => {
    const { service } = createService();
    const { doGenerate, model } = createProviderModel();

    await wrap({ model, service }).doGenerate({
      maxOutputTokens: 100_000,
      prompt: [],
    } as never);

    const [request] = doGenerate.mock.calls[0] as [
      { maxOutputTokens: number; providerOptions: Record<string, unknown> },
    ];
    const options = request.providerOptions.openrouter as Record<string, any>;

    expect(request.maxOutputTokens).toBe(100_000);
    expect(options.user).toMatch(/^managed-[a-f0-9]{24}$/);
    expect(options.user).not.toContain('workspace-id');
  });

  it('rejects a successful provider result without a generation id', async () => {
    const { operationService, service } = createService();
    const { doGenerate, model } = createProviderModel();
    doGenerate.mockResolvedValue({
      content: [],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage,
      response: {},
      warnings: [],
    });

    await expect(
      wrap({ model, service }).doGenerate({ prompt: [] } as never),
    ).rejects.toThrow('Managed OpenRouter generation failed');
    expect(operationService.completeOperation).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'UNKNOWN' }),
    );
  });

  it.each([0, -1, Number.NaN])(
    'rejects invalid requested output limit %p before reservation',
    async (maxOutputTokens) => {
      const { operationService, service } = createService();
      const { doGenerate, model } = createProviderModel();

      await expect(
        wrap({ model, service }).doGenerate({
          maxOutputTokens,
          prompt: [],
        } as never),
      ).rejects.toThrow('Managed AI request has an invalid output limit');
      expect(operationService.reserveOperation).not.toHaveBeenCalled();
      expect(doGenerate).not.toHaveBeenCalled();
    },
  );

  it('rejects a request that leaves no context capacity for output', async () => {
    const { operationService, service } = createService();
    const { doGenerate, model } = createProviderModel();
    const byteLengthSpy = jest
      .spyOn(Buffer, 'byteLength')
      .mockReturnValueOnce(modelConfig.contextWindowTokens - 256);

    try {
      await expect(
        wrap({ model, service }).doGenerate({ prompt: [] } as never),
      ).rejects.toThrow('Managed AI request leaves no output capacity');
    } finally {
      byteLengthSpy.mockRestore();
    }
    expect(operationService.reserveOperation).not.toHaveBeenCalled();
    expect(doGenerate).not.toHaveBeenCalled();
  });

  it('never calls OpenRouter when reservation fails', async () => {
    const { operationService, service } = createService();
    const reservationError = new Error('insufficient prepaid balance');

    operationService.reserveOperation.mockRejectedValue(reservationError);
    const { doGenerate, model } = createProviderModel();

    await expect(
      wrap({ model, service }).doGenerate({ prompt: [] } as never),
    ).rejects.toBe(reservationError);
    expect(doGenerate).not.toHaveBeenCalled();
    expect(operationService.completeOperation).not.toHaveBeenCalled();
  });

  it('marks an uncertain provider failure for reconciliation without recording payloads', async () => {
    const { operationService, service } = createService();
    const providerError = new Error('Authorization: Bearer secret prompt body');
    const { doGenerate, model } = createProviderModel();

    doGenerate.mockRejectedValue(providerError);

    await expect(
      wrap({ model, service }).doGenerate({ prompt: [] } as never),
    ).rejects.toThrow('Managed OpenRouter generation failed');
    expect(operationService.completeOperation).toHaveBeenCalledWith({
      actualUsageProperties: {
        inputUnits: 0,
        model: 'openrouter/deepseek/deepseek-v4-flash',
        outputUnits: 0,
      },
      actorUserWorkspaceId: 'user-workspace-id',
      operationId: 'operation-1',
      operationKey: 'generation',
      outcome: 'UNKNOWN',
      providerConfigurationKey: 'openrouter/deepseek/deepseek-v4-flash',
      providerCostMicrousd: null,
      providerExecutionId: null,
      providerKey: 'openrouter',
      workspaceId: 'workspace-id',
    });
    expect(
      JSON.stringify(operationService.completeOperation.mock.calls),
    ).not.toContain('secret prompt body');
  });

  it.each([401, 402, 403])(
    'releases a reservation for a definite pre-execution %s rejection',
    async (statusCode) => {
      const { operationService, service } = createService();
      const providerError = Object.assign(new Error('provider rejected'), {
        statusCode,
      });
      const { doGenerate, model } = createProviderModel();

      doGenerate.mockRejectedValue(providerError);

      await expect(
        wrap({ model, service }).doGenerate({ prompt: [] } as never),
      ).rejects.toThrow('Managed OpenRouter generation failed');
      expect(operationService.completeOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: 'NON_BILLABLE_FAILURE',
          providerExecutionId: null,
        }),
      );
    },
  );

  it('completes streaming usage before forwarding the finish part', async () => {
    const order: string[] = [];
    const { operationService, service } = createService();
    operationService.completeOperation.mockImplementation(async () => {
      order.push('complete');
    });
    const { doStream, model } = createProviderModel();

    doStream.mockResolvedValue({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({
            type: 'response-metadata',
            id: 'stream-generation-1',
          });
          controller.enqueue({ type: 'text-start', id: 'text-1' });
          controller.enqueue({ type: 'text-delta', id: 'text-1', delta: 'hi' });
          controller.enqueue({
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage,
          });
          controller.close();
        },
      }),
      request: { body: {} },
      warnings: [],
    });
    const result = await wrap({ model, service }).doStream({
      prompt: [],
    } as never);
    const reader = result.stream.getReader();
    const partTypes: string[] = [];

    while (true) {
      const part = await reader.read();

      if (part.done) {
        break;
      }

      partTypes.push(part.value.type);

      if (part.value.type === 'finish') {
        order.push('finish');
      }
    }

    expect(partTypes).toEqual([
      'response-metadata',
      'text-start',
      'text-delta',
      'finish',
    ]);
    expect(order).toEqual(['complete', 'finish']);
    expect(operationService.completeOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'BILLABLE',
        providerExecutionId: 'stream-generation-1',
      }),
    );
  });
  it('arbitrates a late cancellation after finish as one billable completion', async () => {
    let releaseCompletion!: () => void;
    const completionReleased = new Promise<void>((resolve) => {
      releaseCompletion = resolve;
    });
    const { operationService, service } = createService();
    operationService.completeOperation.mockImplementation(
      async ({ outcome }) => {
        if (outcome === 'BILLABLE') {
          await completionReleased;
        }
      },
    );
    const { doStream, model } = createProviderModel();

    doStream.mockResolvedValue({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({
            type: 'response-metadata',
            id: 'stream-generation-1',
          });
          controller.enqueue({ type: 'finish', usage });
        },
      }),
      request: { body: {} },
      warnings: [],
    });

    const result = await wrap({ model, service }).doStream({
      prompt: [],
    } as never);
    const reader = result.stream.getReader();
    await reader.read();
    const finishRead = reader.read();
    await Promise.resolve();
    const cancel = reader.cancel('late client cancellation');
    releaseCompletion();

    await finishRead;
    await cancel;

    expect(operationService.completeOperation).toHaveBeenCalledTimes(1);
    expect(operationService.completeOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'BILLABLE',
        providerExecutionId: 'stream-generation-1',
      }),
    );
  });

  it('marks a cancelled stream as unknown', async () => {
    const { operationService, service } = createService();
    const { doStream, model } = createProviderModel();

    doStream.mockResolvedValue({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({
            type: 'response-metadata',
            id: 'stream-generation-1',
          });
        },
      }),
      request: { body: {} },
      warnings: [],
    });
    const result = await wrap({ model, service }).doStream({
      prompt: [],
    } as never);
    const reader = result.stream.getReader();

    await reader.read();
    await reader.cancel('client aborted');

    expect(operationService.completeOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'UNKNOWN',
        providerExecutionId: 'stream-generation-1',
      }),
    );
    expect(operationService.attachProviderExecutionId).toHaveBeenCalledWith({
      operationId: 'operation-1',
      providerConfigurationKey: modelConfig.modelId,
      providerExecutionId: 'stream-generation-1',
      providerKey: 'openrouter',
      workspaceId: 'workspace-id',
    });
  });

  it('does not forward provider error payloads from a managed stream', async () => {
    const { operationService, service } = createService();
    const { doStream, model } = createProviderModel();

    doStream.mockResolvedValue({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({
            type: 'error',
            error: new Error('Authorization: Bearer managed-secret'),
          });
        },
      }),
      request: { body: {} },
      warnings: [],
    });
    const result = await wrap({ model, service }).doStream({
      prompt: [],
    } as never);
    const reader = result.stream.getReader();

    await expect(reader.read()).rejects.toThrow(
      'Managed OpenRouter generation failed',
    );
    expect(operationService.completeOperation).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'UNKNOWN' }),
    );
  });

  it('uses a distinct deterministic ordinal for each model invocation', async () => {
    const { operationService, service } = createService();
    const { model } = createProviderModel();
    const managedModel = wrap({ model, service });

    await managedModel.doGenerate({ prompt: [] } as never);
    await managedModel.doGenerate({ prompt: [] } as never);

    expect(
      operationService.reserveOperation.mock.calls.map(
        ([input]) => input.requestId,
      ),
    ).toEqual(['chat:chat-turn-1:0', 'chat:chat-turn-1:1']);
  });

  it('separates operation identity by execution surface for the same caller root', async () => {
    const { operationService, service } = createService();
    const first = createProviderModel();
    const second = createProviderModel();
    const firstWrapped = wrap({
      executionSurface: 'chat',
      model: first.model,
      service,
    });
    const secondWrapped = wrap({
      executionSurface: 'rest-generate',
      model: second.model,
      service,
    });

    await firstWrapped.doGenerate({ prompt: [] } as never);
    await secondWrapped.doGenerate({ prompt: [] } as never);

    expect(
      operationService.reserveOperation.mock.calls.map(
        ([input]) => input.requestId,
      ),
    ).toEqual(['chat:chat-turn-1:0', 'rest-generate:chat-turn-1:0']);
  });

  it('reserves the maximum long-context tariff and bills short usage at the base tariff', async () => {
    const { operationService, service } = createService();
    operationService.reserveOperation.mockResolvedValue({
      id: 'operation-1',
      reservedAmountCents: '42',
      state: ManagedProviderOperationState.RESERVED,
    });
    const { doGenerate, model } = createProviderModel();
    doGenerate.mockResolvedValue({
      content: [{ type: 'text', text: 'hello' }],
      finishReason: { unified: 'stop', raw: 'stop' },
      response: { id: 'generation-1' },
      usage: {
        inputTokens: {
          cacheRead: 0,
          cacheWrite: 0,
          noCache: 12,
          total: 12,
        },
        outputTokens: {
          reasoning: 0,
          text: 32_768,
          total: 32_768,
        },
        raw: { cost: 0.281_2 },
      },
      warnings: [],
    });
    const expensiveModelConfig: AiModelConfig = {
      ...modelConfig,
      inputCostPerMillionTokens: 2,
      longContextCost: {
        cachedInputCostPerMillionTokens: 0.6,
        inputCostPerMillionTokens: 4,
        outputCostPerMillionTokens: 12,
        thresholdTokens: 200_000,
      },
      modelId: 'openrouter/x-ai/grok-4.5',
      outputCostPerMillionTokens: 6,
    };

    await wrap({
      model,
      modelConfig: expensiveModelConfig,
      service,
    }).doGenerate({
      maxOutputTokens: 32_768,
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
    } as never);

    expect(operationService.reserveOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        maximumUsageProperties: expect.objectContaining({
          baseInputRate: 2,
          baseOutputRate: 6,
          chargeCentUnits: 57,
          inputRate: 4,
          longContextThreshold: 200_000,
          outputRate: 12,
        }),
      }),
      { rejectReplay: true },
    );
    expect(operationService.completeOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        actualUsageProperties: expect.objectContaining({
          chargeCentUnits: 29,
          inputRate: 2,
          outputRate: 6,
        }),
      }),
    );
  });
});
