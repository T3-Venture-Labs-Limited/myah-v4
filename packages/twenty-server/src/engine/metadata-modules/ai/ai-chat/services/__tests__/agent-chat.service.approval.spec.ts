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
  threadOwned = true,
}: {
  messageParts?: Array<Record<string, unknown>>;
  claimAffected?: number;
  threadOwned?: boolean;
} = {}) => {
  const threadRepository = {
    findOne: jest.fn().mockResolvedValue(
      threadOwned ? { id: 'thread-id', userWorkspaceId: 'user-workspace-id' } : null,
    ),
    update: jest.fn().mockResolvedValue({ affected: claimAffected }),
  };
  const messageRepository = {
    findOne: jest.fn().mockResolvedValue({
      id: 'message-id',
      threadId: 'thread-id',
      turnId: 'turn-id',
      parts: messageParts,
    }),
  };
  const messagePartRepository = {
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const actionApprovalService = {
    decidePendingBinding: jest.fn().mockResolvedValue(undefined),
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

    expect(threadRepository.update).toHaveBeenCalledWith(
      'workspace-id',
      { id: 'thread-id', pendingQuestionMessageId: 'message-id' },
      { pendingQuestionMessageId: null, activeStreamId: 'stream-id' },
    );
    expect(messagePartRepository.update).toHaveBeenCalledWith(
      'workspace-id',
      { id: 'part-id' },
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

  it('resolves an opaque registered binding and preserves only its UUID in chat state', async () => {
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
              result: {
                status: 'pending',
                actionApprovalBindingId,
              },
            },
          },
        ],
      });

    await service.resolvePendingApproval({
      threadId: 'thread-id',
      messageId: 'message-id',
      decision: { decision: 'approved' },
      streamId: 'stream-id',
      workspaceId: 'workspace-id',
      userWorkspaceId: 'user-workspace-id',
    });

    expect(actionApprovalService.decidePendingBinding).toHaveBeenCalledWith({
      workspaceId: 'workspace-id',
      userWorkspaceId: 'user-workspace-id',
      threadId: 'thread-id',
      approvalBindingId: actionApprovalBindingId,
      decision: 'approved',
    });
    expect(messagePartRepository.update).toHaveBeenCalledWith(
      'workspace-id',
      { id: 'part-id' },
      {
        toolOutput: expect.objectContaining({
          result: {
            status: 'resolved',
            actionApprovalBindingId,
            decision: 'approved',
            comment: undefined,
            decidedAt: expect.any(String),
          },
        }),
      },
    );
  });

  it('restores a registered binding when persisting the chat decision fails', async () => {
    const actionApprovalBindingId =
      'f79694a7-24af-4f37-bfad-4d529e53d1d9';
    const { service, messagePartRepository, actionApprovalService } =
      buildService({
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

    expect(actionApprovalService.restorePendingBinding).toHaveBeenCalledWith({
      approvalBindingId: actionApprovalBindingId,
      threadId: 'thread-id',
      workspaceId: 'workspace-id',
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
