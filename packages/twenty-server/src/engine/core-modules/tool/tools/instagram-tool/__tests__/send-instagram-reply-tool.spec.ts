import { Logger } from '@nestjs/common';

import { InstagramReplyExecutionState } from 'src/engine/core-modules/instagram-reply/entities/instagram-reply-execution-receipt.entity';
import { SendInstagramReplyTool } from 'src/engine/core-modules/tool/tools/instagram-tool/send-instagram-reply-tool';

const approvalId = 'b3ccec70-56c3-4ae6-b1f2-71d93957b5a6';

const buildTool = ({
  receiptState = InstagramReplyExecutionState.PROCESSING,
  created = true,
}: {
  receiptState?: InstagramReplyExecutionState;
  created?: boolean;
} = {}) => {
  const approvalService = {
    reserveExecution: jest.fn().mockResolvedValue({
      created,
      approvalRequest: { id: 'approval-request-id' },
      receipt: { id: 'receipt-id', state: receiptState },
    }),
    finalizeExecution: jest.fn().mockResolvedValue(undefined),
  };
  const executionService = {
    execute: jest
      .fn()
      .mockResolvedValue({ providerMessageId: 'provider-message-id' }),
  };

  return {
    approvalService,
    executionService,
    tool: new SendInstagramReplyTool(
      approvalService as never,
      executionService as never,
    ),
  };
};

describe('SendInstagramReplyTool', () => {
  it('requires a user-bound chat thread before reserving a provider send', async () => {
    const { tool, approvalService } = buildTool();

    await expect(
      tool.execute(
        { approvalId },
        { workspaceId: 'workspace-id', userWorkspaceId: 'member-id' },
      ),
    ).resolves.toMatchObject({ success: false });

    expect(approvalService.reserveExecution).not.toHaveBeenCalled();
  });

  it('reserves and finalizes exactly the approved send', async () => {
    const { tool, approvalService, executionService } = buildTool();

    await expect(
      tool.execute(
        { approvalId },
        {
          workspaceId: 'workspace-id',
          userWorkspaceId: 'member-id',
          threadId: 'thread-id',
        },
      ),
    ).resolves.toEqual({
      success: true,
      message: 'Instagram reply sent.',
      result: { providerMessageId: 'provider-message-id' },
    });

    expect(approvalService.reserveExecution).toHaveBeenCalledWith({
      workspaceId: 'workspace-id',
      userWorkspaceId: 'member-id',
      threadId: 'thread-id',
      approvalId,
    });
    expect(executionService.execute).toHaveBeenCalledWith({
      workspaceId: 'workspace-id',
      approvalRequest: { id: 'approval-request-id' },
    });
    expect(approvalService.finalizeExecution).toHaveBeenCalledWith({
      receipt: {
        id: 'receipt-id',
        state: InstagramReplyExecutionState.PROCESSING,
      },
      state: InstagramReplyExecutionState.SENT,
      providerMessageId: 'provider-message-id',
    });
  });

  it('does not call the provider when a receipt already exists', async () => {
    const { tool, executionService } = buildTool({
      created: false,
      receiptState: InstagramReplyExecutionState.SENT,
    });

    await expect(
      tool.execute(
        { approvalId },
        {
          workspaceId: 'workspace-id',
          userWorkspaceId: 'member-id',
          threadId: 'thread-id',
        },
      ),
    ).resolves.toMatchObject({
      success: true,
      message: 'Instagram reply was already sent.',
    });

    expect(executionService.execute).not.toHaveBeenCalled();
  });

  it('stores a terminal provider failure and does not throw provider details', async () => {
    const { tool, approvalService, executionService } = buildTool();
    executionService.execute.mockRejectedValue(
      new Error(
        'untrusted provider response https://secret.example/?access_token=abc',
      ),
    );
    const loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    await expect(
      tool.execute(
        { approvalId },
        {
          workspaceId: 'workspace-id',
          userWorkspaceId: 'member-id',
          threadId: 'thread-id',
        },
      ),
    ).resolves.toEqual({
      success: false,
      message: 'Instagram reply was not sent.',
      error: 'Instagram reply status is unknown; it was not retried.',
    });

    expect(approvalService.finalizeExecution).toHaveBeenCalledWith({
      receipt: {
        id: 'receipt-id',
        state: InstagramReplyExecutionState.PROCESSING,
      },
      state: InstagramReplyExecutionState.UNKNOWN,
      failureCode: 'UNEXPECTED_EXECUTION_ERROR',
      failureReason: 'Instagram reply status is unknown; it was not retried.',
    });
    expect(loggerError).toHaveBeenCalledWith(
      'Unexpected Instagram reply execution error',
    );
    loggerError.mockRestore();
  });
});
