import { createHash } from 'crypto';

import { InstagramReplyDraftService } from 'src/engine/core-modules/instagram-reply/services/instagram-reply-draft.service';

const workspaceId = '7c36727d-117e-491b-8676-14e31daf610f';
const userWorkspaceId = '5f2ca278-f41f-4cf8-9b8d-a9ce5a9f2c76';
const connectedAccountId = 'ca_instagram_123';
const conversationId = '2370f3fb-5738-458c-ae4d-0bdb2c24611e';
const draftId = 'b24f28a7-64bd-4cb8-ac5f-837536ca1d1b';
const replyBody = 'Thanks for reaching out.';

const buildService = ({
  activeAccounts = [
    { id: 'account-record-id', igUserId: 'sending-account-igsid' },
  ],
  conversations = [],
  inboundMessages = [
    {
      id: 'provider-inbound-message-id',
      message: 'Hello from Instagram',
      from: { id: 'recipient-igsid' },
      to: { data: [{ id: 'sending-account-igsid' }] },
      created_time: '2026-07-17T11:30:00.000Z',
    },
  ],
  draft = {
    body: replyBody,
    name: 'Reply to wakozaco',
    sentAt: null,
    title: 'Reply to wakozaco',
  },
  existingInboundMessages = [],
}: {
  activeAccounts?: { id: string; igUserId: string }[];
  conversations?: { id: string; recipientIgsid: string | null }[];
  inboundMessages?: Record<string, unknown>[];
  existingInboundMessages?: {
    id: string;
    direction: string;
    providerCreatedAt: Date | string | null;
  }[];
  draft?:
    | {
        body: string;
        name: string | null;
        sentAt: string | null;
        title: string | null;
      }
    | undefined;
} = {}) => {
  const query = jest.fn(async (sql: string, _parameters?: unknown[]) => {
    if (sql.includes('FROM') && sql.includes('_myahInstagramAccount')) {
      return activeAccounts;
    }

    if (sql.includes('SELECT "id", "recipientIgsid"')) {
      return conversations;
    }

    if (sql.includes('SELECT "body", "sentAt"')) {
      return draft ? [draft] : [];
    }

    if (sql.includes('SELECT "id", "direction", "providerCreatedAt"')) {
      return existingInboundMessages;
    }

    if (sql.includes('SELECT "providerConversationId", "recipientIgsid"')) {
      return [
        {
          label: 'wakozaco',
          name: 'wakozaco',
          providerConversationId: 'provider-conversation-id',
          recipientIgsid: 'recipient-igsid',
        },
      ];
    }

    return [];
  });
  const dataSource = {
    query,
    transaction: jest.fn(
      async (callback: (manager: { query: typeof query }) => unknown) =>
        callback({ query }),
    ),
  };
  const globalWorkspaceOrmManager = {
    executeInWorkspaceContext: jest.fn(async (callback: () => unknown) =>
      callback(),
    ),
    getGlobalWorkspaceDataSource: jest.fn().mockResolvedValue(dataSource),
  };
  const workspaceRepository = {
    findOneBy: jest.fn().mockResolvedValue({ id: workspaceId }),
  };

  const myahComposioService = {
    getActiveInstagramAccount: jest.fn().mockResolvedValue({
      connectedAccountId,
      composioUserId: `workspace:${workspaceId}:instagram`,
    }),
    executeInstagramTool: jest.fn().mockResolvedValue({
      kind: 'success',
      data: {
        data: inboundMessages,
      },
    }),
  };
  const DraftService = InstagramReplyDraftService as unknown as new (
    ...args: unknown[]
  ) => InstagramReplyDraftService;

  return {
    query,
    globalWorkspaceOrmManager,
    workspaceRepository,
    myahComposioService,
    service: new DraftService(
      workspaceRepository,
      globalWorkspaceOrmManager,
      myahComposioService,
    ),
  };
};

describe('InstagramReplyDraftService', () => {
  it('ingests exact live inbound provider evidence before staging a draft', async () => {
    const { service, query, globalWorkspaceOrmManager, myahComposioService } =
      buildService();

    const result = await service.prepare({
      workspaceId,
      userWorkspaceId,
      connectedAccountId,
      providerConversationId: 'provider-conversation-id',
      recipientIgsid: 'recipient-igsid',
      recipientLabel: '@wakozaco',
      body: `  ${replyBody}  `,
      inboundMessageId: 'provider-inbound-message-id',
    });

    expect(result).toMatchObject({
      connectedAccountId,
      body: replyBody,
      conversationId: expect.any(String),
      draftId: expect.any(String),
    });
    expect(result.conversationId).not.toBe(result.draftId);
    expect(
      globalWorkspaceOrmManager.executeInWorkspaceContext,
    ).toHaveBeenCalledTimes(1);
    expect(query.mock.calls.map(([sql]) => sql).join('\n')).toContain(
      '"_myahSocialConversation"',
    );
    expect(query.mock.calls.map(([sql]) => sql).join('\n')).toContain(
      '"_myahInstagramReplyDraft"',
    );
    expect(query.mock.calls.map(([sql]) => sql).join('\n')).toContain(
      "'NEEDS_REVIEW', 'AI'",
    );
    expect(myahComposioService.executeInstagramTool).toHaveBeenCalledWith({
      workspaceId,
      connectedAccountId,
      toolSlug: 'INSTAGRAM_LIST_ALL_MESSAGES',
      arguments: {
        conversation_id: 'provider-conversation-id',
        limit: 25,
      },
    });
    expect(query.mock.calls.map(([sql]) => sql).join('\n')).toContain(
      '"_myahSocialMessage"',
    );
    expect(
      query.mock.calls.find(
        ([sql]) =>
          sql.includes('INSERT INTO') && sql.includes('"_myahSocialMessage"'),
      )?.[1],
    ).toEqual(
      expect.arrayContaining([
        'provider-inbound-message-id',
        new Date('2026-07-17T11:30:00.000Z'),
      ]),
    );
    expect(
      query.mock.calls.find(
        ([sql]) =>
          sql.includes('INSERT INTO') &&
          sql.includes('"_myahInstagramReplyDraft"'),
      )?.[0],
    ).toContain('"inboundMessageRecordId"');
    expect(
      query.mock.calls.find(
        ([sql]) =>
          sql.includes('INSERT INTO') &&
          sql.includes('"_myahInstagramReplyDraft"'),
      )?.[0],
    ).toContain('"inboundProviderMessageId"');
  });
  it('does not create a draft from an unbound provider message', async () => {
    const { service, query, globalWorkspaceOrmManager } = buildService({
      inboundMessages: [
        {
          id: 'different-provider-message-id',
          from: { id: 'recipient-igsid' },
          to: { data: [{ id: 'sending-account-igsid' }] },
          created_time: '2026-07-17T11:30:00.000Z',
        },
      ],
    });

    await expect(
      service.prepare({
        workspaceId,
        userWorkspaceId,
        connectedAccountId,
        providerConversationId: 'provider-conversation-id',
        recipientIgsid: 'recipient-igsid',
        recipientLabel: '@wakozaco',
        body: replyBody,
        inboundMessageId: 'provider-inbound-message-id',
      }),
    ).rejects.toThrow('inbound Instagram message is unavailable');

    expect(
      globalWorkspaceOrmManager.executeInWorkspaceContext,
    ).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });
  it('backfills a legacy inbound provider timestamp only from matching proof', async () => {
    const { service, query } = buildService({
      existingInboundMessages: [
        {
          id: 'legacy-inbound-record-id',
          direction: 'INBOUND',
          providerCreatedAt: null,
        },
      ],
    });

    await service.prepare({
      workspaceId,
      userWorkspaceId,
      connectedAccountId,
      providerConversationId: 'provider-conversation-id',
      recipientIgsid: 'recipient-igsid',
      recipientLabel: '@wakozaco',
      body: replyBody,
      inboundMessageId: 'provider-inbound-message-id',
    });

    expect(
      query.mock.calls.find(
        ([sql]) =>
          sql.includes('UPDATE') && sql.includes('"providerCreatedAt"'),
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.any(String),
        ['legacy-inbound-record-id', new Date('2026-07-17T11:30:00.000Z')],
      ]),
    );
  });
  it('rejects a legacy inbound row once its provider timestamp differs', async () => {
    const { service, query } = buildService({
      existingInboundMessages: [
        {
          id: 'legacy-inbound-record-id',
          direction: 'INBOUND',
          providerCreatedAt: new Date('2026-07-17T11:31:00.000Z'),
        },
      ],
    });

    await expect(
      service.prepare({
        workspaceId,
        userWorkspaceId,
        connectedAccountId,
        providerConversationId: 'provider-conversation-id',
        recipientIgsid: 'recipient-igsid',
        recipientLabel: '@wakozaco',
        body: replyBody,
        inboundMessageId: 'provider-inbound-message-id',
      }),
    ).rejects.toThrow('inbound Instagram message no longer matches');

    expect(
      query.mock.calls.some(
        ([sql]) =>
          sql.includes('INSERT INTO') &&
          sql.includes('"_myahInstagramReplyDraft"'),
      ),
    ).toBe(false);
  });

  it('persists the prepared draft and conversation through the canonical account graph', async () => {
    const { service, query } = buildService();

    await service.prepare({
      workspaceId,
      userWorkspaceId,
      connectedAccountId,
      providerConversationId: 'provider-conversation-id',
      recipientIgsid: 'recipient-igsid',
      recipientLabel: '@wakozaco',
      body: replyBody,
      inboundMessageId: 'provider-inbound-message-id',
    });

    const statements = query.mock.calls.map(
      ([sql, parameters]) => `${sql}\n${JSON.stringify(parameters)}`,
    );
    expect(
      statements.find(
        (statement) =>
          statement.includes('INSERT INTO') &&
          statement.includes('"_myahSocialConversation"'),
      ),
    ).toContain('"instagramAccountId"');
    expect(
      statements.find(
        (statement) =>
          statement.includes('INSERT INTO') &&
          statement.includes('"_myahInstagramReplyDraft"'),
      ),
    ).toContain('"conversationId"');
  });

  it('does not create candidate records for a missing or ambiguous active account', async () => {
    const { service, query } = buildService({ activeAccounts: [] });

    await expect(
      service.prepare({
        workspaceId,
        userWorkspaceId,
        connectedAccountId,
        providerConversationId: 'provider-conversation-id',
        recipientIgsid: 'recipient-igsid',
        recipientLabel: '@wakozaco',
        body: replyBody,
        inboundMessageId: 'provider-inbound-message-id',
      }),
    ).rejects.toThrow('not the workspace active account');

    expect(
      query.mock.calls
        .map(([sql]) => sql)
        .filter((sql) => sql.includes('INSERT INTO')),
    ).toEqual([]);
  });

  it('rejects an approval binding whose preview differs from the stored draft', async () => {
    const { service } = buildService();

    await expect(
      service.validateApprovalBinding({
        workspaceId,
        connectedAccountId,
        conversationId,
        draftId,
        previewTextSha256: createHash('sha256')
          .update('Changed after preparation.')
          .digest('hex'),
        providerConversationId: 'provider-conversation-id',
        recipientIgsid: 'recipient-igsid',
      }),
    ).rejects.toThrow('preview does not match the stored draft');
  });

  it('accepts only a live local account, conversation, unsent draft, and exact preview', async () => {
    const { service } = buildService();

    await expect(
      service.validateApprovalBinding({
        workspaceId,
        connectedAccountId,
        conversationId,
        draftId,
        previewTextSha256: createHash('sha256').update(replyBody).digest('hex'),
        providerConversationId: 'provider-conversation-id',
        recipientIgsid: 'recipient-igsid',
      }),
    ).resolves.toBeUndefined();
  });
  it('derives approval card details only from the validated stored reply', async () => {
    const { service } = buildService();

    await expect(
      service.getApprovalDetails({
        workspaceId,
        connectedAccountId,
        conversationId,
        draftId,
      }),
    ).resolves.toEqual({
      body: replyBody,
      draftLabel: 'Reply to wakozaco',
      conversationLabel: 'wakozaco',
      providerConversationId: 'provider-conversation-id',
      recipientIgsid: 'recipient-igsid',
    });
  });
});
