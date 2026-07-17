import {
  InstagramReplyActionDefinition,
  InstagramReplyActionProposalInputZodSchema,
} from 'src/engine/core-modules/action-approval/definitions/instagram-reply-action.definition';

const workspaceId = '00000000-0000-4000-8000-000000000001';
const draftId = '00000000-0000-4000-8000-000000000002';
const userWorkspaceId = '00000000-0000-4000-8000-000000000003';
const threadId = '00000000-0000-4000-8000-000000000004';

const sourceGraph = {
  draftId,
  draftBody: 'Cafe\r\nThanks!',
  draftLabel: 'Reply to @myah',
  draftSentAt: null,
  draftStatus: 'NEEDS_REVIEW',
  conversationId: '00000000-0000-4000-8000-000000000005',
  conversationLabel: '@myah',
  providerConversationId: 'provider-conversation-id',
  recipientIgsid: 'recipient-igsid',
  accountId: '00000000-0000-4000-8000-000000000006',
  accountLabel: '@myah_business',
  connectedAccountId: 'connected-account-id',
  composioUserId: 'workspace:00000000-0000-4000-8000-000000000001:instagram',
};

const buildDefinition = (rows: unknown[] = [sourceGraph]) => {
  const query = jest.fn().mockResolvedValue(rows);
  const globalWorkspaceOrmManager = {
    executeInWorkspaceContext: jest.fn(async (callback: () => unknown) =>
      callback(),
    ),
    getGlobalWorkspaceDataSource: jest.fn().mockResolvedValue({ query }),
  };
  const workspaceRepository = {
    findOneBy: jest.fn().mockResolvedValue({ id: workspaceId }),
  };

  const objectMetadataRepository = {
    find: jest.fn().mockResolvedValue([
      {
        id: '00000000-0000-4000-8000-000000000101',
        universalIdentifier: '85762d24-541b-407f-9d6a-cdf89552c665',
      },
      {
        id: '00000000-0000-4000-8000-000000000102',
        universalIdentifier: '36817464-855f-42db-9fbb-f8853643f8d6',
      },
      {
        id: '00000000-0000-4000-8000-000000000103',
        universalIdentifier: '2d357469-831a-4629-ad4b-47335900e883',
      },
    ]),
  };
  const Definition = InstagramReplyActionDefinition as unknown as new (
    ...args: unknown[]
  ) => InstagramReplyActionDefinition;

  return {
    query,
    objectMetadataRepository,
    definition: new Definition(
      workspaceRepository,
      globalWorkspaceOrmManager,
      objectMetadataRepository,
    ),
  };
};

describe('InstagramReplyActionDefinition', () => {
  it('accepts only a draft UUID as proposal input', () => {
    expect(InstagramReplyActionProposalInputZodSchema.parse({ draftId })).toEqual({
      draftId,
    });
    expect(() =>
      InstagramReplyActionProposalInputZodSchema.parse({
        draftId,
        body: 'caller supplied text',
      }),
    ).toThrow();
    expect(() =>
      InstagramReplyActionProposalInputZodSchema.parse({
        connectedAccountId: 'caller supplied account',
      }),
    ).toThrow();
  });

  it('derives normalized immutable authority and source evidence from the visible graph', async () => {
    const { definition, query } = buildDefinition();

    await expect(
      definition.propose({
        workspaceId,
        initiatorUserWorkspaceId: userWorkspaceId,
        threadId,
        input: { draftId },
      }),
    ).resolves.toMatchObject({
      proposal: {
        title: 'Reply to @myah',
        preview: { format: 'text', content: 'Cafe\r\nThanks!' },
        targetLabel: '@myah',
      },
      expectedActionBinding: {
        workspaceId,
        actionName: 'send_instagram_reply',
        actionVersion: 1,
        draftId,
        initiatorUserWorkspaceId: userWorkspaceId,
        threadId,
        contentDigest:
          '6e55a89183e73df9319c1ab0458b529c5d5a65ff0a77f73e5b3662beb2f14844',
        evidenceLinks: expect.arrayContaining([
          expect.objectContaining({
            objectMetadataId: '00000000-0000-4000-8000-000000000101',
            recordId: draftId,
            role: 'draft',
          }),
          expect.objectContaining({
            objectMetadataId: '00000000-0000-4000-8000-000000000102',
            recordId: sourceGraph.conversationId,
            role: 'conversation',
          }),
          expect.objectContaining({
            objectMetadataId: '00000000-0000-4000-8000-000000000103',
            recordId: sourceGraph.accountId,
            role: 'sending_account',
          }),
        ]),
      },
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('"conversationId"'),
      [draftId],
      undefined,
      { shouldBypassPermissionChecks: true },
    );
  });

  it.each([
    ['zero', []],
    ['two', [sourceGraph, sourceGraph]],
    ['malformed', [{ ...sourceGraph, recipientIgsid: '  ' }]],
    ['stale', [{ ...sourceGraph, draftSentAt: '2026-07-16T00:00:00.000Z' }]],
    ['invalid draft status', [{ ...sourceGraph, draftStatus: 'SENT' }]],
  ])('rejects a %s canonical account projection', async (_case, rows) => {
    const { definition } = buildDefinition(rows);

    await expect(
      definition.propose({
        workspaceId,
        initiatorUserWorkspaceId: userWorkspaceId,
        threadId,
        input: { draftId },
      }),
    ).rejects.toThrow('Instagram reply source graph is unavailable');
  });
});
