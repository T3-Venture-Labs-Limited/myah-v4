import { REQUEST_APPROVAL_TOOL_NAME } from 'twenty-shared/ai';

import { AgentChatService } from 'src/engine/metadata-modules/ai/ai-chat/services/agent-chat.service';
import { AiExceptionCode } from 'src/engine/metadata-modules/ai/ai.exception';

const pendingApprovalOutput = {
  success: true,
  message: 'Approval request presented to the user; awaiting their decision.',
  result: {
    request: {
      title: 'Send email',
      summary: 'Send one email.',
      actionKind: 'email_send',
      riskLevel: 'medium',
      consequences: ['Email will be sent.'],
    },
    status: 'pending',
  },
};

const buildService = ({
  messageParts = [
    {
      id: 'part-id',
      toolName: REQUEST_APPROVAL_TOOL_NAME,
      toolOutput: pendingApprovalOutput,
    },
  ],
  claimAffected = 1,
  partAffected = 1,
  threadOwned = true,
}: {
  messageParts?: Array<Record<string, unknown>>;
  claimAffected?: number;
  partAffected?: number;
  threadOwned?: boolean;
} = {}) => {
  const persistedState = {
    threadClaimed: false,
    bindingDecided: false,
    partResolved: false,
  };
  let transactionState: typeof persistedState | null = null;

  const threadRepository = {
    findOne: jest.fn().mockResolvedValue(
      threadOwned ? { id: 'thread-id', userWorkspaceId: 'user-workspace-id' } : null,
    ),
    update: jest.fn().mockImplementation(() => {
      if (claimAffected > 0) {
        (transactionState ?? persistedState).threadClaimed = true;
      }

      return Promise.resolve({ affected: claimAffected });
    }),
    withManager: jest.fn(),
  };
  threadRepository.withManager.mockReturnValue(threadRepository);

  const messageRepository = {
    findOne: jest.fn().mockResolvedValue({
      id: 'message-id',
      threadId: 'thread-id',
      turnId: 'turn-id',
      parts: messageParts,
    }),
    withManager: jest.fn(),
  };
  messageRepository.withManager.mockReturnValue(messageRepository);

  const messagePartRepository = {
    update: jest.fn().mockImplementation(() => {
      if (partAffected > 0) {
        (transactionState ?? persistedState).partResolved = true;
      }

      return Promise.resolve({ affected: partAffected });
    }),
    withManager: jest.fn(),
  };
  messagePartRepository.withManager.mockReturnValue(messagePartRepository);

  const actionApprovalService = {
    executeInTransaction: jest.fn(
      async (callback: (manager: object) => Promise<unknown>) => {
        const stateBeforeTransaction = { ...persistedState };

        transactionState = persistedState;
        try {
          return await callback({});
        } catch (error) {
          Object.assign(persistedState, stateBeforeTransaction);
          throw error;
        } finally {
          transactionState = null;
        }
      },
    ),
    decidePendingBinding: jest.fn().mockResolvedValue(undefined),
    decidePendingBindingInTransaction: jest.fn().mockImplementation(() => {
      (transactionState ?? persistedState).bindingDecided = true;

      return Promise.resolve({ accepted: true });
    }),
    restorePendingBinding: jest.fn().mockResolvedValue(undefined),
  };

  const service = new AgentChatService(
    threadRepository as never,
    {} as never,
    messageRepository as never,
    messagePartRepository as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    actionApprovalService as never,
  );

  return {
    service,
    persistedState,
    threadRepository,
    messagePartRepository,
    actionApprovalService,
  };
};

describe('AgentChatService.resolvePendingApproval', () => {
  it('marks the approval as resolved and claims the pending thread', async () => {
    const { service, threadRepository, messagePartRepository } = buildService();

    const result = await service.resolvePendingApproval({
      threadId: 'thread-id',
      messageId: 'message-id',
      decision: { decision: 'approved', comment: 'Looks good' },
      streamId: 'stream-id',
      workspaceId: 'workspace-id',
      userWorkspaceId: 'user-workspace-id',
    });

    expect(threadRepository.update).toHaveBeenNthCalledWith(
      1,
      'workspace-id',
      { id: 'thread-id', pendingQuestionMessageId: 'message-id' },
      { pendingQuestionMessageId: null, activeStreamId: null },
    );
    expect(threadRepository.update).toHaveBeenNthCalledWith(
      2,
      'workspace-id',
      {
        id: 'thread-id',
        pendingQuestionMessageId: null,
        activeStreamId: null,
      },
      { activeStreamId: 'stream-id' },
    );
    expect(messagePartRepository.update).toHaveBeenCalledWith(
      'workspace-id',
      { id: 'part-id', toolName: REQUEST_APPROVAL_TOOL_NAME },
      {
        toolOutput: expect.objectContaining({
          success: true,
          message: 'User resolved the approval request.',
          result: expect.objectContaining({
            request: pendingApprovalOutput.result.request,
            status: 'resolved',
            decision: 'approved',
            comment: 'Looks good',
            decidedAt: expect.any(String),
          }),
        }),
      },
    );
    expect(result).toEqual({
      turnId: 'turn-id',
      rollback: { partId: 'part-id', previousOutput: pendingApprovalOutput },
      shouldResume: true,
    });
  });

  it('strips comment, timestamps, and unsafe fields from registered chat output', async () => {
    const actionApprovalBindingId =
      'f79694a7-24af-4f37-bfad-4d529e53d1d9';
    const { service, actionApprovalService, messagePartRepository } =
      buildService({
        messageParts: [
          {
            id: 'part-id',
            toolName: REQUEST_APPROVAL_TOOL_NAME,
            toolOutput: {
              success: true,
              message: 'unsafe persisted text',
              unsafeTopLevelField: 'do not retain',
              result: {
                status: 'pending',
                actionApprovalBindingId,
                comment: 'unsafe persisted comment',
                decidedAt: '2026-07-17T00:00:00.000Z',
                unsafeResultField: 'do not retain',
              },
            },
          },
        ],
      });

    await service.resolvePendingApproval({
      threadId: 'thread-id',
      messageId: 'message-id',
      decision: { decision: 'approved', comment: 'do not retain this either' },
      streamId: 'stream-id',
      workspaceId: 'workspace-id',
      userWorkspaceId: 'user-workspace-id',
    });

    expect(
      actionApprovalService.decidePendingBindingInTransaction,
    ).toHaveBeenCalledWith(
      expect.anything(),
      {
        workspaceId: 'workspace-id',
        userWorkspaceId: 'user-workspace-id',
        threadId: 'thread-id',
        approvalBindingId: actionApprovalBindingId,
        decision: 'approved',
      },
    );
    expect(messagePartRepository.update).toHaveBeenCalledWith(
      'workspace-id',
      { id: 'part-id', toolName: REQUEST_APPROVAL_TOOL_NAME },
      {
        toolOutput: {
          result: {
            status: 'resolved',
            actionApprovalBindingId,
          },
        },
      },
    );
  });

  it('rolls back the registered decision when persisting its chat state fails', async () => {
    const actionApprovalBindingId =
      'f79694a7-24af-4f37-bfad-4d529e53d1d9';
    const {
      service,
      persistedState,
      messagePartRepository,
      actionApprovalService,
    } = buildService({
      messageParts: [
        {
          id: 'part-id',
          toolName: REQUEST_APPROVAL_TOOL_NAME,
          toolOutput: {
            success: true,
            result: { status: 'pending', actionApprovalBindingId },
          },
        },
      ],
    });
    messagePartRepository.update.mockRejectedValue(
      new Error('message-part persistence failed'),
    );

    await expect(
      service.resolvePendingApproval({
        threadId: 'thread-id',
        messageId: 'message-id',
        decision: { decision: 'rejected' },
        streamId: 'stream-id',
        workspaceId: 'workspace-id',
        userWorkspaceId: 'user-workspace-id',
      }),
    ).rejects.toThrow('message-part persistence failed');

    expect(actionApprovalService.executeInTransaction).toHaveBeenCalledTimes(1);
    expect(
      actionApprovalService.decidePendingBindingInTransaction,
    ).toHaveBeenCalledTimes(1);
    expect(actionApprovalService.restorePendingBinding).not.toHaveBeenCalled();
    expect(persistedState).toEqual({
      threadClaimed: false,
      bindingDecided: false,
      partResolved: false,
    });
  });

  it('does not decide or resolve when the pending thread claim affects no rows', async () => {
    const actionApprovalBindingId =
      'f79694a7-24af-4f37-bfad-4d529e53d1d9';
    const {
      service,
      persistedState,
      messagePartRepository,
      actionApprovalService,
    } = buildService({
      claimAffected: 0,
      messageParts: [
        {
          id: 'part-id',
          toolName: REQUEST_APPROVAL_TOOL_NAME,
          toolOutput: {
            result: { status: 'pending', actionApprovalBindingId },
          },
        },
      ],
    });

    await expect(
      service.resolvePendingApproval({
        threadId: 'thread-id',
        messageId: 'message-id',
        decision: { decision: 'approved' },
        streamId: 'stream-id',
        workspaceId: 'workspace-id',
        userWorkspaceId: 'user-workspace-id',
      }),
    ).rejects.toMatchObject({ code: AiExceptionCode.APPROVAL_NOT_PENDING });

    expect(actionApprovalService.executeInTransaction).toHaveBeenCalledTimes(1);
    expect(
      actionApprovalService.decidePendingBindingInTransaction,
    ).not.toHaveBeenCalled();
    expect(messagePartRepository.update).not.toHaveBeenCalled();
    expect(persistedState).toEqual({
      threadClaimed: false,
      bindingDecided: false,
      partResolved: false,
    });
  });

  it('does not resolve chat state when the registered decision fails', async () => {
    const actionApprovalBindingId =
      'f79694a7-24af-4f37-bfad-4d529e53d1d9';
    const {
      service,
      persistedState,
      messagePartRepository,
      actionApprovalService,
    } = buildService({
      messageParts: [
        {
          id: 'part-id',
          toolName: REQUEST_APPROVAL_TOOL_NAME,
          toolOutput: {
            result: { status: 'pending', actionApprovalBindingId },
          },
        },
      ],
    });
    actionApprovalService.decidePendingBindingInTransaction.mockRejectedValue(
      new Error('binding decision failed'),
    );

    await expect(
      service.resolvePendingApproval({
        threadId: 'thread-id',
        messageId: 'message-id',
        decision: { decision: 'approved' },
        streamId: 'stream-id',
        workspaceId: 'workspace-id',
        userWorkspaceId: 'user-workspace-id',
      }),
    ).rejects.toThrow('binding decision failed');

    expect(actionApprovalService.executeInTransaction).toHaveBeenCalledTimes(1);
    expect(messagePartRepository.update).not.toHaveBeenCalled();
    expect(persistedState).toEqual({
      threadClaimed: false,
      bindingDecided: false,
      partResolved: false,
    });
  });

  it('commits an expired binding outcome without resuming the action', async () => {
    const actionApprovalBindingId =
      'f79694a7-24af-4f37-bfad-4d529e53d1d9';
    const {
      service,
      threadRepository,
      messagePartRepository,
      actionApprovalService,
    } = buildService({
      messageParts: [
        {
          id: 'part-id',
          toolName: REQUEST_APPROVAL_TOOL_NAME,
          toolOutput: {
            result: { status: 'pending', actionApprovalBindingId },
          },
        },
      ],
    });
    actionApprovalService.decidePendingBindingInTransaction.mockResolvedValue({
      accepted: false,
      state: 'EXPIRED',
    });

    const result = await service.resolvePendingApproval({
      threadId: 'thread-id',
      messageId: 'message-id',
      decision: { decision: 'approved' },
      streamId: 'stream-id',
      workspaceId: 'workspace-id',
      userWorkspaceId: 'user-workspace-id',
    });

    expect(result.shouldResume).toBe(false);
    expect(messagePartRepository.update).not.toHaveBeenCalled();
    expect(threadRepository.update).toHaveBeenNthCalledWith(
      1,
      'workspace-id',
      { id: 'thread-id', pendingQuestionMessageId: 'message-id' },
      { pendingQuestionMessageId: null, activeStreamId: null },
    );
    expect(threadRepository.update).toHaveBeenNthCalledWith(
      2,
      'workspace-id',
      {
        id: 'thread-id',
        pendingQuestionMessageId: null,
        activeStreamId: null,
      },
      { pendingQuestionMessageId: 'message-id' },
    );
  });

  it('does not resume when the pending message part update affects no rows', async () => {
    const actionApprovalBindingId =
      'f79694a7-24af-4f37-bfad-4d529e53d1d9';
    const { service, persistedState, actionApprovalService } = buildService({
      partAffected: 0,
      messageParts: [
        {
          id: 'part-id',
          toolName: REQUEST_APPROVAL_TOOL_NAME,
          toolOutput: {
            result: { status: 'pending', actionApprovalBindingId },
          },
        },
      ],
    });

    await expect(
      service.resolvePendingApproval({
        threadId: 'thread-id',
        messageId: 'message-id',
        decision: { decision: 'approved' },
        streamId: 'stream-id',
        workspaceId: 'workspace-id',
        userWorkspaceId: 'user-workspace-id',
      }),
    ).rejects.toMatchObject({ code: AiExceptionCode.APPROVAL_NOT_PENDING });

    expect(actionApprovalService.executeInTransaction).toHaveBeenCalledTimes(1);
    expect(
      actionApprovalService.decidePendingBindingInTransaction,
    ).toHaveBeenCalledTimes(1);
    expect(persistedState).toEqual({
      threadClaimed: false,
      bindingDecided: false,
      partResolved: false,
    });
  });

  it('restores a registered binding when resume setup fails', async () => {
    const actionApprovalBindingId =
      'f79694a7-24af-4f37-bfad-4d529e53d1d9';
    const { service, actionApprovalService } = buildService({
      messageParts: [
        {
          id: 'part-id',
          toolName: REQUEST_APPROVAL_TOOL_NAME,
          toolOutput: {
            success: true,
            result: { status: 'pending', actionApprovalBindingId },
          },
        },
      ],
    });

    const resolution = await service.resolvePendingApproval({
      threadId: 'thread-id',
      messageId: 'message-id',
      decision: { decision: 'approved' },
      streamId: 'stream-id',
      workspaceId: 'workspace-id',
      userWorkspaceId: 'user-workspace-id',
    });

    await service.restorePendingApproval({
      threadId: 'thread-id',
      messageId: 'message-id',
      streamId: 'stream-id',
      workspaceId: 'workspace-id',
      rollback: resolution.rollback,
    });

    expect(actionApprovalService.restorePendingBinding).toHaveBeenCalledWith({
      approvalBindingId: actionApprovalBindingId,
      threadId: 'thread-id',
      workspaceId: 'workspace-id',
    });
  });

  it('resolves rejected approvals without starting a resume stream', async () => {
    const { service, threadRepository } = buildService();

    const result = await service.resolvePendingApproval({
      threadId: 'thread-id',
      messageId: 'message-id',
      decision: { decision: 'rejected', comment: 'No thanks' },
      streamId: 'stream-id',
      workspaceId: 'workspace-id',
      userWorkspaceId: 'user-workspace-id',
    });

    expect(threadRepository.update).toHaveBeenCalledWith(
      'workspace-id',
      { id: 'thread-id', pendingQuestionMessageId: 'message-id' },
      { pendingQuestionMessageId: null, activeStreamId: null },
    );
    expect(result.shouldResume).toBe(false);
  });

  it('rejects a decision from a workspace member who does not own the thread', async () => {
    const { service, messagePartRepository, actionApprovalService } =
      buildService({ threadOwned: false });

    await expect(
      service.resolvePendingApproval({
        threadId: 'thread-id',
        messageId: 'message-id',
        decision: { decision: 'approved' },
        streamId: 'stream-id',
        workspaceId: 'workspace-id',
        userWorkspaceId: 'user-workspace-id',
      }),
    ).rejects.toMatchObject({ code: AiExceptionCode.APPROVAL_NOT_PENDING });

    expect(messagePartRepository.update).not.toHaveBeenCalled();
    expect(actionApprovalService.decidePendingBinding).not.toHaveBeenCalled();
  });

  it('rejects a malformed registered binding ID before claiming or deciding it', async () => {
    const { service, threadRepository, actionApprovalService } = buildService({
      messageParts: [
        {
          id: 'part-id',
          toolName: REQUEST_APPROVAL_TOOL_NAME,
          toolOutput: {
            success: true,
            result: {
              status: 'pending',
              actionApprovalBindingId: 'attacker-controlled',
            },
          },
        },
      ],
    });

    await expect(
      service.resolvePendingApproval({
        threadId: 'thread-id',
        messageId: 'message-id',
        decision: { decision: 'approved' },
        streamId: 'stream-id',
        workspaceId: 'workspace-id',
        userWorkspaceId: 'user-workspace-id',
      }),
    ).rejects.toMatchObject({ code: AiExceptionCode.APPROVAL_NOT_PENDING });

    expect(threadRepository.update).not.toHaveBeenCalled();
    expect(actionApprovalService.decidePendingBinding).not.toHaveBeenCalled();
  });

  it('rejects when multiple human-input parts are pending on the message', async () => {
    const { service } = buildService({
      messageParts: [
        {
          id: 'part-id',
          toolName: REQUEST_APPROVAL_TOOL_NAME,
          toolOutput: pendingApprovalOutput,
        },
        {
          id: 'other-part-id',
          toolName: REQUEST_APPROVAL_TOOL_NAME,
          toolOutput: pendingApprovalOutput,
        },
      ],
    });

    await expect(
      service.resolvePendingApproval({
        threadId: 'thread-id',
        messageId: 'message-id',
        decision: { decision: 'approved' },
        streamId: 'stream-id',
        workspaceId: 'workspace-id',
        userWorkspaceId: 'user-workspace-id',
      }),
    ).rejects.toMatchObject({ code: AiExceptionCode.APPROVAL_NOT_PENDING });
  });

  it('rejects invalid approval decisions', async () => {
    const { service } = buildService();

    await expect(
      service.resolvePendingApproval({
        threadId: 'thread-id',
        messageId: 'message-id',
        decision: { decision: 'maybe' },
        streamId: 'stream-id',
        workspaceId: 'workspace-id',
        userWorkspaceId: 'user-workspace-id',
      }),
    ).rejects.toMatchObject({
      code: AiExceptionCode.INVALID_APPROVAL_DECISION,
    });
  });
});
