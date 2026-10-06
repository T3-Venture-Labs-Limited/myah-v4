import { MyahReplyAgentReviewService } from 'src/modules/myah-reply-agent/services/myah-reply-agent-review.service';

jest.mock(
  'src/engine/twenty-orm/storage/orm-workspace-context.storage',
  () => ({
    getWorkspaceContext: () => ({}),
  }),
);
jest.mock(
  'src/engine/twenty-orm/utils/resolve-role-permission-config.util',
  () => ({ resolveRolePermissionConfig: () => ({ unionOf: ['role-1'] }) }),
);

const workspaceId = '20202020-1c25-4d02-bf25-6aeccf7ea419';
const campaignId = '11111111-0000-4000-8000-000000000001';
const creator = (n: number) => `22222222-0000-4000-8000-00000000000${n}`;
const membership = (n: number, stage: string) => ({
  id: `33333333-0000-4000-8000-00000000000${n}`,
  campaignId,
  creatorId: creator(n),
  stage,
});
const run = (n: number, status: string, handled = false) => ({
  creatorId: creator(n),
  channel: 'INSTAGRAM',
  conversationRecordId: `44444444-0000-4000-8000-00000000000${n}`,
  status,
  reason: status === 'HANDED_OFF' ? 'Asks for a paid rate' : null,
  draftBody: null,
  createdAt: new Date(),
  handled,
});

describe('MyahReplyAgentReviewService', () => {
  it('reports sent steps and eligibility, and clears the schedule after a reply', async () => {
    const memberships = [
      membership(1, 'CONTACTED'),
      membership(2, 'NEGOTIATING'),
    ];
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('SELECT DISTINCT ON (e."campaignCreatorId")'))
        return [
          {
            campaignCreatorId: memberships[0].id,
            state: 'ACTIVE',
            occurrenceState: 'PENDING',
            sentSteps: 1,
            totalSteps: 2,
            dueAt: new Date('2026-10-05T17:14:00Z'),
            reason: null,
          },
          {
            campaignCreatorId: memberships[1].id,
            state: 'REPLIED',
            occurrenceState: 'CANCELLED',
            sentSteps: 1,
            totalSteps: 2,
            dueAt: new Date('2026-10-05T17:14:00Z'),
            reason: null,
          },
        ];
      return [];
    });
    const service = new MyahReplyAgentReviewService(
      { query } as never,
      {
        executeInWorkspaceContext: async (callback: () => unknown) =>
          callback(),
        getRepository: async () => ({ find: async () => memberships }),
      } as never,
      { assertCampaign: jest.fn(async () => ({})) } as never,
      {} as never,
    );
    const review = await service.review(campaignId, {
      workspace: { id: workspaceId },
    } as never);
    expect(review.nodes.map((node) => node.outreach)).toEqual([
      {
        state: 'CONTACTED',
        sentSteps: 1,
        totalSteps: 2,
        nextEligibleAt: '2026-10-05T17:14:00.000Z',
        reason: null,
      },
      {
        state: 'REPLIED',
        sentSteps: 1,
        totalSteps: 2,
        nextEligibleAt: null,
        reason: null,
      },
    ]);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('core."campaignEnrollment"'),
      [workspaceId, campaignId, memberships.map(({ id }) => id)],
    );
  });

  it.each([
    ['ACTIVE', 'PENDING', 0, 'SCHEDULED'],
    ['ACTIVE', 'HELD', 1, 'NEEDS_YOU'],
    ['ACTIVE', 'UNKNOWN', 1, 'NEEDS_YOU'],
    ['ACTIVE', 'CANCELLED', 1, 'PAUSED'],
    ['FINISHED', null, 2, 'FINISHED'],
    ['EXCLUDED', null, 0, 'EXCLUDED'],
  ])(
    'reports %s/%s as %s steps and %s',
    async (state, occurrenceState, sentSteps, expected) => {
      const member = membership(1, 'CONTACTED');
      const query = jest.fn(async (sql: string) =>
        sql.includes('SELECT DISTINCT ON (e."campaignCreatorId")')
          ? [
              {
                campaignCreatorId: member.id,
                state,
                occurrenceState,
                sentSteps,
                totalSteps: 2,
                dueAt: null,
                reason: null,
              },
            ]
          : [],
      );
      const service = new MyahReplyAgentReviewService(
        { query } as never,
        {
          executeInWorkspaceContext: async (callback: () => unknown) =>
            callback(),
          getRepository: async () => ({ find: async () => [member] }),
        } as never,
        { assertCampaign: jest.fn(async () => ({})) } as never,
        {} as never,
      );
      const review = await service.review(campaignId, {
        workspace: { id: workspaceId },
      } as never);
      expect(review.nodes[0].outreach).toMatchObject({
        state: expected,
        sentSteps,
        nextEligibleAt: null,
      });
    },
  );

  it('maps agent outcomes and skipped reasons and counts only open reviews', async () => {
    const memberships = [
      membership(1, 'NEGOTIATING'),
      membership(2, 'NEGOTIATING'),
      membership(3, 'NEGOTIATING'),
      membership(4, 'NEGOTIATING'),
      membership(5, 'READY'),
      membership(6, 'READY'),
      membership(7, 'READY'),
      membership(8, 'NEGOTIATING'),
    ];
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('core."myahAgentRun"'))
        return [
          run(1, 'DRAFTED'),
          run(2, 'HANDED_OFF'),
          run(3, 'DRAFTED', true),
          run(4, 'SENT'),
          { ...run(8, 'FAILED'), reason: 'AI credit is used up.' },
        ];
      if (sql.includes('SELECT DISTINCT ON (e."campaignCreatorId")')) return [];
      if (sql.includes('to_regclass')) return [{ ok: true }];
      if (sql.includes('"campaignCreator" cc'))
        return [
          {
            creatorId: creator(5),
            campaignCreatorId: 'other',
            stage: 'CONTACTED',
            campaignId: 'other-campaign',
            campaignName: 'Summer SPF drop',
          },
        ];
      if (sql.includes('socialProfile'))
        return [{ creatorId: creator(7), handle: 'remy' }];
      if (sql.includes('COALESCE(email')) return [];
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const service = new MyahReplyAgentReviewService(
      { query } as never,
      {
        executeInWorkspaceContext: async (callback: () => unknown) =>
          callback(),
        getRepository: async () => ({ find: async () => memberships }),
      } as never,
      { assertCampaign: jest.fn(async () => ({})) } as never,
      {} as never,
    );

    const review = await service.review(campaignId, {
      workspace: { id: workspaceId },
    } as never);
    const actions = review.nodes.map(({ nextAction, reason }) => [
      nextAction,
      reason,
    ]);

    expect(actions).toEqual([
      ['REVIEW_DRAFT', null],
      ['NEEDS_YOU', 'Asks for a paid rate'],
      [null, null],
      ['SENT_AUTOMATICALLY', null],
      ['SKIPPED', 'Skipped: active in Summer SPF drop'],
      ['NOT_CONTACTABLE', 'Not contactable: no Instagram handle or email'],
      [null, null],
      ['NEEDS_YOU', 'AI credit is used up.'],
    ]);
    expect(review.needReviewCount).toBe(3);
  });
});
