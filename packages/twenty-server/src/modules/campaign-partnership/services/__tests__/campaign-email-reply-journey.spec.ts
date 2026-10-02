import { withWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { CampaignEmailInboundHeldWorkService } from 'src/modules/campaign-partnership/services/campaign-email-inbound-held-work.service';
import { CampaignEmailReplyWorkBoundaryService } from 'src/modules/campaign-partnership/services/campaign-email-reply-work-boundary.service';
import { CampaignEmailReplyWorkReviewService } from 'src/modules/campaign-partnership/services/campaign-email-reply-work-review.service';
import { CampaignEmailReplyPendingRecoveryService } from 'src/modules/campaign-partnership/services/campaign-email-reply-pending-recovery.service';

jest.mock('src/engine/twenty-orm/repository/permissions.utils', () => ({
  validateOperationIsPermittedOrThrow: jest.fn(),
}));
const ids = {
  w: '11111111-1111-4111-8111-111111111111',
  c: '22222222-2222-4222-8222-222222222222',
  p: '33333333-3333-4333-8333-333333333333',
  creator: '44444444-4444-4444-8444-444444444444',
  b: '55555555-5555-4555-8555-555555555555',
  m: '66666666-6666-4666-8666-666666666666',
  t: '77777777-7777-4777-8777-777777777777',
  ch: '88888888-8888-4888-8888-888888888888',
  a: '99999999-9999-4999-8999-999999999999',
  g: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  incarnation: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  member: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  work: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
};
const event = new Date('2026-09-28T12:00:00Z');
const auth = {
  type: 'user',
  workspace: { id: ids.w },
  userWorkspaceId: ids.member,
  workspaceMemberId: ids.member,
  user: { id: ids.c },
  workspaceMember: { id: ids.member, userId: ids.c },
} as never;

it('synthetic canonical inbound -> immutable HELD -> authorized Inbox choice/CAS -> post-commit recovery after outage; no generator/send', async () => {
  let work: Record<string, unknown> | null = null;
  let committed = false;
  const binding = {
    id: ids.b,
    campaignId: ids.c,
    participationId: ids.p,
    creatorId: ids.creator,
    messageThreadId: ids.t,
    messageChannelId: ids.ch,
    connectedAccountId: ids.a,
    providerThreadId: 'provider-thread',
    creatorSender: 'creator@example.test',
    accountRecipient: 'brand@example.test',
    messageId: null,
    establishedAt: new Date('2026-09-28T11:00:00Z'),
    revokedAt: null,
    deletedAt: null,
  };
  const query = jest.fn(
    async (sql: string, params?: unknown[]): Promise<unknown[]> => {
      if (sql.includes('information_schema.columns')) return [{ present: 11 }];
      if (sql.includes('to_regclass'))
        return [{ exists: 'core.UQ_CAMPAIGN_EMAIL_WORK_PROVIDER_ITEM' }];
      if (sql.includes('FROM core."campaignEmailBaselineGeneration"'))
        return [
          {
            id: ids.g,
            accountIncarnationId: ids.incarnation,
            completedAt: new Date('2026-09-28T11:00:00Z'),
          },
        ];
      if (
        sql.includes('SELECT count(*)') &&
        sql.includes('campaignEmailConversationBinding')
      )
        return [{ count: 1 }];
      if (sql.includes('FROM "message" m'))
        return [
          {
            id: ids.m,
            messageThreadId: ids.t,
            creatorId: ids.creator,
            receivedAt: event,
            createdAt: event,
            direction: 'INCOMING',
            isDraft: false,
          },
        ];
      if (sql.includes('FROM "campaignEmailConversationBinding"'))
        return [{ id: ids.b }];
      if (sql.includes('INSERT INTO core."campaignPartnershipWorkItem"')) {
        if (work !== null) return [];
        work = {
          id: ids.work,
          workspaceId: ids.w,
          state: 'HELD',
          createdAt: event,
          purpose: 'REPLY_AMBIGUITY',
          contextGeneration: 0,
          participationId: null,
          canonicalMessageId: ids.m,
          messageThreadId: ids.t,
          messageChannelId: ids.ch,
          connectedAccountId: ids.a,
          accountIncarnationId: ids.incarnation,
          providerMessageId: 'provider-id',
          providerThreadId: 'provider-thread',
          creatorSender: binding.creatorSender,
          accountRecipient: binding.accountRecipient,
          baselineGenerationId: ids.g,
          providerOccurredAt: event,
          resolvedCampaignId: null,
          resolvedCreatorId: null,
        };
        return [{ id: ids.work }];
      }
      if (sql.includes('UPDATE core."campaignPartnershipWorkItem"')) {
        if (!work || !committed || work.state !== 'HELD' || params?.[2] !== 0)
          return [];
        Object.assign(work, {
          state: 'PENDING',
          participationId: ids.p,
          resolvedCampaignId: ids.c,
          resolvedCreatorId: ids.creator,
          contextGeneration: 1,
        });
        return [[{ id: ids.work }], 1];
      }
      if (sql.includes('FROM core."campaignPartnershipWorkItem"'))
        return work ? [work] : [];
      return [];
    },
  );
  const baseRepo = (name: string) => ({
    target: name,
    objectRecordsPermissions: {
      campaignCreator: { canUpdateObjectRecords: true },
    },
    find: jest.fn(async () =>
      name === 'campaignEmailConversationBinding' ? [binding] : [],
    ),
    findOne: jest.fn(async ({ where }: { where: { id: string } }) => {
      if (name === 'workspaceMember') return { id: ids.member, userId: ids.c };
      if (name === 'messageThread')
        return where.id === ids.t ? { id: ids.t } : null;
      if (name === 'campaign')
        return {
          id: ids.c,
          replyAgentEnabled: true,
          replyAgentMode: 'REVIEW',
          replyAgentEnabledAt: new Date('2026-09-28T11:00:00Z'),
        };
      if (name === 'campaignCreator')
        return {
          id: ids.p,
          campaignId: ids.c,
          creatorId: ids.creator,
          replyAgentPaused: false,
          replyAgentMaterialGeneration: 0,
          replyAgentPauseHistory: null,
          excludedAt: null,
          stage: 'CONTACTED',
        };
      if (name === 'creator') return { id: ids.creator };
      return null;
    }),
  });
  const repos = Object.fromEntries(
    [
      'workspaceMember',
      'messageThread',
      'campaign',
      'campaignCreator',
      'creator',
      'campaignEmailConversationBinding',
    ].map((name) => [name, baseRepo(name)]),
  );
  const manager: {
    queryRunner: {
      isTransactionActive: boolean;
      isReleased: boolean;
      query: jest.Mock;
    };
    transaction: jest.Mock;
    getRepository: jest.Mock;
  } = {
    queryRunner: { isTransactionActive: true, isReleased: false, query },
    getRepository: jest.fn((name: string) => repos[name]),
    transaction: jest.fn(),
  };
  manager.transaction.mockImplementation(
    async (
      isolationOrFn: string | ((tx: unknown) => unknown),
      callback?: (tx: unknown) => unknown,
    ) =>
      (typeof isolationOrFn === 'function' ? isolationOrFn : callback!)(
        manager,
      ),
  );
  const orm = {
    executeInWorkspaceContext: jest.fn(async (fn: () => unknown) => fn()),
    getRepository: jest.fn(async (_workspace: string, name: string) => ({
      ...repos[name],
      manager,
    })),
  };
  const producer = new CampaignEmailInboundHeldWorkService();
  expect(
    await producer.recordInTransaction(
      {
        workspaceId: ids.w,
        messageId: ids.m,
        threadId: ids.t,
        channelId: ids.ch,
        connectedAccountId: ids.a,
        generationId: ids.g,
        providerMessageId: 'provider-id',
        providerThreadId: 'provider-thread',
        from: binding.creatorSender,
        to: binding.accountRecipient,
        providerOccurredAt: event,
      },
      manager as never,
    ),
  ).toBe('HELD');
  expect(work).toMatchObject({ state: 'HELD', participationId: null });
  committed = true; // fake outer canonical import COMMIT; no queue call occurred before here
  const boundary = new CampaignEmailReplyWorkBoundaryService(orm as never);
  const review = new CampaignEmailReplyWorkReviewService(
    orm as never,
    boundary,
  );
  const context = <T>(fn: () => T) =>
    withWorkspaceContext(
      {
        authContext: auth,
        userWorkspaceRoleMap: { [ids.member]: 'role' },
        apiKeyRoleMap: {},
      } as never,
      fn,
    );
  const page = await context(() =>
    review.listHeld({
      authContext: auth,
      expectedWorkspaceId: ids.w,
      threadId: ids.t,
    }),
  );
  expect(page.items).toEqual([
    {
      workItemId: ids.work,
      contextGeneration: 0,
      choices: [
        {
          bindingId: ids.b,
          campaignId: ids.c,
          participationId: ids.p,
          creatorId: ids.creator,
        },
      ],
    },
  ]);
  expect(
    await context(() =>
      review.promote({
        authContext: auth,
        expectedWorkspaceId: ids.w,
        workItemId: ids.work,
        bindingId: ids.b,
        expectedContextGeneration: 0,
        expectedParticipationMaterialGeneration: 0,
      }),
    ),
  ).toMatchObject({ state: 'PENDING', contextGeneration: 1 });
  const queue = {
    add: jest.fn().mockRejectedValueOnce(new Error('queue outage')),
  };
  const recovery = new CampaignEmailReplyPendingRecoveryService(
    { query } as never,
    queue as never,
  );
  await expect(recovery.publishPending()).rejects.toThrow('queue outage');
  expect(work).toMatchObject({ state: 'PENDING', contextGeneration: 1 });
  queue.add.mockResolvedValueOnce(undefined);
  await recovery.publishPending();
  expect(queue.add).toHaveBeenCalledTimes(2);
  await expect(
    context(() =>
      review.promote({
        authContext: auth,
        expectedWorkspaceId: ids.w,
        workItemId: ids.work,
        bindingId: ids.b,
        expectedContextGeneration: 0,
        expectedParticipationMaterialGeneration: 0,
      }),
    ),
  ).rejects.toThrow();
});
