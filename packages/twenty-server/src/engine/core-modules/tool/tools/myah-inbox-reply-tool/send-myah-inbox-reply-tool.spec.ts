import { ActionExecutionReceiptState } from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';
import { SendMyahInboxReplyTool } from 'src/engine/core-modules/tool/tools/myah-inbox-reply-tool/send-myah-inbox-reply-tool';
import { SendMyahInboxReplyInputZodSchema } from 'src/engine/core-modules/tool/tools/myah-inbox-reply-tool/myah-inbox-reply-tool.schema';

const workspaceId = '00000000-0000-4000-8000-000000000001';
const userWorkspaceId = '00000000-0000-4000-8000-000000000002';
const threadId = '00000000-0000-4000-8000-000000000003';
const actionApprovalBindingId = '00000000-0000-4000-8000-000000000004';
const receiptId = '00000000-0000-4000-8000-000000000006';

const approvedBinding = {
  workspaceId,
  initiatorUserWorkspaceId: userWorkspaceId,
  actionName: 'send_inbox_reply' as const,
  actionVersion: 1 as const,
  draftId: '00000000-0000-4000-8000-000000000005',
  threadId,
  contentDigest: 'content-digest',
  recipientFingerprint: 'recipient-fingerprint',
  sendingAccountFingerprint: 'sending-account-fingerprint',
  actionContextFingerprint: 'action-context-fingerprint',
  evidenceLinks: [],
};

const buildTool = (receiptState = ActionExecutionReceiptState.SENT) => {
  const actionApprovalService = {
    getApprovedBinding: jest.fn().mockResolvedValue(approvedBinding),
  };
  const approvedExecutionService = {
    execute: jest.fn().mockResolvedValue({
      receipt: { id: receiptId, state: receiptState },
      authority: null,
      draft: null,
    }),
  };

  return {
    actionApprovalService,
    approvedExecutionService,
    tool: new SendMyahInboxReplyTool(
      actionApprovalService as never,
      approvedExecutionService as never,
    ),
  };
};

describe('SendMyahInboxReplyInputZodSchema', () => {
  it('accepts only the opaque approval binding identifier', () => {
    expect(
      SendMyahInboxReplyInputZodSchema.parse({ actionApprovalBindingId }),
    ).toEqual({ actionApprovalBindingId });

    for (const callerControlledField of [
      'body',
      'recipient',
      'sender',
      'subject',
      'messageThreadId',
      'expectedDraftRevision',
    ]) {
      expect(() =>
        SendMyahInboxReplyInputZodSchema.parse({
          actionApprovalBindingId,
          [callerControlledField]: 'attacker-controlled',
        }),
      ).toThrow();
    }
  });
});

describe('SendMyahInboxReplyTool', () => {
  it('forwards the opaque binding ID and real approved binding to the Inbox-owned executor', async () => {
    const { tool, actionApprovalService, approvedExecutionService } =
      buildTool();

    await expect(
      tool.execute(
        { actionApprovalBindingId },
        { workspaceId, userWorkspaceId, threadId },
      ),
    ).resolves.toEqual({
      success: true,
      category: 'SUCCESS',
      message: 'Inbox reply accepted.',
      result: {
        outcome: 'SENT',
        receiptId,
        state: ActionExecutionReceiptState.SENT,
      },
    });

    expect(actionApprovalService.getApprovedBinding).toHaveBeenCalledWith({
      workspaceId,
      approvalBindingId: actionApprovalBindingId,
      initiatorUserWorkspaceId: userWorkspaceId,
      threadId,
    });
    expect(approvedBinding).not.toHaveProperty('id');
    expect(approvedExecutionService.execute).toHaveBeenCalledWith({
      approvalBindingId: actionApprovalBindingId,
      binding: approvedBinding,
      workspaceId,
    });
  });

  it('does not read a binding without an authenticated chat thread', async () => {
    const { tool, actionApprovalService, approvedExecutionService } =
      buildTool();

    await expect(
      tool.execute(
        { actionApprovalBindingId },
        { workspaceId, userWorkspaceId },
      ),
    ).resolves.toMatchObject({
      success: false,
      category: 'CONFLICT',
      result: { outcome: 'STALE', receiptId: null, state: null },
    });

    expect(actionApprovalService.getApprovedBinding).not.toHaveBeenCalled();
    expect(approvedExecutionService.execute).not.toHaveBeenCalled();
  });

  it.each([
    [ActionExecutionReceiptState.FAILED, 'FAILED'],
    [ActionExecutionReceiptState.UNKNOWN, 'UNKNOWN'],
    [ActionExecutionReceiptState.PROCESSING, 'PENDING'],
  ] as const)(
    'does not report a %s receipt as sent',
    async (receiptState, category) => {
      const { tool } = buildTool(receiptState);

      await expect(
        tool.execute(
          { actionApprovalBindingId },
          { workspaceId, userWorkspaceId, threadId },
        ),
      ).resolves.toEqual({
        success: false,
        category,
        message: 'Inbox reply was not sent.',
        result: {
          outcome:
            receiptState === ActionExecutionReceiptState.PROCESSING
              ? 'SENDING'
              : receiptState === ActionExecutionReceiptState.UNKNOWN
                ? 'UNKNOWN'
                : 'FAILED',
          receiptId,
          state: receiptState,
        },
      });
    },
  );

  it('fails closed when binding validation or execution proof fails', async () => {
    const { tool, actionApprovalService } = buildTool();
    actionApprovalService.getApprovedBinding.mockRejectedValueOnce(
      new Error('wrong workspace, user, chat, action, or drifted binding'),
    );

    await expect(
      tool.execute(
        { actionApprovalBindingId },
        { workspaceId, userWorkspaceId, threadId },
      ),
    ).resolves.toEqual({
      success: false,
      category: 'NOT_FOUND',
      message: 'Inbox reply could not be authorized.',
      error: 'NOT_FOUND',
      result: { outcome: 'STALE', receiptId: null, state: null },
    });
  });
});
