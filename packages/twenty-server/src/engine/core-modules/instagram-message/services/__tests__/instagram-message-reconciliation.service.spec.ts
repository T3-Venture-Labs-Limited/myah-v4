import { ActionReceiptProjectorService } from 'src/engine/core-modules/action-approval/services/action-receipt-projector.service';
import { InstagramMessageReceiptProjectionService } from 'src/engine/core-modules/instagram-message/services/instagram-message-receipt-projection.service';
import { buildInstagramMessageActionAuthority } from 'src/engine/core-modules/action-approval/definitions/instagram-message-action.definition';
import { InstagramMessageReconciliationService } from 'src/engine/core-modules/instagram-message/services/instagram-message-reconciliation.service';
import { type UnipileInstagramMessage } from 'src/modules/myah-unipile/types/unipile-v1.type';

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
    kind: 'REPLY',
    creatorRecordId: '00000000-0000-4000-8000-000000000005',
    recipientUsername: 'creator',
    recipientSourceValues: [{ field: 'instagramUsername', value: 'creator' }],
    conversationRecordId: '00000000-0000-4000-8000-000000000009',
    providerConversationId: 'provider-chat',
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

const buildHarness = (
  providerAttemptedAt = new Date('2026-09-03T12:00:00.000Z'),
  messageAuthority = authority,
) => {
  const storedBinding = {
    id: '00000000-0000-4000-8000-000000000008',
    ...messageAuthority.expectedActionBinding,
  };
  const receipt = {
    id: receiptId,
    workspaceId,
    state: 'UNKNOWN',
    updatedAt: new Date('2026-09-05T12:00:00.000Z'),
    actionApprovalBinding: storedBinding,
  };
  const receiptRepository = {
    findOne: jest.fn().mockResolvedValue(receipt),
  };
  const reservation = { providerAttemptedAt };
  const reservationRepository = {
    findOne: jest.fn().mockResolvedValue(reservation),
  };
  const actionApprovalService = {
    getApprovedBinding: jest
      .fn()
      .mockResolvedValue(messageAuthority.expectedActionBinding),
    recordProviderAccepted: jest.fn().mockResolvedValue(undefined),
  };
  const authorityReader = {
    rebuildForReconciliation: jest.fn().mockResolvedValue(messageAuthority),
  };
  const message: UnipileInstagramMessage = {
    messageId: 'provider-message',
    accountId: 'provider-account',
    chatId: 'provider-chat',
    senderId: 'brand-user',
    text: 'Exact sent body',
    timestamp: '2026-09-03T12:00:01.000Z',
    seen: false,
    delivered: true,
    hidden: false,
    deleted: false,
    isEvent: false,
    hasAttachments: false,
    attachmentCount: 0,
  };
  const client = {
    listChats: jest.fn(),
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
    authorityReader,
    budgetService,
    client,
    message,
    messageProjectionWriter,
    projector,
    receipt,
    receiptRepository,
    reservation,
    reservationRepository,
    service,
    storedBinding,
  };
};

describe('InstagramMessageReconciliationService', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-09-04T13:00:00.000Z') });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe.each([
    { name: 'complete empty chat page', identity: 'creator', attendee: null },
    {
      name: 'complete mismatched attendee page',
      identity: 'creator',
      attendee: 'different-provider-namespace',
    },
    {
      name: 'apparently matching fabricated historical identity',
      identity: 'creator-provider-id',
      attendee: 'creator-provider-id',
    },
    {
      name: 'numeric-looking username and provider identity',
      identity: '17841400000000000',
      attendee: '17841400000000000',
    },
  ])('legacy START_CHAT: $name', ({ identity, attendee }) => {
    it.each([1, 25])(
      'stays indeterminate at age %s hours before any reservation, authority or provider access',
      async (ageHours) => {
        const legacyAuthority = buildInstagramMessageActionAuthority({
          ...authority.expectedActionBinding,
          ...authority.canonicalGraph,
          evidenceLinks: [...authority.expectedActionBinding.evidenceLinks],
          draft: {
            ...authority.canonicalGraph.draft,
            kind: 'START_CHAT',
            conversationRecordId: null,
            providerConversationId: null,
            recipientUsername: identity,
            recipientProviderId: identity,
            recipientSourceValues: [
              { field: 'instagramUsername', value: identity },
            ],
          },
        });
        const harness = buildHarness(
          new Date(Date.now() - ageHours * 60 * 60 * 1000),
          legacyAuthority,
        );
        // These pages reproduce the old false absence/match; the guard must
        // deliberately leave both provider mocks unread, not trust their IDs.
        harness.client.listChats.mockResolvedValue({
          chats: attendee
            ? [{ chatId: 'provider-chat', attendeeProviderId: attendee }]
            : [],
          nextCursor: null,
        });
        harness.client.listMessages.mockResolvedValue({
          messages: [
            { ...harness.message, timestamp: new Date().toISOString() },
          ],
          nextCursor: null,
        });
        const before = structuredClone({
          receipt: harness.receipt,
          reservation: harness.reservation,
        });

        await expect(
          harness.service.inspectUnknown({ workspaceId, receiptId }),
        ).resolves.toEqual({ kind: 'INDETERMINATE' });
        await expect(
          harness.service.reconcile({ workspaceId, receiptId }),
        ).resolves.toEqual({ kind: 'INDETERMINATE' });
        expect(harness.receiptRepository.findOne).toHaveBeenCalledTimes(2);
        expect(harness.receiptRepository.findOne).toHaveBeenCalledWith(
          workspaceId,
          {
            where: { id: receiptId, workspaceId, state: 'UNKNOWN' },
            relations: { actionApprovalBinding: { evidenceLinks: true } },
          },
        );
        expect(harness.reservationRepository.findOne).not.toHaveBeenCalled();
        expect(
          harness.actionApprovalService.getApprovedBinding,
        ).not.toHaveBeenCalled();
        expect(
          harness.authorityReader.rebuildForReconciliation,
        ).not.toHaveBeenCalled();
        expect(harness.client.listChats).not.toHaveBeenCalled();
        expect(harness.client.listMessages).not.toHaveBeenCalled();
        expect(Object.keys(harness.client)).toEqual([
          'listChats',
          'listMessages',
        ]);
        expect(
          harness.actionApprovalService.recordProviderAccepted,
        ).not.toHaveBeenCalled();
        expect(
          harness.projector.projectReceiptWithWriter,
        ).not.toHaveBeenCalled();
        expect(harness.messageProjectionWriter.project).not.toHaveBeenCalled();
        expect(
          harness.budgetService.releaseStartTargetForReceipt,
        ).not.toHaveBeenCalled();
        expect({
          receipt: harness.receipt,
          reservation: harness.reservation,
        }).toEqual(before);
        expect(Object.keys(harness.receiptRepository)).toEqual(['findOne']);
        expect(Object.keys(harness.reservationRepository)).toEqual(['findOne']);
      },
    );
  });

  it.each([
    { name: 'missing receipt', lookupWorkspaceId: workspaceId },
    {
      name: 'non-UNKNOWN receipt excluded by lookup',
      lookupWorkspaceId: workspaceId,
    },
    { name: 'wrong workspace', lookupWorkspaceId: 'other-workspace' },
  ])(
    'preserves $name rejection and exact lookup scope',
    async ({ lookupWorkspaceId }) => {
      const harness = buildHarness();
      harness.receiptRepository.findOne.mockResolvedValue(null);

      await expect(
        harness.service.inspectUnknown({
          workspaceId: lookupWorkspaceId,
          receiptId,
        }),
      ).rejects.toThrow('Unknown Instagram message receipt is unavailable');
      expect(harness.receiptRepository.findOne).toHaveBeenCalledWith(
        lookupWorkspaceId,
        {
          where: {
            id: receiptId,
            workspaceId: lookupWorkspaceId,
            state: 'UNKNOWN',
          },
          relations: { actionApprovalBinding: { evidenceLinks: true } },
        },
      );
      expect(harness.reservationRepository.findOne).not.toHaveBeenCalled();
      expect(harness.client.listChats).not.toHaveBeenCalled();
      expect(harness.client.listMessages).not.toHaveBeenCalled();
    },
  );

  it.each([
    { actionName: 'send_email', actionVersion: 2 },
    { actionName: 'send_instagram_message', actionVersion: 1 },
  ])(
    'rejects invalid START receipt binding before the guard: %j',
    async (invalid) => {
      const harness = buildHarness();
      harness.receiptRepository.findOne.mockResolvedValue({
        ...harness.receipt,
        actionApprovalBinding: {
          ...harness.storedBinding,
          actionKind: 'START_CHAT',
          ...invalid,
        },
      });

      await expect(
        harness.service.reconcile({ workspaceId, receiptId }),
      ).rejects.toThrow('Unknown Instagram message receipt is unavailable');
      expect(harness.reservationRepository.findOne).not.toHaveBeenCalled();
      expect(harness.client.listChats).not.toHaveBeenCalled();
      expect(harness.client.listMessages).not.toHaveBeenCalled();
      expect(
        harness.actionApprovalService.recordProviderAccepted,
      ).not.toHaveBeenCalled();
    },
  );

  it('preserves malformed binding rejection rather than returning indeterminate', async () => {
    const harness = buildHarness();
    harness.receiptRepository.findOne.mockResolvedValue({
      ...harness.receipt,
      actionApprovalBinding: null,
    });

    await expect(
      harness.service.inspectUnknown({ workspaceId, receiptId }),
    ).rejects.toThrow();
    expect(harness.reservationRepository.findOne).not.toHaveBeenCalled();
    expect(harness.client.listChats).not.toHaveBeenCalled();
    expect(harness.client.listMessages).not.toHaveBeenCalled();
  });

  it('uses exact REPLY conversation reads only and projects exactly one verified match into the same receipt', async () => {
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
    expect(harness.client.listChats).not.toHaveBeenCalled();
    expect(harness.client.listMessages).toHaveBeenCalledWith({
      accountId: 'provider-account',
      chatId: 'provider-chat',
      cursor: null,
      after: '2026-09-03T11:55:00.000Z',
      limit: 250,
    });
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

  describe.each([
    {
      name: 'unclassified sender without a self-sender flag',
      candidate: { senderId: 'provider-specific-self-id' },
    },
    {
      name: 'unclassified sender with a non-self-sender flag',
      candidate: {
        senderId: 'provider-specific-self-id',
        isSender: 0 as const,
      },
    },
    {
      name: 'outbound message one minute before dispatch',
      candidate: { timestamp: '2026-09-03T11:59:00.000Z' },
    },
    {
      name: 'outbound message with a null timestamp',
      candidate: { timestamp: null },
    },
    {
      name: 'outbound message with an invalid timestamp',
      candidate: { timestamp: 'not-a-timestamp' },
    },
  ])('$name', ({ candidate }) => {
    it.each([false, true])(
      'remains indeterminate after 24 hours without acceptance, projection, target release or provider writes (additional valid match: %s)',
      async (includeValidMatch) => {
        const harness = buildHarness();
        harness.client.listMessages.mockResolvedValue({
          messages: [
            { ...harness.message, ...candidate, messageId: 'uncertain' },
            ...(includeValidMatch ? [harness.message] : []),
          ],
          nextCursor: null,
        });

        await expect(
          harness.service.inspectUnknown({ workspaceId, receiptId }),
        ).resolves.toEqual({ kind: 'INDETERMINATE' });
        await expect(
          harness.service.reconcile({ workspaceId, receiptId }),
        ).resolves.toEqual({ kind: 'INDETERMINATE' });
        expect(
          harness.actionApprovalService.recordProviderAccepted,
        ).not.toHaveBeenCalled();
        expect(
          harness.projector.projectReceiptWithWriter,
        ).not.toHaveBeenCalled();
        expect(harness.messageProjectionWriter.project).not.toHaveBeenCalled();
        expect(
          harness.budgetService.releaseStartTargetForReceipt,
        ).not.toHaveBeenCalled();
        expect(Object.keys(harness.client)).toEqual([
          'listChats',
          'listMessages',
        ]);
        expect(harness.client.listMessages).toHaveBeenCalledWith({
          accountId: 'provider-account',
          chatId: 'provider-chat',
          cursor: null,
          after: '2026-09-03T11:55:00.000Z',
          limit: 250,
        });
      },
    );
  });

  it.each([
    {
      name: 'verified inbound',
      candidate: { senderId: 'creator-provider-id' },
    },
    { name: 'different content', candidate: { text: 'Different body' } },
    { name: 'null content', candidate: { text: null } },
    { name: 'hidden', candidate: { hidden: true } },
    { name: 'deleted', candidate: { deleted: true } },
    { name: 'event', candidate: { isEvent: true } },
  ])(
    'still excludes $name messages with uncertain timestamps',
    async ({ candidate }) => {
      const harness = buildHarness();
      harness.client.listMessages.mockResolvedValue({
        messages: [{ ...harness.message, timestamp: null, ...candidate }],
        nextCursor: null,
      });

      await expect(
        harness.service.inspectUnknown({ workspaceId, receiptId }),
      ).resolves.toEqual({ kind: 'NO_MATCH_COMPLETE' });
    },
  );

  it.each([
    { ageMs: 24 * 60 * 60 * 1000 - 1, kind: 'INDETERMINATE' },
    { ageMs: 24 * 60 * 60 * 1000, kind: 'NO_MATCH_COMPLETE' },
    { ageMs: 25 * 60 * 60 * 1000, kind: 'NO_MATCH_COMPLETE' },
  ])('preserves empty traversal at age $ageMs', async ({ ageMs, kind }) => {
    const harness = buildHarness(new Date(Date.now() - ageMs));
    harness.client.listMessages.mockResolvedValue({
      messages: [],
      nextCursor: null,
    });

    await expect(
      harness.service.inspectUnknown({ workspaceId, receiptId }),
    ).resolves.toEqual({ kind });
  });

  it('matches REPLY evidence exactly at the dispatch boundary', async () => {
    const harness = buildHarness();
    harness.client.listMessages.mockResolvedValue({
      messages: [{ ...harness.message, timestamp: '2026-09-03T12:00:00.000Z' }],
      nextCursor: null,
    });

    await expect(
      harness.service.inspectUnknown({ workspaceId, receiptId }),
    ).resolves.toEqual({
      kind: 'MATCH',
      chatId: 'provider-chat',
      messageId: 'provider-message',
    });
  });

  it('traverses REPLY message cursors with the exact chat and overlap timestamp', async () => {
    const harness = buildHarness();
    harness.client.listMessages
      .mockResolvedValueOnce({ messages: [], nextCursor: 'message-page-2' })
      .mockResolvedValueOnce({ messages: [harness.message], nextCursor: null });

    await expect(
      harness.service.inspectUnknown({ workspaceId, receiptId }),
    ).resolves.toEqual({
      kind: 'MATCH',
      chatId: 'provider-chat',
      messageId: 'provider-message',
    });
    expect(harness.client.listChats).not.toHaveBeenCalled();
    expect(harness.client.listMessages).toHaveBeenCalledTimes(2);
    for (const [index, cursor] of [null, 'message-page-2'].entries()) {
      expect(harness.client.listMessages).toHaveBeenNthCalledWith(index + 1, {
        accountId: 'provider-account',
        chatId: 'provider-chat',
        cursor,
        after: '2026-09-03T11:55:00.000Z',
        limit: 250,
      });
    }
  });

  it.each(['repeated cursor', 'page limit', 'provider failure'])(
    'keeps incomplete REPLY traversal indeterminate after 24 hours: %s',
    async (failure) => {
      const harness = buildHarness();
      if (failure === 'repeated cursor') {
        harness.client.listMessages.mockResolvedValue({
          messages: [],
          nextCursor: 'repeated',
        });
      } else if (failure === 'page limit') {
        harness.client.listMessages.mockImplementation(async () => ({
          messages: [],
          nextCursor: `page-${harness.client.listMessages.mock.calls.length}`,
        }));
      } else {
        harness.client.listMessages.mockRejectedValue(
          new Error('Provider unavailable'),
        );
      }

      await expect(
        harness.service.reconcile({ workspaceId, receiptId }),
      ).resolves.toEqual({ kind: 'INDETERMINATE' });
      expect(harness.client.listMessages).toHaveBeenCalledTimes(
        failure === 'repeated cursor' ? 2 : failure === 'page limit' ? 100 : 1,
      );
      expect(harness.client.listChats).not.toHaveBeenCalled();
      expect(
        harness.actionApprovalService.recordProviderAccepted,
      ).not.toHaveBeenCalled();
      expect(harness.projector.projectReceiptWithWriter).not.toHaveBeenCalled();
      expect(
        harness.budgetService.releaseStartTargetForReceipt,
      ).not.toHaveBeenCalled();
    },
  );

  it('matches normalized self-sender evidence with a provider-specific sender ID', async () => {
    const harness = buildHarness();
    harness.client.listMessages.mockResolvedValue({
      messages: [
        {
          ...harness.message,
          senderId: 'provider-specific-self-id',
          isSender: 1,
        },
      ],
      nextCursor: null,
    });

    await expect(
      harness.service.inspectUnknown({ workspaceId, receiptId }),
    ).resolves.toEqual({
      kind: 'MATCH',
      chatId: 'provider-chat',
      messageId: 'provider-message',
    });
  });

  it('preserves legacy owner-ID matching when self-sender evidence is absent', async () => {
    const harness = buildHarness();
    harness.client.listMessages.mockResolvedValue({
      messages: [{ ...harness.message, isSender: undefined }],
      nextCursor: null,
    });

    await expect(
      harness.service.inspectUnknown({ workspaceId, receiptId }),
    ).resolves.toEqual({
      kind: 'MATCH',
      chatId: 'provider-chat',
      messageId: 'provider-message',
    });
  });

  it.each([
    {
      name: 'self-sender flag with the exact recipient',
      message: { senderId: 'creator-provider-id', isSender: 1 as const },
    },
    {
      name: 'non-self-sender flag with the account owner',
      message: { senderId: 'brand-user', isSender: 0 as const },
    },
  ])(
    'returns indeterminate rather than clearing a past-24-hour receipt for contradictory $name evidence',
    async ({ message }) => {
      const harness = buildHarness(new Date(Date.now() - 25 * 60 * 60 * 1000));
      harness.client.listMessages.mockResolvedValue({
        messages: [{ ...harness.message, ...message }],
        nextCursor: null,
      });

      await expect(
        harness.service.inspectUnknown({ workspaceId, receiptId }),
      ).resolves.toEqual({ kind: 'INDETERMINATE' });
      expect(harness.client.listMessages).toHaveBeenCalledTimes(1);
      expect(harness.client.listChats).not.toHaveBeenCalled();
    },
  );
});

describe('InstagramMessageReconciliationService Accepted START hold safety', () => {
  it('retains receipt, accepted IDs, unsent draft and target/capacity holds when the real shared writer rejects background finalization', async () => {
    const legacyAuthority = buildInstagramMessageActionAuthority({
      ...authority.expectedActionBinding,
      ...authority.canonicalGraph,
      evidenceLinks: [...authority.expectedActionBinding.evidenceLinks],
      draft: {
        ...authority.canonicalGraph.draft,
        kind: 'START_CHAT',
        conversationRecordId: null,
        providerConversationId: null,
      },
    });
    const harness = buildHarness(
      new Date('2026-09-03T12:00:00Z'),
      legacyAuthority,
    );
    const receipt = {
      ...harness.receipt,
      state: 'PROVIDER_ACCEPTED',
      providerMessageId: null,
      providerExternalMessageId: 'provider-message',
      providerThreadExternalId: 'provider-chat',
      actionApprovalBinding: {
        ...harness.storedBinding,
        inboundMessageId: null,
        inboundSenderIgsid: null,
        inboundDirection: null,
        inboundReceivedAt: null,
      },
    };
    const reservation = {
      ...harness.reservation,
      targetReleasedAt: null as Date | null,
      releasedAt: null,
      capacityUnits: 1,
    };
    const draft = { sentAt: null as Date | null };
    const before = structuredClone({ receipt, reservation, draft });
    const repository = {
      findOne: jest.fn().mockResolvedValue(receipt),
      update: jest
        .fn()
        .mockImplementation(async (_where, patch) =>
          Object.assign(receipt, patch),
        ),
    };
    const bindingRepository = {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: 'account-binding', status: 'ACTIVE' }),
    };
    const client = {
      getChat: jest.fn().mockResolvedValue({
        attendeeProviderId:
          legacyAuthority.canonicalGraph.draft.recipientProviderId,
      }),
      getMessage: jest.fn().mockResolvedValue(harness.message),
    };
    const projection = {
      upsertVerifiedChat: jest
        .fn()
        .mockResolvedValue({ conversationRecordId: 'conversation' }),
      upsertVerifiedMessage: jest.fn(),
    };
    const draftService = {
      markSent: jest.fn().mockImplementation(async () => {
        draft.sentAt = new Date();
      }),
    };
    const writer = new InstagramMessageReceiptProjectionService(
      harness.authorityReader as never,
      bindingRepository as never,
      client as never,
      projection as never,
      draftService as never,
    );
    const projector = new ActionReceiptProjectorService(repository as never, {
      project: jest.fn(),
    });
    harness.budgetService.releaseStartTargetForReceipt.mockImplementation(
      async () => {
        reservation.targetReleasedAt = new Date();
      },
    );
    const service = new InstagramMessageReconciliationService(
      harness.receiptRepository as never,
      harness.reservationRepository as never,
      harness.actionApprovalService as never,
      harness.authorityReader as never,
      harness.client as never,
      projector,
      writer,
      harness.budgetService as never,
    );
    await expect(
      service.finalizeProviderAccepted({ workspaceId, receiptId }),
    ).rejects.toThrow('Instagram first-contact projection is unavailable');
    expect(repository.findOne).toHaveBeenCalledTimes(1);
    expect(repository.update).not.toHaveBeenCalled();
    expect(
      harness.authorityReader.rebuildForReconciliation,
    ).not.toHaveBeenCalled();
    expect(bindingRepository.findOne).not.toHaveBeenCalled();
    expect(client.getChat).not.toHaveBeenCalled();
    expect(client.getMessage).not.toHaveBeenCalled();
    expect(projection.upsertVerifiedChat).not.toHaveBeenCalled();
    expect(projection.upsertVerifiedMessage).not.toHaveBeenCalled();
    expect(draftService.markSent).not.toHaveBeenCalled();
    expect(
      harness.budgetService.releaseStartTargetForReceipt,
    ).not.toHaveBeenCalled();
    expect(
      harness.actionApprovalService.recordProviderAccepted,
    ).not.toHaveBeenCalled();
    expect({ receipt, reservation, draft }).toEqual(before);
  });
});
