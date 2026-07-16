import { ActionExecutionReceiptState } from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';
import {
  sendInstagramReplyInputSchema,
} from 'src/engine/core-modules/tool/tools/instagram-tool/instagram-reply-tool.schema';
import { SendInstagramReplyTool } from 'src/engine/core-modules/tool/tools/instagram-tool/send-instagram-reply-tool';

const workspaceId = '00000000-0000-4000-8000-000000000001';
const approvalBindingId = '00000000-0000-4000-8000-000000000002';
const userWorkspaceId = '00000000-0000-4000-8000-000000000003';
const threadId = '00000000-0000-4000-8000-000000000004';

const expectedActionBinding = {
  workspaceId,
  actionName: 'send_instagram_reply' as const,
  actionVersion: 1 as const,
  draftId: '00000000-0000-4000-8000-000000000005',
  contentDigest: 'a'.repeat(64),
  recipientFingerprint: 'b'.repeat(64),
  sendingAccountFingerprint: 'c'.repeat(64),
  initiatorUserWorkspaceId: userWorkspaceId,
  threadId,
  evidenceLinks: [],
};

const canonicalGraph = {
  conversationId: '00000000-0000-4000-8000-000000000006',
  providerConversationId: 'provider-conversation-id',
  recipientIgsid: 'recipient-igsid',
  draftBody: 'Cafe\r\nThanks!',
  account: {
    id: '00000000-0000-4000-8000-000000000007',
    connectedAccountId: 'connected-account-id',
    composioUserId: `workspace:${workspaceId}:instagram`,
  },
};

const buildTool = ({
  receiptState = ActionExecutionReceiptState.PROCESSING,
  rebuildError,
}: {
  receiptState?: ActionExecutionReceiptState;
  rebuildError?: Error;
} = {}) => {
  const actionApprovalService = {
    getApprovedBinding: jest.fn().mockResolvedValue(expectedActionBinding),
    reserveExecutionForBinding: jest.fn().mockResolvedValue({
      id: 'receipt-id',
      workspaceId,
      state: receiptState,
      providerCode: null,
      outcome: null,
      occurredAt: new Date('2026-07-16T00:00:00.000Z'),
    }),
    recordProviderAccepted: jest.fn().mockResolvedValue(undefined),
    recordProviderTerminalState: jest.fn().mockResolvedValue(undefined),
  };
  const actionDefinition = {
    rebuildExecutionAuthority: rebuildError
      ? jest.fn().mockRejectedValue(rebuildError)
      : jest.fn().mockResolvedValue({
          expectedActionBinding,
          canonicalGraph,
        }),
  };
  const myahComposioService = {
    getActiveInstagramAccount: jest.fn().mockResolvedValue({
      connectedAccountId: canonicalGraph.account.connectedAccountId,
      composioUserId: canonicalGraph.account.composioUserId,
    }),
    executeInstagramTool: jest
      .fn()
      .mockResolvedValueOnce({
        kind: 'success',
        data: {
          data: [
            {
              direction: 'INBOUND',
              from: { id: canonicalGraph.recipientIgsid },
            },
          ],
        },
      })
      .mockResolvedValueOnce({ kind: 'success', data: { id: 'provider-id' } }),
  };
  const projector = {
    projectReceipt: jest.fn().mockResolvedValue({ projected: true }),
  };

  return {
    actionApprovalService,
    actionDefinition,
    myahComposioService,
    projector,
    tool: new SendInstagramReplyTool(
      actionApprovalService as never,
      actionDefinition as never,
      myahComposioService as never,
      projector as never,
    ),
  };
};

const context = { workspaceId, userWorkspaceId, threadId };

describe('sendInstagramReplyInputSchema', () => {
  it('accepts only an approval binding UUID', () => {
    expect(sendInstagramReplyInputSchema.parse({ approvalBindingId })).toEqual({
      approvalBindingId,
    });

    for (const callerControlledField of [
      'body',
      'recipientIgsid',
      'connectedAccountId',
      'conversationId',
      'threadId',
    ]) {
      expect(() =>
        sendInstagramReplyInputSchema.parse({
          approvalBindingId,
          [callerControlledField]: 'attacker-controlled',
        }),
      ).toThrow();
    }
  });
});

describe('SendInstagramReplyTool', () => {
  it('requires a user-bound chat thread before reading a binding or provider state', async () => {
    const { tool, actionApprovalService, myahComposioService } = buildTool();

    await expect(
      tool.execute({ approvalBindingId }, { workspaceId, userWorkspaceId }),
    ).resolves.toMatchObject({ success: false });

    expect(actionApprovalService.getApprovedBinding).not.toHaveBeenCalled();
    expect(myahComposioService.getActiveInstagramAccount).not.toHaveBeenCalled();
    expect(myahComposioService.executeInstagramTool).not.toHaveBeenCalled();
  });

  it.each([
    'zero account',
    'two accounts',
    'account mismatch',
    'stale account',
    'malformed account',
    'body mismatch',
    'recipient mismatch',
    'conversation mismatch',
  ])('does not call the provider when the %s proof cannot be rebuilt', async (reason) => {
    const { tool, myahComposioService } = buildTool({
      rebuildError: new Error(`canonical ${reason} proof failed`),
    });

    await expect(tool.execute({ approvalBindingId }, context)).resolves.toMatchObject({
      success: false,
    });

    expect(myahComposioService.getActiveInstagramAccount).not.toHaveBeenCalled();
    expect(myahComposioService.executeInstagramTool).not.toHaveBeenCalled();
  });

  it('sends once only after a canonical account and inbound message proof', async () => {
    const {
      tool,
      actionApprovalService,
      actionDefinition,
      myahComposioService,
      projector,
    } = buildTool();

    await expect(tool.execute({ approvalBindingId }, context)).resolves.toEqual({
      success: true,
      message: 'Instagram reply accepted.',
    });

    expect(actionApprovalService.getApprovedBinding).toHaveBeenCalledWith({
      workspaceId,
      approvalBindingId,
      initiatorUserWorkspaceId: userWorkspaceId,
      threadId,
    });
    expect(actionDefinition.rebuildExecutionAuthority).toHaveBeenCalledWith({
      workspaceId,
      binding: expectedActionBinding,
    });
    expect(actionApprovalService.reserveExecutionForBinding).toHaveBeenCalledWith({
      approvalBindingId,
      expectedActionBinding,
    });
    expect(myahComposioService.getActiveInstagramAccount).toHaveBeenCalledWith({
      workspaceId,
      connectedAccountId: canonicalGraph.account.connectedAccountId,
    });
    expect(myahComposioService.executeInstagramTool).toHaveBeenNthCalledWith(1, {
      workspaceId,
      connectedAccountId: canonicalGraph.account.connectedAccountId,
      toolSlug: 'INSTAGRAM_LIST_ALL_MESSAGES',
      arguments: {
        conversation_id: canonicalGraph.providerConversationId,
        limit: 25,
      },
    });
    expect(myahComposioService.executeInstagramTool).toHaveBeenNthCalledWith(2, {
      workspaceId,
      connectedAccountId: canonicalGraph.account.connectedAccountId,
      toolSlug: 'INSTAGRAM_SEND_TEXT_MESSAGE',
      arguments: {
        recipient_id: canonicalGraph.recipientIgsid,
        text: 'Cafe\r\nThanks!',
      },
    });
    expect(myahComposioService.executeInstagramTool).toHaveBeenCalledTimes(2);
    expect(actionApprovalService.recordProviderAccepted).toHaveBeenCalledWith(
      'receipt-id',
      expect.objectContaining({ code: 'accepted' }),
    );
    expect(projector.projectReceipt).toHaveBeenCalledWith('receipt-id');
  });

  it('does not send when the bounded provider read lacks an inbound recipient message', async () => {
    const { tool, myahComposioService } = buildTool();
    myahComposioService.executeInstagramTool.mockReset().mockResolvedValueOnce({
      kind: 'success',
      data: { data: [{ direction: 'OUTBOUND', from: { id: 'different-id' } }] },
    });

    await expect(tool.execute({ approvalBindingId }, context)).resolves.toMatchObject({
      success: false,
    });

    expect(myahComposioService.executeInstagramTool).toHaveBeenCalledTimes(1);
  });

  it('maps provider subcode 2534022 to BLOCKED without a send retry', async () => {
    const { tool, actionApprovalService, myahComposioService } = buildTool();
    myahComposioService.executeInstagramTool
      .mockReset()
      .mockResolvedValueOnce({
        kind: 'success',
        data: {
          data: [
            {
              direction: 'INBOUND',
              from: { id: canonicalGraph.recipientIgsid },
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        kind: 'provider_failure',
        providerSubcode: '2534022',
      });

    await expect(tool.execute({ approvalBindingId }, context)).resolves.toMatchObject({
      success: false,
    });

    expect(actionApprovalService.recordProviderTerminalState).toHaveBeenCalledWith({
      receiptId: 'receipt-id',
      state: ActionExecutionReceiptState.BLOCKED,
      code: 'blocked',
    });
    expect(myahComposioService.executeInstagramTool).toHaveBeenCalledTimes(2);
  });

  it.each(['unknown response', 'transport failure'])('records %s as UNKNOWN without retrying', async () => {
    const { tool, actionApprovalService, myahComposioService } = buildTool();
    myahComposioService.executeInstagramTool.mockReset().mockResolvedValueOnce({
      kind: 'unknown',
    });

    await expect(tool.execute({ approvalBindingId }, context)).resolves.toMatchObject({
      success: false,
    });

    expect(actionApprovalService.recordProviderTerminalState).toHaveBeenCalledWith({
      receiptId: 'receipt-id',
      state: ActionExecutionReceiptState.UNKNOWN,
      code: 'unknown',
    });
    expect(myahComposioService.executeInstagramTool).toHaveBeenCalledTimes(1);
  });
});
