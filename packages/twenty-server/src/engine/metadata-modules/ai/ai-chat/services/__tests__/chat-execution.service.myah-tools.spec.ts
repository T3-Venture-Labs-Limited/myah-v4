import { streamText } from 'ai';

import { createExecuteToolTool } from 'src/engine/core-modules/tool-provider/tools/execute-tool.tool';
import { ChatExecutionService } from 'src/engine/metadata-modules/ai/ai-chat/services/chat-execution.service';
import { computeGenericApprovalDigest } from 'src/engine/metadata-modules/ai/ai-chat/utils/generic-approval-digest.util';
import { REQUEST_APPROVAL_TOOL_NAME } from 'twenty-shared/ai';
import { FieldMetadataType, RelationType } from 'twenty-shared/types';

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

// Stands in for the conditional UPDATE: only a resolved approval can move.
const buildApprovalStore = () => {
  const store = {
    status: 'resolved',
    outcome: undefined as string | undefined,
    transitions: [] as string[],
  };
  const manager = {
    query: jest.fn((sql: string, parameters: unknown[]) => {
      const nextStatus = parameters[6] as string;

      if (sql.includes("'{result,executionOutcome}'")) {
        if (store.status !== 'consumed' || store.outcome)
          return Promise.resolve([{ count: 0 }]);
        store.outcome = nextStatus;
        return Promise.resolve([{ count: 1 }]);
      }
      if (store.status !== 'resolved') return Promise.resolve([{ count: 0 }]);
      store.status = nextStatus;
      store.transitions.push(
        nextStatus === 'invalidated'
          ? `invalidated:${parameters[8]}`
          : nextStatus,
      );

      return Promise.resolve([{ count: 1 }]);
    }),
  };

  return {
    store,
    actionApprovalService: {
      executeInTransaction: jest.fn((operation: (m: unknown) => unknown) =>
        operation(manager),
      ),
    },
  };
};

const buildService = (extraCatalog: unknown[] = []) => {
  const approvalStore = buildApprovalStore();
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
        ...extraCatalog,
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
    approvalStore.actionApprovalService as never,
    {
      isManagedModel: jest.fn().mockReturnValue(false),
      wrapModel: jest.fn(({ model }) => model),
    } as never,
  );

  return { service, skillService, toolRegistry, approvalStore };
};

const reviewedActionFor = (
  toolName: string,
  toolArguments: Record<string, unknown>,
  target: Record<string, unknown> = { kind: 'arguments_only' },
) => ({
  version: 1,
  toolName,
  toolLabel: toolName,
  argumentsDigest: computeGenericApprovalDigest(toolArguments),
  arguments: toolArguments,
  target,
});

const approvalMessages = ({
  genericApproved,
  registeredApproved,
  reviewedAction = reviewedActionFor('update_myah_inbox_thread', {}),
}: {
  genericApproved: boolean;
  registeredApproved: boolean;
  reviewedAction?: ReturnType<typeof reviewedActionFor>;
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
              input: { toolName: reviewedAction.toolName },
              output: {
                result: {
                  status: 'resolved',
                  decision: 'approved',
                  decidedAt: new Date().toISOString(),
                  reviewedAction,
                },
              },
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

  const startChat = async (
    service: ChatExecutionService,
    messages: ReturnType<typeof approvalMessages>,
  ) =>
    service.streamChat({
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
      messages,
    });

  const runTool = async (toolName: string, args: Record<string, unknown>) => {
    const execution = getActiveTools().execute_tool.execute({
      toolName,
      arguments: args,
    });

    await jest.runOnlyPendingTimersAsync();

    return execution;
  };

  it('continues after a refused generic proposal but stops for pending and registered approvals', async () => {
    const { service } = buildService();

    await startChat(
      service,
      approvalMessages({ genericApproved: false, registeredApproved: false }),
    );

    const stopWhen = jest.mocked(streamText).mock.lastCall?.[0].stopWhen as (
      step: unknown,
    ) => boolean;
    const approvalStep = (
      input: Record<string, unknown>,
      output?: unknown,
    ) => ({
      steps: [
        {
          toolCalls: [{ toolName: REQUEST_APPROVAL_TOOL_NAME, input }],
          toolResults: output
            ? [{ toolName: REQUEST_APPROVAL_TOOL_NAME, output }]
            : [],
        },
      ],
    });

    expect(
      stopWhen(approvalStep({ toolName: 'update_myah_inbox_thread' })),
    ).toBe(false);
    expect(
      stopWhen(
        approvalStep(
          { toolName: 'update_myah_inbox_thread' },
          { success: true, result: { status: 'pending' } },
        ),
      ),
    ).toBe(true);
    expect(
      stopWhen(
        approvalStep({ toolName: 'send_myah_inbox_reply', actionInput: {} }),
      ),
    ).toBe(true);
    expect(stopWhen(approvalStep({ arguments: { actionInput: {} } }))).toBe(
      true,
    );
  });

  it('reveals only generic write schemas before approval, never the sender', async () => {
    const { service, toolRegistry } = buildService();

    await startChat(
      service,
      approvalMessages({ genericApproved: false, registeredApproved: false }),
    );

    const learnTools = getActiveTools().learn_tools.execute({
      toolNames: ['update_myah_inbox_thread', 'send_myah_inbox_reply'],
    });
    await jest.runOnlyPendingTimersAsync();
    await expect(learnTools).resolves.toEqual(
      expect.objectContaining({
        tools: [
          expect.objectContaining({
            name: 'update_myah_inbox_thread',
            requiresApproval: true,
          }),
        ],
        notFound: [],
      }),
    );
    expect(toolRegistry.getToolInfo).toHaveBeenCalledWith(
      ['update_myah_inbox_thread'],
      expect.anything(),
      undefined,
    );
    // Schema visibility does not make the write executable.
    await expect(runTool('update_myah_inbox_thread', {})).resolves.toEqual(
      expect.objectContaining({ success: false }),
    );
    expect(toolRegistry.resolveAndExecute).not.toHaveBeenCalled();
  });

  it('runs the exact approved write once, then refuses a replay', async () => {
    const approvedArguments = {
      messageThreadId: 'thread-id',
      state: 'CLOSED',
    };
    const { service, toolRegistry, approvalStore } = buildService();

    await startChat(
      service,
      approvalMessages({
        genericApproved: true,
        registeredApproved: false,
        reviewedAction: reviewedActionFor(
          'update_myah_inbox_thread',
          approvedArguments,
        ),
      }),
    );

    // Key order does not matter.
    await expect(
      runTool('update_myah_inbox_thread', {
        state: 'CLOSED',
        messageThreadId: 'thread-id',
      }),
    ).resolves.toEqual({
      success: true,
      result: { name: 'update_myah_inbox_thread' },
    });
    await expect(runTool('save_myah_inbox_reply_draft', {})).resolves.toEqual(
      expect.objectContaining({ success: false }),
    );
    await expect(
      runTool('update_myah_inbox_thread', approvedArguments),
    ).resolves.toEqual(
      expect.objectContaining({
        success: false,
        message: 'Approved action was not executed',
        error: expect.stringContaining('APPROVAL_ALREADY_USED'),
      }),
    );
    expect(toolRegistry.resolveAndExecute).toHaveBeenCalledTimes(1);
    expect(approvalStore.store.transitions).toEqual(['consumed']);
    expect(approvalStore.store.outcome).toBe('succeeded');
    expect(createExecuteToolTool).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        approvedActionGuard: expect.objectContaining({
          toolName: 'update_myah_inbox_thread',
        }),
      }),
    );
  });

  it.each([
    [
      'a different record',
      { messageThreadId: 'other-thread-id', state: 'CLOSED' },
    ],
    ['a different value', { messageThreadId: 'thread-id', state: 'OPEN' }],
    [
      'an added field',
      { messageThreadId: 'thread-id', state: 'CLOSED', ownerId: 'someone' },
    ],
  ])(
    'refuses %s before any write and burns the approval',
    async (_label, changedArguments) => {
      const { service, toolRegistry, approvalStore } = buildService();

      await startChat(
        service,
        approvalMessages({
          genericApproved: true,
          registeredApproved: false,
          reviewedAction: reviewedActionFor('update_myah_inbox_thread', {
            messageThreadId: 'thread-id',
            state: 'CLOSED',
          }),
        }),
      );

      await expect(
        runTool('update_myah_inbox_thread', changedArguments),
      ).resolves.toEqual(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('ACTION_CHANGED'),
        }),
      );
      // The original action cannot be run after a mismatch either.
      await expect(
        runTool('update_myah_inbox_thread', {
          messageThreadId: 'thread-id',
          state: 'CLOSED',
        }),
      ).resolves.toEqual(expect.objectContaining({ success: false }));
      expect(toolRegistry.resolveAndExecute).not.toHaveBeenCalled();
      expect(approvalStore.store.transitions).toEqual([
        'invalidated:ACTION_CHANGED',
      ]);
    },
  );

  it('refuses a stale record target before any write', async () => {
    const aliceId = '7f1c1c1e-0d8a-4b37-9f6a-8e9d2f1b0a11';
    const crud = (name: string, operation: string) => ({
      name,
      label: name,
      description: name,
      category: 'DATABASE_CRUD',
      executionRef: {
        kind: 'database_crud',
        objectNameSingular: 'creator',
        operation,
      },
    });
    const { service, toolRegistry, approvalStore } = buildService([
      crud('update_one_creator', 'update_one'),
      crud('find_one_creator', 'find_one'),
    ]);

    toolRegistry.getToolInfo.mockImplementation((toolNames: string[]) =>
      Promise.resolve(
        toolNames.map((name) => ({
          name,
          inputSchema: {
            type: 'object',
            properties: { id: {}, creatorStatus: {} },
          },
        })),
      ),
    );
    // Alice's status changed after the founder reviewed "NEW -> QUALIFIED".
    toolRegistry.resolveAndExecute.mockImplementation((name: string) =>
      Promise.resolve(
        name === 'find_one_creator'
          ? {
              success: true,
              result: {
                records: [{ id: aliceId, creatorStatus: 'REJECTED' }],
                count: 1,
              },
              recordReferences: [
                {
                  objectNameSingular: 'creator',
                  recordId: aliceId,
                  displayName: 'Alice',
                },
              ],
            }
          : { success: true, result: { name } },
      ),
    );

    await startChat(
      service,
      approvalMessages({
        genericApproved: true,
        registeredApproved: false,
        reviewedAction: reviewedActionFor(
          'update_one_creator',
          { id: aliceId, creatorStatus: 'QUALIFIED' },
          {
            kind: 'record_write',
            operation: 'update',
            objectNameSingular: 'creator',
            records: [],
            totalCount: 1,
            targetFingerprint: computeGenericApprovalDigest({
              [aliceId]: { creatorStatus: 'NEW' },
            }),
          },
        ),
      }),
    );

    await expect(
      runTool('update_one_creator', {
        id: aliceId,
        creatorStatus: 'QUALIFIED',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('TARGET_CHANGED'),
      }),
    );
    expect(toolRegistry.resolveAndExecute).not.toHaveBeenCalledWith(
      'update_one_creator',
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
    expect(approvalStore.store.transitions).toEqual([
      'invalidated:TARGET_CHANGED',
    ]);
  });

  it('labels the join column of a many-to-one morph relation', async () => {
    const { service } = buildService();

    Object.assign(service, {
      workspaceCacheService: {
        getOrRecompute: jest.fn().mockResolvedValue({
          flatObjectMetadataMaps: {
            byUniversalIdentifier: {
              source: {
                id: 'source-id',
                nameSingular: 'taskTarget',
                fieldIds: ['morph-id'],
              },
              creator: { id: 'creator-id', nameSingular: 'creator' },
            },
            universalIdentifierById: { 'creator-id': 'creator' },
          },
          flatFieldMetadataMaps: {
            byUniversalIdentifier: {
              morph: {
                id: 'morph-id',
                name: 'targetCreator',
                type: FieldMetadataType.MORPH_RELATION,
                settings: { relationType: RelationType.MANY_TO_ONE },
                relationTargetObjectMetadataId: 'creator-id',
              },
            },
            universalIdentifierById: { 'morph-id': 'morph' },
          },
        }),
      },
    });

    const resolver = service as unknown as {
      resolveLinkedObjectNames: (
        workspaceId: string,
        objectNameSingular: string,
      ) => Promise<Record<string, string>>;
    };

    await expect(
      resolver.resolveLinkedObjectNames('workspace-id', 'taskTarget'),
    ).resolves.toEqual({ targetCreatorId: 'creator' });
  });
});
