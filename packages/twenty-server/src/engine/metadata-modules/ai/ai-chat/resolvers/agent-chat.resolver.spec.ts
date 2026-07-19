import { AgentChatResolver } from 'src/engine/metadata-modules/ai/ai-chat/resolvers/agent-chat.resolver';

describe('AgentChatResolver managed provider credit preflight', () => {
  const workspace = { id: 'workspace-id', smartModel: 'local/model' } as never;
  const thread = {
    id: 'thread-id',
    activeStreamId: 'stream-id',
    deletedAt: null,
  } as never;
  const modelId = 'openrouter/deepseek/deepseek-v4-flash';

  const buildResolver = (managed: boolean) => {
    const billingUsageService = {
      hasAvailableCreditsOrThrow: jest.fn(),
    };
    const aiModelRegistryService = {
      getAvailableModels: jest.fn().mockReturnValue([{}]),
      getModel: jest.fn().mockReturnValue({
        modelId,
        providerName: 'openrouter',
      }),
      validateModelAvailability: jest.fn(),
    };
    const agentChatService = {
      queueMessage: jest.fn().mockResolvedValue({ id: 'queued-message-id' }),
      resolvePendingQuestion: jest
        .fn()
        .mockResolvedValue({ turnId: 'turn-id', rollback: {} }),
      resolvePendingApproval: jest.fn().mockResolvedValue({
        turnId: 'turn-id',
        rollback: {},
        shouldResume: true,
      }),
      restorePendingQuestion: jest.fn(),
      restorePendingApproval: jest.fn(),
      unarchiveThread: jest.fn(),
    };
    const streaming = {
      retryLastFailedTurn: jest
        .fn()
        .mockResolvedValue({ messageId: 'message-id', streamId: 'stream-id' }),
      enqueueResumeStream: jest.fn().mockResolvedValue(undefined),
      reapDeadStream: jest.fn().mockResolvedValue(null),
      streamAgentChat: jest.fn(),
    };
    const resolver = new AgentChatResolver(
      agentChatService as never,
      streaming as never,
      { publish: jest.fn().mockResolvedValue(undefined) } as never,
      {} as never,
      billingUsageService as never,
      {
        getModel: aiModelRegistryService.getModel,
        getAvailableModels: aiModelRegistryService.getAvailableModels,
        validateModelAvailability:
          aiModelRegistryService.validateModelAvailability,
      } as never,
      { isManagedModel: jest.fn().mockReturnValue(managed) } as never,
      {} as never,
      { findOne: jest.fn().mockResolvedValue(thread) } as never,
    );

    if (!managed) {
      billingUsageService.hasAvailableCreditsOrThrow.mockRejectedValue(
        new Error('no local credits'),
      );
    }

    return {
      resolver,
      billingUsageService,
      aiModelRegistryService,
      agentChatService,
      streaming,
    };
  };

  it.each([
    'sendChatMessage',
    'retryChatMessage',
    'answerAgentChatQuestion',
    'resolveAgentChatApproval',
  ])(
    'does not apply local credit preflight for managed %s',
    async (mutation) => {
      const { resolver, billingUsageService } = buildResolver(true);

      const args =
        mutation === 'sendChatMessage'
          ? [
              'thread-id',
              'hello',
              'message-id',
              null,
              modelId,
              null,
              'user-workspace-id',
              workspace,
            ]
          : mutation === 'retryChatMessage'
            ? ['thread-id', modelId, 'user-workspace-id', workspace]
            : mutation === 'answerAgentChatQuestion'
              ? [
                  'thread-id',
                  'message-id',
                  [],
                  modelId,
                  'user-workspace-id',
                  workspace,
                ]
              : [
                  'thread-id',
                  'message-id',
                  { approved: true },
                  modelId,
                  'user-workspace-id',
                  workspace,
                ];

      await (
        resolver[mutation as keyof AgentChatResolver] as (
          ...values: never[]
        ) => Promise<unknown>
      )(...(args as never[]));

      expect(
        billingUsageService.hasAvailableCreditsOrThrow,
      ).not.toHaveBeenCalled();
    },
  );

  it.each([
    'sendChatMessage',
    'retryChatMessage',
    'answerAgentChatQuestion',
    'resolveAgentChatApproval',
  ])('retains local credit preflight for unmanaged %s', async (mutation) => {
    const { resolver, billingUsageService } = buildResolver(false);
    const args =
      mutation === 'sendChatMessage'
        ? [
            'thread-id',
            'hello',
            'message-id',
            null,
            modelId,
            null,
            'user-workspace-id',
            workspace,
          ]
        : mutation === 'retryChatMessage'
          ? ['thread-id', modelId, 'user-workspace-id', workspace]
          : mutation === 'answerAgentChatQuestion'
            ? [
                'thread-id',
                'message-id',
                [],
                modelId,
                'user-workspace-id',
                workspace,
              ]
            : [
                'thread-id',
                'message-id',
                { approved: true },
                modelId,
                'user-workspace-id',
                workspace,
              ];

    await expect(
      (
        resolver[mutation as keyof AgentChatResolver] as (
          ...values: never[]
        ) => Promise<unknown>
      )(...(args as never[])),
    ).rejects.toThrow('no local credits');
    expect(billingUsageService.hasAvailableCreditsOrThrow).toHaveBeenCalledWith(
      'workspace-id',
    );
  });
});
