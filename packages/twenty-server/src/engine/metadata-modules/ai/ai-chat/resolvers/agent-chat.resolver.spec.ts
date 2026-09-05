import { AUTO_SELECT_SMART_MODEL_ID } from 'twenty-shared/constants';

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
      getEffectiveModelConfig: jest.fn().mockReturnValue({ modelId }),
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
        getEffectiveModelConfig: aiModelRegistryService.getEffectiveModelConfig,
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

  it('does not resolve an approval when no model can resume it', async () => {
    const { resolver, aiModelRegistryService, agentChatService } =
      buildResolver(true);

    aiModelRegistryService.getAvailableModels.mockReturnValue([]);

    await expect(
      resolver.resolveAgentChatApproval(
        'thread-id',
        'message-id',
        { decision: 'approved' },
        modelId,
        'user-workspace-id',
        workspace,
      ),
    ).rejects.toThrow(
      'No AI models are available. Configure at least one AI provider.',
    );
    expect(agentChatService.resolvePendingApproval).not.toHaveBeenCalled();
    expect(agentChatService.restorePendingApproval).not.toHaveBeenCalled();
  });

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
            ? ['thread-id', null, modelId, 'user-workspace-id', workspace]
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
                  { decision: 'approved' },
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
          ? ['thread-id', null, modelId, 'user-workspace-id', workspace]
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
                { decision: 'approved' },
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
  it('skips local credits when AUTO resolves to an eligible managed model', async () => {
    const { resolver, billingUsageService, aiModelRegistryService } =
      buildResolver(true);
    const autoWorkspace = {
      id: 'workspace-id',
      smartModel: AUTO_SELECT_SMART_MODEL_ID,
    } as never;

    await resolver.retryChatMessage(
      'thread-id',
      null,
      AUTO_SELECT_SMART_MODEL_ID,
      'user-workspace-id',
      autoWorkspace,
    );

    expect(aiModelRegistryService.getEffectiveModelConfig).toHaveBeenCalledWith(
      AUTO_SELECT_SMART_MODEL_ID,
      'workspace-id',
    );
    expect(
      billingUsageService.hasAvailableCreditsOrThrow,
    ).not.toHaveBeenCalled();
  });
  it('forwards the current browsing context when retrying', async () => {
    const { resolver, streaming } = buildResolver(true);
    const browsingContext = {
      type: 'myahInboxThreadSelection',
      workspaceId: 'workspace-id',
      threadId: '3ceef358-55fc-4d47-a7a8-2d8ac543641b',
    } as never;

    await resolver.retryChatMessage(
      'thread-id',
      browsingContext,
      modelId,
      'user-workspace-id',
      workspace,
    );

    expect(streaming.retryLastFailedTurn).toHaveBeenCalledWith({
      threadId: 'thread-id',
      browsingContext,
      modelId,
      userWorkspaceId: 'user-workspace-id',
      workspace,
    });
  });
  it('rejects a selected Inbox message instead of queueing behind an active stream', async () => {
    const { resolver, agentChatService, streaming } = buildResolver(true);

    await expect(
      resolver.sendChatMessage(
        'thread-id',
        'Read this selection',
        'message-id',
        {
          type: 'myahInboxThreadSelection',
          workspaceId: 'workspace-id',
          threadId: '3ceef358-55fc-4d47-a7a8-2d8ac543641b',
        },
        modelId,
        null,
        'user-workspace-id',
        workspace,
      ),
    ).rejects.toThrow('Selected Inbox messages cannot be queued');
    expect(agentChatService.queueMessage).not.toHaveBeenCalled();
    expect(streaming.streamAgentChat).not.toHaveBeenCalled();
  });
});
