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
  it('maps agent outcomes and skipped reasons and counts only open reviews', async () => {
    const memberships = [
      membership(1, 'NEGOTIATING'),
      membership(2, 'NEGOTIATING'),
      membership(3, 'NEGOTIATING'),
      membership(4, 'NEGOTIATING'),
      membership(5, 'READY'),
      membership(6, 'READY'),
      membership(7, 'READY'),
    ];
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('core."myahAgentRun"'))
        return [
          run(1, 'DRAFTED'),
          run(2, 'HANDED_OFF'),
          run(3, 'DRAFTED', true),
          run(4, 'SENT'),
        ];
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
    ]);
    expect(review.needReviewCount).toBe(2);
  });
});
