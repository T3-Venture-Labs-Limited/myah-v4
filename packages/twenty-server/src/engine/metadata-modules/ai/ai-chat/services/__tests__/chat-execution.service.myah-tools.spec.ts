import { streamText } from 'ai';

import { createExecuteToolTool } from 'src/engine/core-modules/tool-provider/tools/execute-tool.tool';
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

type ActiveTools = {
  execute_tool: {
    execute: (input: {
      toolName: string;
      arguments: Record<string, unknown>;
    }) => Promise<unknown>;
  };
  learn_tools: {
    execute: (input: {
      toolNames: string[];
      aspects?: Array<'description' | 'schema'>;
    }) => Promise<unknown>;
  };
  load_skills: {
    execute: (input: { skillNames: string[] }) => Promise<unknown>;
  };
};

const getActiveTools = (): ActiveTools => {
  const options = jest.mocked(streamText).mock.lastCall?.[0];

  if (!options) {
    throw new Error('Expected ChatExecutionService to start streamText');
  }

  // streamText mock retains only the tool set exercised by this harness.
  const activeOptions = options as unknown as { tools: ActiveTools };

  return activeOptions.tools;
};

const toolEntry = (name: string) => ({
  name,
  label: name,
  description: name,
  category: 'MYAH_INBOX',
  executionRef: { kind: 'static', toolId: name },
});

const buildService = () => {
  const toolRegistry = {
    buildToolIndex: jest
      .fn()
      .mockResolvedValue([
        toolEntry('get_campaign_audience'),
        toolEntry('get_campaign_outreach_workflow'),
        toolEntry('search_myah_inbox_threads'),
        toolEntry('get_myah_inbox_thread_context'),
        toolEntry('generate_myah_inbox_reply_proposal'),
        toolEntry('get_myah_inbox_reply_send_readiness'),
        toolEntry('get_myah_inbox_reply_send_status'),
        toolEntry('update_myah_inbox_thread'),
        toolEntry('save_myah_inbox_reply_draft'),
        toolEntry('send_myah_inbox_reply'),
      ]),
    getToolsByName: jest.fn().mockResolvedValue({}),
    getToolInfo: jest.fn().mockImplementation((toolNames: string[]) =>
      Promise.resolve(
        toolNames.map((name) => ({
          name,
          description: name,
          inputSchema: { type: 'object' },
        })),
      ),
    ),
    suggestSimilarToolNames: jest.fn().mockResolvedValue({}),
    resolveAndExecute: jest
      .fn()
      .mockImplementation((name: string) =>
        Promise.resolve({ success: true, result: { name } }),
      ),
  };
  const skillService = {
    findAllFlatSkills: jest
      .fn()
      .mockResolvedValue([{ name: 'myah-inbox', content: 'Inbox procedure' }]),
    findFlatSkillsByNames: jest
      .fn()
      .mockResolvedValue([{ name: 'myah-inbox', content: 'Inbox procedure' }]),
  };
  const service = new ChatExecutionService(
    toolRegistry as never,
    skillService as never,
    {
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
    } as never,
    {
      calculateCost: jest.fn().mockReturnValue(0),
      emitAiTokenUsageEvent: jest.fn().mockResolvedValue(undefined),
      billNativeWebSearchUsage: jest.fn().mockResolvedValue(undefined),
      decrementAndCheckAvailableCredits: jest
        .fn()
        .mockResolvedValue({ hasNoMoreAvailableCredits: false }),
    } as never,
    {
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
    } as never,
    {
      buildWorkspaceURL: jest.fn().mockReturnValue('http://localhost:2021'),
    } as never,
    { isEnabled: jest.fn().mockReturnValue(false) } as never,
    { buildFullPrompt: jest.fn().mockReturnValue('system prompt') } as never,
    { captureExceptions: jest.fn() } as never,
    { bind: jest.fn().mockReturnValue({}) } as never,
    {
      run: jest.fn().mockResolvedValue({
        required: false,
        called: false,
        durationMs: 0,
        cacheHit: false,
        contextPart: null,
      }),
      injectContextIntoLastUserMessage: jest.fn((messages) => messages),
    } as never,
    {
      pruneIfOverContextWindowLimit: jest.fn((messages) => ({
        messages,
        wasPruned: false,
        isStillOverLimit: false,
      })),
    } as never,
    { recordHistogram: jest.fn(), incrementCounterBy: jest.fn() } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      isManagedModel: jest.fn().mockReturnValue(false),
      wrapModel: jest.fn(({ model }) => model),
    } as never,
  );

  return { service, skillService, toolRegistry };
};

const approvalMessages = ({
  genericApproved,
  registeredApproved,
}: {
  genericApproved: boolean;
  registeredApproved: boolean;
}) => [
  ...(registeredApproved
    ? [
        {
          id: 'registered-approval',
          role: 'assistant' as const,
          parts: [
            {
              type: `tool-${REQUEST_APPROVAL_TOOL_NAME}` as `tool-${string}`,
              toolCallId: 'registered-approval-call',
              state: 'output-available' as const,
              input: {},
              output: {
                result: {
                  status: 'resolved',
                  actionApprovalBindingId:
                    'b24f28a7-64bd-4cb8-ac5f-837536ca11db',
                },
              },
            },
          ],
        },
      ]
    : []),
  ...(genericApproved
    ? [
        {
          id: 'generic-approval',
          role: 'assistant' as const,
          parts: [
            {
              type: `tool-${REQUEST_APPROVAL_TOOL_NAME}` as `tool-${string}`,
              toolCallId: 'generic-approval-call',
              state: 'output-available' as const,
              input: { toolName: 'update_myah_inbox_thread' },
              output: { result: { status: 'resolved', decision: 'approved' } },
            },
          ],
        },
      ]
    : [
        {
          id: 'user-message',
          role: 'user' as const,
          parts: [{ type: 'text' as const, text: 'Handle the Inbox thread.' }],
        },
      ]),
];

describe('ChatExecutionService Myah tool availability', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    ['pre-approval', false, false],
    ['generic-approved', true, false],
    ['registered-inbox-approved', false, true],
  ] as const)(
    'keeps the same authority with and without a selected Inbox thread for %s',
    async (_state, genericApproved, registeredApproved) => {
      for (const selectedInboxThread of [false, true]) {
        const { service, skillService, toolRegistry } = buildService();

        await service.streamChat({
          workspace: {
            id: 'workspace-id',
            smartModel: 'test-model',
            aiAdditionalInstructions: null,
          } as never,
          userWorkspaceId: 'user-workspace-id',
          threadId: 'chat-thread-id',
          browsingContext: selectedInboxThread
            ? {
                type: 'myahInboxThreadSelection',
                workspaceId: 'workspace-id',
                threadId: '3ceef358-55fc-4d47-a7a8-2d8ac543641b',
              }
            : null,
          conversationSizeTokens: 10,
          managedProviderRequestIdRoot: 'turn-id',
          messages: approvalMessages({ genericApproved, registeredApproved }),
        });

        const tools = getActiveTools();
        const loadSkill = tools.load_skills.execute({
          skillNames: ['myah-inbox'],
        });
        await jest.runOnlyPendingTimersAsync();
        await expect(loadSkill).resolves.toEqual(
          expect.objectContaining({
            skills: [expect.objectContaining({ name: 'myah-inbox' })],
          }),
        );
        const learnTools = tools.learn_tools.execute({
          toolNames: [
            'get_campaign_audience',
            'get_campaign_outreach_workflow',
            'search_myah_inbox_threads',
            'get_myah_inbox_thread_context',
            'generate_myah_inbox_reply_proposal',
            'get_myah_inbox_reply_send_readiness',
            'get_myah_inbox_reply_send_status',
            'update_myah_inbox_thread',
            'send_myah_inbox_reply',
          ],
        });
        await jest.runOnlyPendingTimersAsync();
        await expect(learnTools).resolves.toEqual(
          expect.objectContaining({
            tools: expect.arrayContaining([
              expect.objectContaining({ name: 'get_campaign_audience' }),
              expect.objectContaining({
                name: 'get_campaign_outreach_workflow',
              }),
              expect.objectContaining({ name: 'search_myah_inbox_threads' }),
              expect.objectContaining({
                name: 'get_myah_inbox_reply_send_status',
              }),
            ]),
          }),
        );
        const execute = (toolName: string) =>
          tools.execute_tool.execute({ toolName, arguments: {} });
        const readExecution = execute('get_campaign_audience');
        await jest.runOnlyPendingTimersAsync();
        await expect(readExecution).resolves.toEqual({
          success: true,
          result: { name: 'get_campaign_audience' },
        });
        const internalWrite = execute('update_myah_inbox_thread');
        await jest.runOnlyPendingTimersAsync();
        await expect(internalWrite).resolves.toEqual(
          genericApproved
            ? { success: true, result: { name: 'update_myah_inbox_thread' } }
            : expect.objectContaining({ success: false }),
        );
        const inboxSend = execute('send_myah_inbox_reply');
        await jest.runOnlyPendingTimersAsync();
        await expect(inboxSend).resolves.toEqual(
          registeredApproved
            ? { success: true, result: { name: 'send_myah_inbox_reply' } }
            : expect.objectContaining({ success: false }),
        );
        expect(skillService.findFlatSkillsByNames).toHaveBeenCalledWith(
          ['myah-inbox'],
          'workspace-id',
        );
        expect(toolRegistry.resolveAndExecute).toHaveBeenCalledWith(
          'get_campaign_audience',
          {},
          expect.objectContaining({
            myahInboxSelection: selectedInboxThread
              ? {
                  workspaceId: 'workspace-id',
                  threadId: '3ceef358-55fc-4d47-a7a8-2d8ac543641b',
                }
              : undefined,
          }),
          expect.any(Object),
        );
      }
    },
  );

  it('does not surface excluded write and sender schemas through learn_tools', async () => {
    const { service, toolRegistry } = buildService();

    await service.streamChat({
      workspace: {
        id: 'workspace-id',
        smartModel: 'test-model',
        aiAdditionalInstructions: null,
      } as never,
      userWorkspaceId: 'user-workspace-id',
      threadId: 'chat-thread-id',
      browsingContext: null,
      conversationSizeTokens: 10,
      managedProviderRequestIdRoot: 'turn-id',
      messages: approvalMessages({
        genericApproved: false,
        registeredApproved: false,
      }),
    });

    const learnTools = getActiveTools().learn_tools.execute({
      toolNames: ['update_myah_inbox_thread', 'send_myah_inbox_reply'],
    });
    await jest.runOnlyPendingTimersAsync();
    await expect(learnTools).resolves.toEqual({
      tools: [],
      notFound: [],
      message: 'No matching tools found.',
    });
    expect(toolRegistry.getToolInfo).toHaveBeenCalledWith(
      [],
      expect.anything(),
      undefined,
    );
    expect(createExecuteToolTool).toHaveBeenCalled();
  });
  it('exposes only one call to the exact generic-approved write', async () => {
    const { service, toolRegistry } = buildService();

    await service.streamChat({
      workspace: {
        id: 'workspace-id',
        smartModel: 'test-model',
        aiAdditionalInstructions: null,
      } as never,
      userWorkspaceId: 'user-workspace-id',
      threadId: 'chat-thread-id',
      browsingContext: null,
      conversationSizeTokens: 10,
      managedProviderRequestIdRoot: 'turn-id',
      messages: approvalMessages({
        genericApproved: true,
        registeredApproved: false,
      }),
    });

    const execute = getActiveTools().execute_tool.execute;

    const approvedWrite = execute({
      toolName: 'update_myah_inbox_thread',
      arguments: { messageThreadId: 'thread-id' },
    });

    await jest.runOnlyPendingTimersAsync();
    await expect(approvedWrite).resolves.toEqual({
      success: true,
      result: { name: 'update_myah_inbox_thread' },
    });

    const differentWrite = execute({
      toolName: 'save_myah_inbox_reply_draft',
      arguments: {},
    });

    await expect(differentWrite).resolves.toEqual(
      expect.objectContaining({ success: false }),
    );

    const repeatedWrite = execute({
      toolName: 'update_myah_inbox_thread',
      arguments: { messageThreadId: 'other-thread-id' },
    });

    await expect(repeatedWrite).resolves.toEqual(
      expect.objectContaining({
        success: false,
        message: 'Tool "update_myah_inbox_thread" approval is already consumed',
      }),
    );
    expect(toolRegistry.resolveAndExecute).toHaveBeenCalledTimes(1);
    expect(createExecuteToolTool).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        singleUseToolName: 'update_myah_inbox_thread',
      }),
    );
  });
});
