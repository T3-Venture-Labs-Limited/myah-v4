import { createHash } from 'crypto';

import { InstagramReplyDraftService } from 'src/engine/core-modules/instagram-reply/services/instagram-reply-draft.service';

const workspaceId = '7c36727d-117e-491b-8676-14e31daf610f';
const userWorkspaceId = '5f2ca278-f41f-4cf8-9b8d-a9ce5a9f2c76';
const connectedAccountId = 'ca_instagram_123';
const conversationId = '2370f3fb-5738-458c-ae4d-0bdb2c24611e';
const draftId = 'b24f28a7-64bd-4cb8-ac5f-837536ca1d1b';
const replyBody = 'Thanks for reaching out.';

const buildService = ({
  activeAccounts = [{ id: 'account-record-id' }],
  conversations = [],
  draft = {
    body: replyBody,
    name: 'Reply to wakozaco',
    sentAt: null,
    title: 'Reply to wakozaco',
  },
}: {
  activeAccounts?: { id: string }[];
  conversations?: { id: string; recipientIgsid: string | null }[];
  draft?:
    | {
        body: string;
        name: string | null;
        sentAt: string | null;
        title: string | null;
      }
    | undefined;
} = {}) => {
  const query = jest.fn(async (sql: string) => {
    if (sql.includes('FROM') && sql.includes('_myahInstagramAccount')) {
      return activeAccounts;
    }

    if (sql.includes('SELECT "id", "recipientIgsid"')) {
      return conversations;
    }

    if (sql.includes('SELECT "body", "sentAt"')) {
      return draft ? [draft] : [];
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
  const globalWorkspaceOrmManager = {
    executeInWorkspaceContext: jest.fn(async (callback: () => unknown) =>
      callback(),
    ),
    getGlobalWorkspaceDataSource: jest.fn().mockResolvedValue({ query }),
  };
  const workspaceRepository = {
    findOneBy: jest.fn().mockResolvedValue({ id: workspaceId }),
  };

  return {
    query,
    globalWorkspaceOrmManager,
    workspaceRepository,
    service: new InstagramReplyDraftService(
      workspaceRepository as never,
      globalWorkspaceOrmManager as never,
    ),
  };
};

describe('InstagramReplyDraftService', () => {
  it('stages a local conversation candidate and review draft without provider access', async () => {
    const { service, query, globalWorkspaceOrmManager } = buildService();

    const result = await service.prepare({
      workspaceId,
      userWorkspaceId,
      connectedAccountId,
      providerConversationId: 'provider-conversation-id',
      recipientIgsid: 'recipient-igsid',
      recipientLabel: '@wakozaco',
      body: `  ${replyBody}  `,
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
    });
  });
});
