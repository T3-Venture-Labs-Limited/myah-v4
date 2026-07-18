import { streamText } from 'ai';

import { MetricsKeys } from 'src/engine/core-modules/metrics/types/metrics-keys.type';
import { ChatExecutionService } from 'src/engine/metadata-modules/ai/ai-chat/services/chat-execution.service';
import { REQUEST_APPROVAL_TOOL_NAME } from 'twenty-shared/ai';

jest.mock('ai', () => ({
  ...jest.requireActual('ai'),
  streamText: jest.fn(() => ({
    usage: Promise.resolve({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    }),
    steps: Promise.resolve([]),
  })),
}));

const buildService = () => {
  const toolRegistry = {
    buildToolIndex: jest.fn().mockResolvedValue([]),
    getToolsByName: jest.fn().mockResolvedValue({}),
    resolveAndExecute: jest.fn().mockResolvedValue({ success: true }),
  };
  const skillService = {
    findAllFlatSkills: jest.fn().mockResolvedValue([]),
    findFlatSkillsByNames: jest.fn().mockResolvedValue([]),
  };
  const aiModelRegistryService = {
    validateModelAvailability: jest.fn(),
    resolveModelForAgent: jest.fn().mockResolvedValue({
      modelId: 'test-model',
      model: 'test-model-sdk-object',
      sdkPackage: 'openai',
    }),
    getEffectiveModelConfig: jest.fn().mockReturnValue({
      contextWindowTokens: 128_000,
      modalities: ['text'],
    }),
  };
  const aiBillingService = {
    calculateCost: jest.fn().mockReturnValue(0),
    emitAiTokenUsageEvent: jest.fn().mockResolvedValue(undefined),
    billNativeWebSearchUsage: jest.fn().mockResolvedValue(undefined),
    decrementAndCheckAvailableCredits: jest
      .fn()
      .mockResolvedValue({ hasNoMoreAvailableCredits: false }),
  };
  const agentActorContextService = {
    buildUserAndAgentActorContext: jest.fn().mockResolvedValue({
      actorContext: { source: 'USER' },
      roleId: 'role-id',
      userId: 'user-id',
      userContext: { locale: 'en' },
    }),
  };
  const workspaceDomainsService = {
    buildWorkspaceURL: jest.fn().mockReturnValue('http://localhost:2021'),
  };
  const codeInterpreterService = {
    isEnabled: jest.fn().mockReturnValue(false),
  };
  const systemPromptBuilder = {
    buildFullPrompt: jest.fn().mockReturnValue('system prompt'),
  };
  const exceptionHandlerService = {
    captureExceptions: jest.fn(),
  };
  const nativeToolBinder = {
    bind: jest.fn().mockReturnValue({}),
  };
  const brandBrainPreflightService = {
    run: jest.fn().mockResolvedValue({
      required: true,
      called: true,
      brandNameOrSlug: 'Acme Beauty Labs',
      brandSlug: 'acme-beauty-labs',
      pageCount: 11,
      hasRoot: true,
      hasIndex: true,
      hasLog: true,
      contextPart:
        '<brand_brain_preflight required="true" called="true">Offer: 15% creator affiliate code</brand_brain_preflight>',
      durationMs: 42,
      cacheHit: false,
      error: null,
    }),
    injectContextIntoLastUserMessage: jest.fn((messages, contextPart) => {
      const lastMessage = messages[messages.length - 1];

      return [
        ...messages.slice(0, -1),
        {
          ...lastMessage,
          parts: [...lastMessage.parts, { type: 'text', text: contextPart }],
        },
      ];
    }),
  };
  const messagePruningService = {
    pruneIfOverContextWindowLimit: jest.fn((messages) => ({
      messages,
      wasPruned: false,
      isStillOverLimit: false,
    })),
  };
  const metricsService = {
    recordHistogram: jest.fn(),
    incrementCounterBy: jest.fn(),
  };
  const instagramReplyDraftService = {};
  const instagramReplyApprovalService = {};

  const service = new ChatExecutionService(
    toolRegistry as never,
    skillService as never,
    aiModelRegistryService as never,
    aiBillingService as never,
    agentActorContextService as never,
    workspaceDomainsService as never,
    codeInterpreterService as never,
    systemPromptBuilder as never,
    exceptionHandlerService as never,
    nativeToolBinder as never,
    brandBrainPreflightService as never,
    messagePruningService as never,
    metricsService as never,
    instagramReplyDraftService as never,
    instagramReplyApprovalService as never,
  );

  return {
    service,
    toolRegistry,
    brandBrainPreflightService,
    metricsService,
  };
};

describe('ChatExecutionService Brand Brain preflight integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('injects Brand Brain preflight context before streaming the model response', async () => {
    const { service, brandBrainPreflightService, metricsService } =
      buildService();

    await service.streamChat({
      workspace: {
        id: 'workspace-id',
        smartModel: 'test-model',
        aiAdditionalInstructions: null,
      } as never,
      userWorkspaceId: 'user-workspace-id',
      threadId: 'thread-id',
      browsingContext: null,
      conversationSizeTokens: 10,
      messages: [
        {
          id: 'message-id',
          role: 'user',
          parts: [
            {
              type: 'text',
              text: 'Draft creator outreach for Acme Beauty Labs.',
            },
          ],
        },
      ],
      lastUserMessageText: 'Draft creator outreach for Acme Beauty Labs.',
    });

    expect(brandBrainPreflightService.run).toHaveBeenCalledWith(
      expect.objectContaining({
        lastUserMessageText: 'Draft creator outreach for Acme Beauty Labs.',
      }),
    );
    expect(
      brandBrainPreflightService.injectContextIntoLastUserMessage,
    ).toHaveBeenCalledWith(
      expect.any(Array),
      expect.stringContaining('<brand_brain_preflight'),
    );

    const streamTextCalls = (streamText as jest.Mock).mock.calls;
    const streamTextCall = streamTextCalls[streamTextCalls.length - 1]?.[0];

    expect(JSON.stringify(streamTextCall.messages)).toContain(
      '<brand_brain_preflight',
    );
    expect(JSON.stringify(streamTextCall.messages)).toContain(
      '15% creator affiliate code',
    );
    expect(metricsService.recordHistogram).toHaveBeenCalledWith(
      expect.objectContaining({
        key: MetricsKeys.AiChatBrandBrainPreflightMs,
        value: 42,
        attributes: expect.objectContaining({
          required: 'true',
          called: 'true',
          cacheHit: 'false',
        }),
      }),
    );
  });

  it('keeps the generic registered approval tool available after a local draft succeeds', async () => {
    const { service } = buildService();

    await service.streamChat({
      workspace: {
        id: 'workspace-id',
        smartModel: 'test-model',
        aiAdditionalInstructions: null,
      } as never,
      userWorkspaceId: 'user-workspace-id',
      threadId: 'thread-id',
      browsingContext: null,
      conversationSizeTokens: 10,
      messages: [
        {
          id: 'message-id',
          role: 'user',
          parts: [{ type: 'text', text: 'Send an Instagram reply.' }],
        },
      ],
    });

    const streamTextCalls = (streamText as jest.Mock).mock.calls;
    const streamTextCall = streamTextCalls[streamTextCalls.length - 1]?.[0];
    const beforeDraft = streamTextCall.prepareStep({
      steps: [],
      messages: [],
    });
    const afterDraft = streamTextCall.prepareStep({
      steps: [
        {
          toolResults: [
            {
              toolName: 'execute_tool',
              input: {
                toolName: 'prepare_instagram_reply_draft',
                arguments: {},
              },
              output: { success: true },
            },
          ],
        },
      ],
      messages: [],
    });

    expect(beforeDraft.activeTools).toContain(REQUEST_APPROVAL_TOOL_NAME);
    expect(afterDraft.activeTools).toContain(REQUEST_APPROVAL_TOOL_NAME);
  });

  it('keeps unrelated writes dispatcher-denied after an immediately approved Instagram card', async () => {
    const { service, toolRegistry } = buildService();

    toolRegistry.buildToolIndex.mockResolvedValue([
      {
        name: 'create_one_task',
        label: 'Create task',
        description: 'Create a task',
        category: 'DATABASE_CRUD',
        executionRef: {
          kind: 'database_crud',
          objectNameSingular: 'task',
          operation: 'create_one',
        },
      },
    ]);

    await service.streamChat({
      workspace: {
        id: 'workspace-id',
        smartModel: 'test-model',
        aiAdditionalInstructions: null,
      } as never,
      userWorkspaceId: 'user-workspace-id',
      threadId: 'thread-id',
      browsingContext: null,
      conversationSizeTokens: 10,
      messages: [
        {
          id: 'message-id',
          role: 'assistant',
          parts: [
            {
              type: `tool-${REQUEST_APPROVAL_TOOL_NAME}`,
              toolCallId: 'instagram-approval-call',
              state: 'output-available',
              input: {},
              output: {
                success: true,
                message: 'Instagram reply approved.',
                result: {
                  status: 'resolved',
                  decision: 'approved',
                  actionApprovalBindingId:
                    'b24f28a7-64bd-4cb8-ac5f-837536ca1d1b',
                },
              },
            },
          ],
        },
      ],
    });

    const streamTextCalls = (streamText as jest.Mock).mock.calls;
    const streamTextCall = streamTextCalls[streamTextCalls.length - 1]?.[0];
    const execution = streamTextCall.tools.execute_tool.execute({
      toolName: 'create_one_task',
      arguments: {},
    });

    await jest.runOnlyPendingTimersAsync();

    const result = await execution;

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        message: 'Tool "create_one_task" is not available',
      }),
    );
    expect(toolRegistry.resolveAndExecute).not.toHaveBeenCalled();
  });
});
