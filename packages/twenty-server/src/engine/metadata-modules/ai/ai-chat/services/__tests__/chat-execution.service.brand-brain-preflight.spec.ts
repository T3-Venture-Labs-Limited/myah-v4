import { streamText } from 'ai';

import { createExecuteToolTool } from 'src/engine/core-modules/tool-provider/tools/execute-tool.tool';
import { MANAGED_AI_TELEMETRY_CONFIG } from 'src/engine/metadata-modules/ai/ai-models/constants/ai-telemetry.const';
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
jest.mock(
  'src/engine/core-modules/tool-provider/tools/execute-tool.tool',
  () => {
    const actual = jest.requireActual(
      'src/engine/core-modules/tool-provider/tools/execute-tool.tool',
    );

    return {
      ...actual,
      createExecuteToolTool: jest.fn(actual.createExecuteToolTool),
    };
  },
);
type ChatStreamTextOptions = {
  messages: unknown[];
  tools: {
    execute_tool: {
      execute: (input: {
        toolName: string;
        arguments: Record<string, unknown>;
      }) => Promise<unknown>;
    };
    learn_tools: {
      execute: (input: {
        toolNames: string[];
        aspects?: string[];
      }) => Promise<unknown>;
    };
  };
};

const getLastChatStreamTextOptions = (): ChatStreamTextOptions => {
  const options = jest.mocked(streamText).mock.lastCall?.[0];

  if (!options) {
    throw new Error('Expected streamText to be called');
  }

  return options as unknown as ChatStreamTextOptions;
};

const buildService = ({ managed = false }: { managed?: boolean } = {}) => {
  const toolRegistry = {
    buildToolIndex: jest.fn().mockResolvedValue([]),
    getToolsByName: jest.fn().mockResolvedValue({}),
    getToolInfo: jest.fn().mockImplementation((toolNames: string[]) =>
      Promise.resolve(
        toolNames.includes('send_email')
          ? [
              {
                name: 'send_email',
                description: 'Send email',
                inputSchema: {},
              },
            ]
          : [],
      ),
    ),
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
      authContext: {
        type: 'user',
        workspace: { id: 'workspace-id' },
        userWorkspaceId: 'user-workspace-id',
        user: { id: 'user-id' },
        workspaceMemberId: 'workspace-member-id',
        workspaceMember: { id: 'workspace-member-id' },
      },
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
  const outreachEmailActionDefinition = {};
  const instagramReplyApprovalService = {};
  const managedOpenRouterModelService = {
    isManagedModel: jest.fn().mockReturnValue(managed),
    wrapModel: jest.fn(() => 'wrapped-managed-model'),
  };

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
    outreachEmailActionDefinition as never,
    instagramReplyApprovalService as never,
    managedOpenRouterModelService as never,
  );

  return {
    service,
    aiBillingService,
    managedOpenRouterModelService,
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
    const {
      service,
      brandBrainPreflightService,
      metricsService,
      toolRegistry,
    } = buildService();

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
      managedProviderRequestIdRoot: 'turn-id',
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
        toolContext: expect.objectContaining({
          authContext: expect.objectContaining({
            type: 'user',
            userWorkspaceId: 'user-workspace-id',
          }),
        }),
      }),
    );
    expect(toolRegistry.buildToolIndex).toHaveBeenCalledWith(
      'workspace-id',
      'role-id',
      expect.objectContaining({
        authContext: expect.objectContaining({
          type: 'user',
          userWorkspaceId: 'user-workspace-id',
        }),
        actorContext: { source: 'USER' },
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

  it('binds only the selected current-workspace Inbox thread into read/propose dispatch', async () => {
    const selectedThreadId = '3ceef358-55fc-4d47-a7a8-2d8ac543641b';
    const { service, toolRegistry } = buildService();
    const toolEntry = (name: string) => ({
      name,
      label: name,
      description: name,
      category: 'MYAH_INBOX',
      executionRef: { kind: 'static', toolId: name },
    });

    toolRegistry.buildToolIndex.mockResolvedValue([
      toolEntry('get_myah_inbox_thread_context'),
      toolEntry('generate_myah_inbox_reply_proposal'),
      toolEntry('save_myah_inbox_draft'),
      toolEntry('send_myah_inbox_reply'),
    ]);

    await service.streamChat({
      workspace: {
        id: 'workspace-id',
        smartModel: 'test-model',
        aiAdditionalInstructions: null,
      } as never,
      userWorkspaceId: 'user-workspace-id',
      threadId: 'chat-thread-id',
      browsingContext: {
        type: 'myahInboxThreadSelection',
        workspaceId: 'workspace-id',
        threadId: selectedThreadId,
      } as never,
      conversationSizeTokens: 10,
      managedProviderRequestIdRoot: 'turn-id',
      messages: [
        {
          id: 'message-id',
          role: 'user',
          parts: [{ type: 'text', text: 'Propose a reply to this selection.' }],
        },
      ],
    });
    const executeToolCalls = jest.mocked(createExecuteToolTool).mock.calls;
    const options = executeToolCalls[executeToolCalls.length - 1]?.[2];
    const allowedTools = [...(options?.allowedTools ?? [])];
    const excludedTools = [...(options?.excludeTools ?? [])];
    const streamTextCall = getLastChatStreamTextOptions();

    expect(allowedTools).toEqual(
      expect.arrayContaining([
        'get_myah_inbox_thread_context',
        'generate_myah_inbox_reply_proposal',
      ]),
    );
    expect(excludedTools).not.toContain('get_myah_inbox_thread_context');
    expect(excludedTools).not.toContain('generate_myah_inbox_reply_proposal');
    expect(allowedTools).not.toEqual(
      expect.arrayContaining([
        'save_myah_inbox_draft',
        'send_myah_inbox_reply',
      ]),
    );
    expect(JSON.stringify(streamTextCall.messages)).toContain(
      '<myah_inbox_selection',
    );
    expect(JSON.stringify(streamTextCall.messages)).not.toContain(
      selectedThreadId,
    );

    const execution = streamTextCall.tools.execute_tool.execute({
      toolName: 'get_myah_inbox_thread_context',
      arguments: {},
    });

    await jest.runOnlyPendingTimersAsync();
    await expect(execution).resolves.toEqual({ success: true });
    expect(toolRegistry.resolveAndExecute).toHaveBeenCalledWith(
      'get_myah_inbox_thread_context',
      {},
      expect.objectContaining({
        workspaceId: 'workspace-id',
        myahInboxSelection: {
          workspaceId: 'workspace-id',
          threadId: selectedThreadId,
        },
      }),
      expect.any(Object),
    );
  });

  it('blocks provider sends and schema discovery for a selected Inbox thread after generic approval', async () => {
    const selectedThreadId = '3ceef358-55fc-4d47-a7a8-2d8ac543641b';
    const { service, toolRegistry } = buildService();

    toolRegistry.buildToolIndex.mockResolvedValue([
      {
        name: 'send_email',
        label: 'Send email',
        description: 'Send email',
        category: 'ACTION',
        executionRef: { kind: 'static', toolId: 'send_email' },
      },
    ]);

    await service.streamChat({
      workspace: {
        id: 'workspace-id',
        smartModel: 'test-model',
        aiAdditionalInstructions: null,
      } as never,
      userWorkspaceId: 'user-workspace-id',
      threadId: 'chat-thread-id',
      browsingContext: {
        type: 'myahInboxThreadSelection',
        workspaceId: 'workspace-id',
        threadId: selectedThreadId,
      } as never,
      conversationSizeTokens: 10,
      managedProviderRequestIdRoot: 'turn-id',
      messages: [
        {
          id: 'approved-message-id',
          role: 'assistant',
          parts: [
            {
              type: `tool-${REQUEST_APPROVAL_TOOL_NAME}`,
              toolCallId: 'generic-approval-call',
              state: 'output-available',
              input: {},
              output: {
                result: {
                  status: 'resolved',
                  decision: 'approved',
                },
              },
            },
          ],
        },
      ],
    });

    const streamTextCall = getLastChatStreamTextOptions();
    const executeToolOptions = jest.mocked(createExecuteToolTool).mock
      .lastCall?.[2];

    expect(executeToolOptions?.excludeTools).toContain('send_email');
    const execution = streamTextCall.tools.execute_tool.execute({
      toolName: 'send_email',
      arguments: {},
    });
    const learned = streamTextCall.tools.learn_tools.execute({
      toolNames: ['send_email'],
    });

    await jest.runOnlyPendingTimersAsync();

    await expect(execution).resolves.toEqual(
      expect.objectContaining({
        success: false,
        message: 'Tool "send_email" is not available',
      }),
    );
    await expect(learned).resolves.toEqual({
      tools: [],
      notFound: [],
      message: 'No matching tools found.',
    });
    expect(toolRegistry.resolveAndExecute).not.toHaveBeenCalled();
    expect(toolRegistry.getToolInfo).toHaveBeenCalledWith(
      [],
      expect.anything(),
      undefined,
    );
  });

  it.each([
    ['no browsing context', null],
    [
      'an ordinary record page',
      {
        type: 'recordPage',
        objectNameSingular: 'messageThread',
        recordId: '3ceef358-55fc-4d47-a7a8-2d8ac543641b',
      },
    ],
  ])('denies Inbox dispatch with %s', async (_label, browsingContext) => {
    const { service, toolRegistry } = buildService();

    toolRegistry.buildToolIndex.mockResolvedValue([
      {
        name: 'get_myah_inbox_thread_context',
        label: 'Get Inbox context',
        description: 'Get Inbox context',
        category: 'MYAH_INBOX',
        executionRef: {
          kind: 'static',
          toolId: 'get_myah_inbox_thread_context',
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
      threadId: 'chat-thread-id',
      browsingContext: browsingContext as never,
      conversationSizeTokens: 10,
      managedProviderRequestIdRoot: 'turn-id',
      messages: [
        {
          id: 'message-id',
          role: 'user',
          parts: [{ type: 'text', text: 'Read that Inbox thread.' }],
        },
      ],
    });
    const streamTextCall = getLastChatStreamTextOptions();
    const execution = streamTextCall.tools.execute_tool.execute({
      toolName: 'get_myah_inbox_thread_context',
      arguments: {
        threadId: '3ceef358-55fc-4d47-a7a8-2d8ac543641b',
      },
    });

    await jest.runOnlyPendingTimersAsync();
    await expect(execution).resolves.toEqual(
      expect.objectContaining({
        success: false,
        message: 'Tool "get_myah_inbox_thread_context" is not available',
      }),
    );
    expect(toolRegistry.resolveAndExecute).not.toHaveBeenCalled();
    if (browsingContext?.type === 'recordPage') {
      expect(JSON.stringify(streamTextCall.messages)).toContain(
        'Do not call any tools based on this context.',
      );
    }
  });

  it('denies a cross-workspace Inbox selection before tool dispatch', async () => {
    const { service, toolRegistry } = buildService();

    toolRegistry.buildToolIndex.mockResolvedValue([
      {
        name: 'get_myah_inbox_thread_context',
        label: 'Get Inbox context',
        description: 'Get Inbox context',
        category: 'MYAH_INBOX',
        executionRef: {
          kind: 'static',
          toolId: 'get_myah_inbox_thread_context',
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
      threadId: 'chat-thread-id',
      browsingContext: {
        type: 'myahInboxThreadSelection',
        workspaceId: 'foreign-workspace-id',
        threadId: '3ceef358-55fc-4d47-a7a8-2d8ac543641b',
      } as never,
      conversationSizeTokens: 10,
      managedProviderRequestIdRoot: 'turn-id',
      messages: [
        {
          id: 'message-id',
          role: 'user',
          parts: [{ type: 'text', text: 'Read this selection.' }],
        },
      ],
    });
    const streamTextCall = getLastChatStreamTextOptions();
    const execution = streamTextCall.tools.execute_tool.execute({
      toolName: 'get_myah_inbox_thread_context',
      arguments: {},
    });

    await jest.runOnlyPendingTimersAsync();
    await expect(execution).resolves.toEqual(
      expect.objectContaining({ success: false }),
    );
    expect(toolRegistry.resolveAndExecute).not.toHaveBeenCalled();
  });

  it('returns the dispatcher denial for a stale selected Inbox thread', async () => {
    const { service, toolRegistry } = buildService();
    const selectedThreadId = '3ceef358-55fc-4d47-a7a8-2d8ac543641b';

    toolRegistry.buildToolIndex.mockResolvedValue([
      {
        name: 'get_myah_inbox_thread_context',
        label: 'Get Inbox context',
        description: 'Get Inbox context',
        category: 'MYAH_INBOX',
        executionRef: {
          kind: 'static',
          toolId: 'get_myah_inbox_thread_context',
        },
      },
    ]);
    toolRegistry.resolveAndExecute.mockResolvedValue({
      success: false,
      message: 'Selected Inbox thread is not available',
    });

    await service.streamChat({
      workspace: {
        id: 'workspace-id',
        smartModel: 'test-model',
        aiAdditionalInstructions: null,
      } as never,
      userWorkspaceId: 'user-workspace-id',
      threadId: 'chat-thread-id',
      browsingContext: {
        type: 'myahInboxThreadSelection',
        workspaceId: 'workspace-id',
        threadId: selectedThreadId,
      } as never,
      conversationSizeTokens: 10,
      managedProviderRequestIdRoot: 'turn-id',
      messages: [
        {
          id: 'message-id',
          role: 'user',
          parts: [{ type: 'text', text: 'Read this selection.' }],
        },
      ],
    });
    const streamTextCall = getLastChatStreamTextOptions();
    const execution = streamTextCall.tools.execute_tool.execute({
      toolName: 'get_myah_inbox_thread_context',
      arguments: {},
    });

    await jest.runOnlyPendingTimersAsync();
    await expect(execution).resolves.toEqual({
      success: false,
      message: 'Selected Inbox thread is not available',
    });
    expect(toolRegistry.resolveAndExecute).toHaveBeenCalledWith(
      'get_myah_inbox_thread_context',
      {},
      expect.objectContaining({
        myahInboxSelection: {
          workspaceId: 'workspace-id',
          threadId: selectedThreadId,
        },
      }),
      expect.any(Object),
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
      managedProviderRequestIdRoot: 'turn-id',
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
      managedProviderRequestIdRoot: 'turn-id',
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
  it('wraps managed OpenRouter before streaming and bypasses local credits', async () => {
    const { aiBillingService, managedOpenRouterModelService, service } =
      buildService({ managed: true });

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
      managedProviderRequestIdRoot: 'turn-id',
      messages: [
        {
          id: 'message-id',
          role: 'user',
          parts: [{ type: 'text', text: 'Hello' }],
        },
      ],
      lastUserMessageText: 'Hello',
    });

    expect(managedOpenRouterModelService.wrapModel).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserWorkspaceId: 'user-workspace-id',
        model: 'test-model-sdk-object',
        requestIdRoot: 'turn-id',
        workspaceId: 'workspace-id',
      }),
    );
    expect(
      aiBillingService.decrementAndCheckAvailableCredits,
    ).not.toHaveBeenCalled();
    expect(streamText).toHaveBeenLastCalledWith(
      expect.objectContaining({ model: 'wrapped-managed-model' }),
    );
    expect(streamText).toHaveBeenLastCalledWith(
      expect.objectContaining({
        experimental_telemetry: MANAGED_AI_TELEMETRY_CONFIG,
      }),
    );
  });
  it('does not record learned tool or skill input values in managed metrics', async () => {
    const { service, metricsService } = buildService({ managed: true });
    (streamText as jest.Mock).mockImplementationOnce((options) => {
      void options.onStepFinish({
        content: [
          {
            type: 'tool-result',
            toolName: 'learn_tools',
            input: { toolNames: ['secret_tool_name'] },
            output: { success: true },
            toolCallId: 'call-1',
          },
          {
            type: 'tool-result',
            toolName: 'load_skills',
            input: { skillNames: ['private-skill-name'] },
            output: { success: true },
            toolCallId: 'call-2',
          },
        ],
        usage: { outputTokens: 2, inputTokens: 3, totalTokens: 5 },
        toolCalls: [],
        providerMetadata: undefined,
      });
      return {
        usage: Promise.resolve({
          inputTokens: 3,
          outputTokens: 2,
          totalTokens: 5,
        }),
        steps: Promise.resolve([]),
      };
    });

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
      managedProviderRequestIdRoot: 'turn-id',
      messages: [
        {
          id: 'message-id',
          role: 'user',
          parts: [{ type: 'text', text: 'Hello' }],
        },
      ],
      lastUserMessageText: 'Hello',
    });

    const calls = metricsService.incrementCounterBy.mock.calls;
    expect(JSON.stringify(calls)).not.toContain('secret_tool_name');
    expect(JSON.stringify(calls)).not.toContain('private-skill-name');
    expect(calls).toEqual(
      expect.arrayContaining([
        [
          expect.objectContaining({
            key: MetricsKeys.AiChatToolExecutionSucceeded,
          }),
        ],
      ]),
    );
  });
});
