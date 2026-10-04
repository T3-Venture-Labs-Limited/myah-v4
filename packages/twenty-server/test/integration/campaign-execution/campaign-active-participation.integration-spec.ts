import { randomUUID } from 'node:crypto';

import { type GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { SEED_APPLE_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';
import { findCampaignActiveParticipations } from 'src/modules/campaign-execution/utils/campaign-active-participation.util';

import { getDomainService } from 'test/integration/myah-inbox/utils/seed-myah-inbox-task-7-fixture.util';

const workspaceId = SEED_APPLE_WORKSPACE_ID;
const campaignA = randomUUID();
const campaignB = randomUUID();
const creators = {
  dropped: randomUUID(),
  posted: randomUUID(),
  contacted: randomUUID(),
  readyOnly: randomUUID(),
};

const query = (sql: string, parameters: unknown[]) =>
  global.testDataSource.query(sql, parameters);

beforeAll(async () => {
  const orm = getDomainService<GlobalWorkspaceOrmManager>(
    'GlobalWorkspaceOrmManager',
  );
  await orm.executeInWorkspaceContext(async () => {
    const repository = (name: string) =>
      orm.getRepository<Record<string, unknown>>(workspaceId, name, {
        shouldBypassPermissionChecks: true,
      });
    await (
      await repository('campaign')
    ).insert([
      { id: campaignA, name: 'Campaign A' },
      { id: campaignB, name: 'Campaign B' },
    ]);
    await (
      await repository('creator')
    ).insert(Object.entries(creators).map(([name, id]) => ({ id, name })));
    await (
      await repository('campaignCreator')
    ).insert([
      { campaignId: campaignA, creatorId: creators.dropped, stage: 'DROPPED' },
      { campaignId: campaignA, creatorId: creators.posted, stage: 'POSTED' },
      {
        campaignId: campaignA,
        creatorId: creators.contacted,
        stage: 'CONTACTED',
      },
      { campaignId: campaignA, creatorId: creators.readyOnly, stage: 'READY' },
      ...Object.values(creators).map((creatorId) => ({
        campaignId: campaignB,
        creatorId,
        stage: 'READY',
      })),
    ]);
  }, buildSystemAuthContext(workspaceId));
});

afterAll(async () => {
  await query(
    `DELETE FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."campaignCreator" WHERE "campaignId"=ANY($1::uuid[])`,
    [[campaignA, campaignB]],
  );
  await query(
    `DELETE FROM "workspace_1wgvd1injqtife6y4rvfbu3h5".creator WHERE id=ANY($1::uuid[])`,
    [Object.values(creators)],
  );
  await query(
    `DELETE FROM "workspace_1wgvd1injqtife6y4rvfbu3h5".campaign WHERE id=ANY($1::uuid[])`,
    [[campaignA, campaignB]],
  );
});

describe('One active Campaign per creator (PostgreSQL)', () => {
  it('lets a creator Dropped or Posted in Campaign A join Campaign B, but not one still contacted there', async () => {
    const active = await findCampaignActiveParticipations(query, {
      workspaceId,
      creatorIds: Object.values(creators),
      excludeCampaignId: campaignB,
    });

    expect([...active.keys()]).toEqual([creators.contacted]);
    expect(active.get(creators.contacted)).toMatchObject({
      campaignId: campaignA,
      campaignName: 'Campaign A',
      stage: 'CONTACTED',
    });
  });

  it('ignores the Campaign being started', async () => {
    const active = await findCampaignActiveParticipations(query, {
      workspaceId,
      creatorIds: [creators.contacted],
      excludeCampaignId: campaignA,
    });

    expect(active.size).toBe(0);
  });
});
