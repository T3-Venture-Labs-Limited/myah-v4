import { generateText } from 'ai';

import type { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AiGenerateTextController } from 'src/engine/metadata-modules/ai/ai-generate-text/controllers/ai-generate-text.controller';
import type { GenerateTextInput } from 'src/engine/metadata-modules/ai/ai-generate-text/dtos/generate-text.input';
import {
  AI_TELEMETRY_CONFIG,
  MANAGED_AI_TELEMETRY_CONFIG,
} from 'src/engine/metadata-modules/ai/ai-models/constants/ai-telemetry.const';

jest.mock('ai', () => ({ generateText: jest.fn() }));

const generateTextMock = jest.mocked(generateText);

const workspace = {
  fastModel: 'model-id',
  id: 'workspace-id',
} as WorkspaceEntity;

const input = {
  operationId: 'operation-id',
  systemPrompt: 'System prompt',
  userPrompt: 'User prompt',
} as GenerateTextInput;

const createController = (usesManagedOpenRouter: boolean) => {
  const aiModelRegistryService = {
    getAvailableModels: jest.fn(() => [{}]),
    getEffectiveModelConfig: jest.fn(() => ({})),
    resolveModelForAgent: jest.fn().mockResolvedValue({
      model: { modelId: 'execution-model' },
      modelId: 'model-id',
      providerName: 'openai',
    }),
    validateModelAvailability: jest.fn(),
  };
  const aiBillingService = {
    calculateAndBillUsage: jest.fn(),
  };
  const billingUsageService = {
    hasAvailableCreditsOrThrow: jest.fn(),
  };
  const managedOpenRouterModelService = {
    isManagedModel: jest.fn(() => usesManagedOpenRouter),
    wrapModel: jest.fn(() => ({ modelId: 'wrapped-model' })),
  };

  return new AiGenerateTextController(
    aiModelRegistryService as never,
    aiBillingService as never,
    billingUsageService as never,
    managedOpenRouterModelService as never,
  );
};

describe('AiGenerateTextController Sentry telemetry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    generateTextMock.mockResolvedValue({
      text: 'Generated answer',
      usage: {
        inputTokenDetails: { cacheWriteTokens: 0 },
        inputTokens: 10,
        outputTokens: 5,
      },
    } as never);
  });

  it('records maximum-context telemetry for unmanaged providers', async () => {
    const controller = createController(false);

    await controller.handleGenerateText(input, workspace, 'user-workspace-id');

    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        experimental_telemetry: AI_TELEMETRY_CONFIG,
      }),
    );
  });

  it('uses the redacted managed-provider telemetry policy', async () => {
    const controller = createController(true);

    await controller.handleGenerateText(input, workspace, 'user-workspace-id');

    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        experimental_telemetry: MANAGED_AI_TELEMETRY_CONFIG,
        maxRetries: 0,
      }),
    );
  });
});
