import { buildInstagramMessageActionAuthority } from 'src/engine/core-modules/action-approval/definitions/instagram-message-action.definition';
import { InstagramMessageReconciliationService } from 'src/engine/core-modules/instagram-message/services/instagram-message-reconciliation.service';

const workspaceId = '00000000-0000-4000-8000-000000000001';
const receiptId = '00000000-0000-4000-8000-000000000002';
const authority = buildInstagramMessageActionAuthority({
  workspaceId,
  initiatorUserWorkspaceId: '00000000-0000-4000-8000-000000000003',
  threadId: null,
  interactionContextType: 'MYAH_INBOX_INSTAGRAM_DRAFT',
  interactionContextId: '00000000-0000-4000-8000-000000000004',
  draft: {
    id: '00000000-0000-4000-8000-000000000004',
    revision: 2,
    body: 'Exact sent body',
    kind: 'START_CHAT',
    creatorRecordId: '00000000-0000-4000-8000-000000000005',
    recipientUsername: 'creator',
    recipientSourceValues: [{ field: 'instagramUsername', value: 'creator' }],
    conversationRecordId: null,
    providerConversationId: null,
    recipientProviderId: 'creator-provider-id',
  },
  account: {
    bindingId: '00000000-0000-4000-8000-000000000006',
    workspaceInstagramAccountRecordId: '00000000-0000-4000-8000-000000000007',
    unipileAccountId: 'provider-account',
    instagramUserId: 'brand-user',
  },
  evidenceLinks: [],
});

const buildHarness = () => {
  const storedBinding = {
    id: '00000000-0000-4000-8000-000000000008',
    ...authority.expectedActionBinding,
  };
  const receiptRepository = {
    findOne: jest.fn().mockResolvedValue({
      id: receiptId,
      workspaceId,
      state: 'UNKNOWN',
      updatedAt: new Date('2026-09-05T12:00:00.000Z'),
      actionApprovalBinding: storedBinding,
    }),
  };
  const reservationRepository = {
    findOne: jest.fn().mockResolvedValue({
      providerAttemptedAt: new Date('2026-09-03T12:00:00.000Z'),
    }),
  };
  const actionApprovalService = {
    getApprovedBinding: jest
      .fn()
      .mockResolvedValue(authority.expectedActionBinding),
    recordProviderAccepted: jest.fn().mockResolvedValue(undefined),
  };
  const authorityReader = {
    rebuildForReconciliation: jest.fn().mockResolvedValue(authority),
  };
  const message = {
    messageId: 'provider-message',
    accountId: 'provider-account',
    chatId: 'provider-chat',
    senderId: 'brand-user',
    text: 'Exact sent body',
    timestamp: new Date('2026-09-05T12:00:01.000Z'),
    seen: false,
    delivered: true,
    hidden: false,
    deleted: false,
    isEvent: false,
    hasAttachments: false,
    attachmentCount: 0,
  };
  const client = {
    listChats: jest.fn().mockResolvedValue({
      chats: [
        {
          chatId: 'provider-chat',
          attendeeProviderId: 'creator-provider-id',
        },
      ],
      nextCursor: null,
    }),
    listMessages: jest.fn().mockResolvedValue({
      messages: [message],
      nextCursor: null,
    }),
  };
  const projector = {
    projectReceiptWithWriter: jest.fn().mockResolvedValue({ projected: true }),
  };
  const messageProjectionWriter = { project: jest.fn() };
  const budgetService = {
    releaseStartTargetForReceipt: jest.fn().mockResolvedValue(undefined),
  };
  const service = new InstagramMessageReconciliationService(
    receiptRepository as never,
    reservationRepository as never,
    actionApprovalService as never,
    authorityReader as never,
    client as never,
    projector as never,
    messageProjectionWriter as never,
    budgetService as never,
  );

  return {
    actionApprovalService,
    budgetService,
    client,
    message,
    messageProjectionWriter,
    projector,
    service,
  };
};

describe('InstagramMessageReconciliationService', () => {
  it('uses provider reads only and projects exactly one verified match into the same receipt', async () => {
    const harness = buildHarness();

    await expect(
      harness.service.reconcile({ workspaceId, receiptId }),
    ).resolves.toEqual({
      kind: 'MATCH',
      chatId: 'provider-chat',
      messageId: 'provider-message',
    });
    expect(
      harness.actionApprovalService.recordProviderAccepted,
    ).toHaveBeenCalledWith(
      receiptId,
      expect.objectContaining({
        providerExternalMessageId: 'provider-message',
        providerThreadExternalId: 'provider-chat',
      }),
    );
    expect(harness.projector.projectReceiptWithWriter).toHaveBeenCalledWith(
      receiptId,
      harness.messageProjectionWriter,
    );
    expect(
      harness.budgetService.releaseStartTargetForReceipt,
    ).toHaveBeenCalledWith({
      workspaceId,
      actionExecutionReceiptId: receiptId,
      reason: 'PROJECTED',
    });
    expect(Object.keys(harness.client)).toEqual(['listChats', 'listMessages']);
  });

  it('keeps zero or multiple matches Unknown without projection or retry', async () => {
    const noMatch = buildHarness();
    noMatch.client.listMessages.mockResolvedValue({
      messages: [],
      nextCursor: null,
    });
    await expect(
      noMatch.service.reconcile({ workspaceId, receiptId }),
    ).resolves.toEqual({ kind: 'NO_MATCH_COMPLETE' });
    expect(
      noMatch.actionApprovalService.recordProviderAccepted,
    ).not.toHaveBeenCalled();

    const multiple = buildHarness();
    multiple.client.listMessages.mockResolvedValue({
      messages: [
        multiple.message,
        { ...multiple.message, messageId: 'second' },
      ],
      nextCursor: null,
    });
    await expect(
      multiple.service.reconcile({ workspaceId, receiptId }),
    ).resolves.toEqual({ kind: 'INDETERMINATE' });
    expect(
      multiple.actionApprovalService.recordProviderAccepted,
    ).not.toHaveBeenCalled();
  });
});
