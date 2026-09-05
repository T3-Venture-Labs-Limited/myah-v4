import { buildInstagramMessageActionAuthority } from 'src/engine/core-modules/action-approval/definitions/instagram-message-action.definition';

type ProjectionWriter = {
  project: (input: Record<string, unknown>) => Promise<void>;
};

type ProjectionWriterConstructor = new (
  ...dependencies: never[]
) => ProjectionWriter;

type ProjectionWriterModule = {
  InstagramMessageReceiptProjectionService: ProjectionWriterConstructor;
};

const workspaceId = '00000000-0000-4000-8000-000000000001';
const draftId = '00000000-0000-4000-8000-000000000002';
const authority = buildInstagramMessageActionAuthority({
  workspaceId,
  initiatorUserWorkspaceId: '00000000-0000-4000-8000-000000000003',
  threadId: null,
  interactionContextType: 'MYAH_INBOX_INSTAGRAM_DRAFT',
  interactionContextId: draftId,
  draft: {
    id: draftId,
    revision: 2,
    body: 'Hello creator',
    kind: 'START_CHAT',
    creatorRecordId: '00000000-0000-4000-8000-000000000004',
    recipientUsername: 'creator.name',
    recipientSourceValues: [
      { field: 'instagramUsername', value: '@Creator.Name' },
    ],
    conversationRecordId: null,
    providerConversationId: null,
    recipientProviderId: 'creator-provider-id',
  },
  account: {
    bindingId: '00000000-0000-4000-8000-000000000005',
    workspaceInstagramAccountRecordId: '00000000-0000-4000-8000-000000000006',
    unipileAccountId: 'provider-account',
    instagramUserId: 'brand-provider-user',
  },
  evidenceLinks: [],
});
const projectionInput = {
  ...authority.expectedActionBinding,
  receiptId: '00000000-0000-4000-8000-000000000007',
  providerMessageId: null,
  providerExternalMessageId: 'provider-message',
  providerThreadExternalId: 'provider-chat',
};

const loadWriter = (): ProjectionWriterConstructor | undefined => {
  try {
    return (
      require('../instagram-message-receipt-projection.service') as ProjectionWriterModule
    ).InstagramMessageReceiptProjectionService;
  } catch {
    return undefined;
  }
};

const buildHarness = () => {
  const accountBinding = {
    id: authority.canonicalGraph.account.bindingId,
    workspaceId,
    workspaceInstagramAccountRecordId:
      authority.canonicalGraph.account.workspaceInstagramAccountRecordId,
    unipileAccountId: authority.canonicalGraph.account.unipileAccountId,
    instagramUserId: authority.canonicalGraph.account.instagramUserId,
    status: 'ACTIVE',
    deactivatedAt: null,
  };
  const authorityReader = {
    rebuildForReconciliation: jest.fn().mockResolvedValue(authority),
  };
  const bindingRepository = {
    findOne: jest.fn().mockResolvedValue(accountBinding),
  };
  const chat = {
    chatId: 'provider-chat',
    accountId: 'provider-account',
    accountType: 'INSTAGRAM',
    type: 'ONE_TO_ONE',
    attendeeProviderId: 'creator-provider-id',
    attendeeName: 'Creator',
    timestamp: new Date('2026-09-05T12:00:00.000Z'),
  };
  const message = {
    messageId: 'provider-message',
    accountId: 'provider-account',
    chatId: 'provider-chat',
    senderId: 'brand-provider-user',
    text: 'Hello creator',
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
    getChat: jest.fn().mockResolvedValue(chat),
    getMessage: jest.fn().mockResolvedValue(message),
  };
  const projection = {
    upsertVerifiedChat: jest
      .fn()
      .mockResolvedValue({ conversationRecordId: 'conversation-record' }),
    upsertVerifiedMessage: jest
      .fn()
      .mockResolvedValue({ messageRecordId: 'message-record' }),
  };
  const draftService = { markSent: jest.fn().mockResolvedValue(undefined) };
  const Writer = loadWriter();

  expect(Writer).toBeDefined();

  return {
    authorityReader,
    bindingRepository,
    chat,
    client,
    message,
    draftService,
    projection,
    writer: new Writer!(
      authorityReader as never,
      bindingRepository as never,
      client as never,
      projection as never,
      draftService as never,
    ),
  };
};

describe('InstagramMessageReceiptProjectionService', () => {
  it('rebuilds authority, verifies the accepted bound chat and message, then projects both idempotently', async () => {
    const harness = buildHarness();

    await expect(
      harness.writer.project(projectionInput),
    ).resolves.toBeUndefined();
    expect(harness.client.getChat).toHaveBeenCalledWith({
      accountId: 'provider-account',
      chatId: 'provider-chat',
      expectedAttendeeId: 'creator-provider-id',
    });
    expect(harness.client.getMessage).toHaveBeenCalledWith({
      accountId: 'provider-account',
      chatId: 'provider-chat',
      messageId: 'provider-message',
    });
    expect(harness.projection.upsertVerifiedChat).toHaveBeenCalledWith(
      expect.objectContaining({ chat: harness.chat }),
    );
    expect(harness.projection.upsertVerifiedMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationRecordId: 'conversation-record',
        message: harness.message,
      }),
    );
    expect(harness.draftService.markSent).toHaveBeenCalledWith({
      workspaceId,
      draftId,
      contentDigest: authority.expectedActionBinding.contentDigest,
    });
    expect(harness.client.getMessage.mock.invocationCallOrder[0]).toBeLessThan(
      harness.projection.upsertVerifiedMessage.mock.invocationCallOrder[0],
    );
  });

  it('fails closed before projection when the bound provider message content does not match approval', async () => {
    const harness = buildHarness();
    harness.client.getMessage.mockResolvedValue({
      ...harness.message,
      text: 'Different provider text',
    });

    await expect(harness.writer.project(projectionInput)).rejects.toThrow(
      'Accepted Instagram message does not match the approved content',
    );
    expect(harness.projection.upsertVerifiedChat).not.toHaveBeenCalled();
    expect(harness.projection.upsertVerifiedMessage).not.toHaveBeenCalled();
  });
});
