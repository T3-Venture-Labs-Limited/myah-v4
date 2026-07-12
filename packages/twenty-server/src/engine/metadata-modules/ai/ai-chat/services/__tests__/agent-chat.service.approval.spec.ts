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
}: {
  messageParts?: Array<Record<string, unknown>>;
  claimAffected?: number;
} = {}) => {
  const threadRepository = {
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

  const service = new AgentChatService(
    threadRepository as never,
    {} as never,
    messageRepository as never,
    messagePartRepository as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  return { service, threadRepository, messagePartRepository };
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

  it('resolves rejected approvals without starting a resume stream', async () => {
    const { service, threadRepository } = buildService();

    const result = await service.resolvePendingApproval({
      threadId: 'thread-id',
      messageId: 'message-id',
      decision: { decision: 'rejected', comment: 'No thanks' },
      streamId: 'stream-id',
      workspaceId: 'workspace-id',
    });

    expect(threadRepository.update).toHaveBeenCalledWith(
      'workspace-id',
      { id: 'thread-id', pendingQuestionMessageId: 'message-id' },
      { pendingQuestionMessageId: null, activeStreamId: null },
    );
    expect(result.shouldResume).toBe(false);
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
      }),
    ).rejects.toMatchObject({
      code: AiExceptionCode.INVALID_APPROVAL_DECISION,
    });
  });
});
