import { randomUUID } from 'node:crypto';

import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { type GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { SEED_APPLE_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';
import { USER_WORKSPACE_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/core/utils/seed-user-workspaces.util';
import { type CampaignProgressionService } from 'src/modules/campaign-execution/services/campaign-progression.service';
import { type CampaignSequenceService } from 'src/modules/myah-outreach/services/campaign-sequence.service';

import { getDomainService } from 'test/integration/myah-inbox/utils/seed-myah-inbox-task-7-fixture.util';

const workspaceId = SEED_APPLE_WORKSPACE_ID;
const schema = 'workspace_1wgvd1injqtife6y4rvfbu3h5';
const campaignId = randomUUID();
const ids = {
  execution: randomUUID(),
  authorization: randomUUID(),
  activation: randomUUID(),
  workflowVersion: randomUUID(),
};
const messages = [randomUUID(), randomUUID(), randomUUID()];
// Instagram → Instagram → email, with 60 s and 120 s gaps.
const plan = {
  kind: 'READY',
  nodes: [
    { messageId: messages[0], channel: 'INSTAGRAM' },
    { messageId: messages[1], channel: 'INSTAGRAM' },
    { messageId: messages[2], channel: 'EMAIL', replyToThread: false },
  ],
  delaysSeconds: [60, 120],
};

type Creator = {
  creatorId: string;
  membershipId: string;
  enrollmentId: string;
  occurrenceId: string;
};
const creators: Record<'both' | 'emailOnly' | 'instagramOnly', Creator> = {
  both: newCreator(),
  emailOnly: newCreator(),
  instagramOnly: newCreator(),
};
const profileIds = [randomUUID(), randomUUID()];

function newCreator(): Creator {
  return {
    creatorId: randomUUID(),
    membershipId: randomUUID(),
    enrollmentId: randomUUID(),
    occurrenceId: randomUUID(),
  };
}

const query = (sql: string, parameters: unknown[] = []) =>
  global.testDataSource.query(sql, parameters);

// The Instagram step of `creator` at `index` is in flight.
const inFlightAt = async (creator: Creator, index: number) => {
  await query(
    `INSERT INTO core."campaignEnrollment"
      (id,"workspaceId","campaignId","campaignExecutionId","authorizationId","authorizationGeneration","campaignCreatorId","creatorId","authoredMessageCount","nextAuthoredMessageIndex",state,"enrolledAt")
     VALUES ($1,$2,$3,$4,$5,1,$6,$7,3,$8,'ACTIVE',now())`,
    [
      creator.enrollmentId,
      workspaceId,
      campaignId,
      ids.execution,
      ids.authorization,
      creator.membershipId,
      creator.creatorId,
      index,
    ],
  );
  await query(
    `INSERT INTO core."campaignOccurrence"
      (id,"workspaceId","campaignId","enrollmentId","workflowVersionId","messageId","authoredMessageIndex",state,"dueAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,'IN_FLIGHT',now())`,
    [
      creator.occurrenceId,
      workspaceId,
      campaignId,
      creator.enrollmentId,
      ids.workflowVersion,
      messages[index],
      index,
    ],
  );
};

// As the worker does: inside the workspace context, one transaction.
const accept = (creator: Creator, acceptedAt: Date) => {
  const orm = getDomainService<GlobalWorkspaceOrmManager>(
    'GlobalWorkspaceOrmManager',
  );
  return orm.executeInWorkspaceContext(async () => {
    const dataSource = await orm.getGlobalWorkspaceDataSource();
    return dataSource.transaction((manager) =>
      getDomainService<CampaignProgressionService>(
        'CampaignProgressionService',
      ).reconcileInstagramOccurrenceInTransaction(
        {
          workspaceId,
          campaignId,
          occurrenceId: creator.occurrenceId,
          receiptId: null,
          outcome: 'ACCEPTED',
          acceptedAt,
        },
        manager as WorkspaceEntityManager,
      ),
    );
  }, buildSystemAuthContext(workspaceId));
};

type OccurrenceRow = { index: number; state: string; dueAt: string };

const state = async (creator: Creator) => ({
  occurrences: (await query(
    `SELECT "authoredMessageIndex" AS index, state, "dueAt" FROM core."campaignOccurrence"
      WHERE "enrollmentId"=$1 ORDER BY "authoredMessageIndex"`,
    [creator.enrollmentId],
  )) as OccurrenceRow[],
  enrollment: (
    await query(
      `SELECT state, "nextAuthoredMessageIndex" AS next FROM core."campaignEnrollment" WHERE id=$1`,
      [creator.enrollmentId],
    )
  )[0],
  stage: (
    await query(
      `SELECT stage::text FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."campaignCreator" WHERE id=$1`,
      [creator.membershipId],
    )
  )[0]?.stage,
});

beforeAll(async () => {
  jest
    .spyOn(
      getDomainService<CampaignSequenceService>('CampaignSequenceService'),
      'loadExecutionPlanInTransaction',
    )
    .mockResolvedValue(plan as never);
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
    ).insert({
      id: campaignId,
      name: 'Instagram progression fixture',
      lifecycleStatus: 'ACTIVE',
    });
    await (
      await repository('creator')
    ).insert([
      { id: creators.both.creatorId, name: 'Both', email: 'both@example.test' },
      {
        id: creators.emailOnly.creatorId,
        name: 'Email only',
        email: 'email.only@example.test',
      },
      { id: creators.instagramOnly.creatorId, name: 'Instagram only' },
    ]);
    await (
      await repository('campaignCreator')
    ).insert(
      Object.values(creators).map((creator) => ({
        id: creator.membershipId,
        campaignId,
        creatorId: creator.creatorId,
        stage: 'READY',
      })),
    );
  }, buildSystemAuthContext(workspaceId));
  await query(
    `INSERT INTO "workspace_1wgvd1injqtife6y4rvfbu3h5"."socialProfile" (id,"creatorId",platform,handle) VALUES
       ($1,$3,'INSTAGRAM','progression.both'),($2,$4,'INSTAGRAM','progression.instagram')`,
    [...profileIds, creators.both.creatorId, creators.instagramOnly.creatorId],
  );
  await query(
    `INSERT INTO core."campaignExecution"
      (id,"workspaceId","campaignId","timeZone","startLocalTime","endLocalTime","campaignCapacityTimeZone")
     VALUES ($1,$2,$3,'UTC','00:00','23:59','UTC')`,
    [ids.execution, workspaceId, campaignId],
  );
  await query(
    `INSERT INTO core."campaignSequenceAuthorization"
      ("authorizationId","workspaceId","campaignId","campaignExecutionId",generation,"startIdempotencyKey","preparedFingerprint","workflowId","workflowVersionId","initiatingUserWorkspaceId",state,"authorizedAt",binding)
     VALUES ($1,$2,$3,$4,1,$5,$6,$7,$8,$9,'ACTIVE',now(),'{}'::jsonb)`,
    [
      ids.authorization,
      workspaceId,
      campaignId,
      ids.execution,
      randomUUID(),
      'a'.repeat(64),
      randomUUID(),
      ids.workflowVersion,
      USER_WORKSPACE_DATA_SEED_IDS.TIM,
    ],
  );
  await query(
    `INSERT INTO core."campaignActivation"
      (id,"workspaceId","campaignId","campaignExecutionId","authorizationId","authorizationGeneration","workflowVersionId","activatedAt","createdEnrollmentCount","createdOccurrenceCount")
     VALUES ($1,$2,$3,$4,$5,1,$6,now(),3,3)`,
    [
      ids.activation,
      workspaceId,
      campaignId,
      ids.execution,
      ids.authorization,
      ids.workflowVersion,
    ],
  );
  await inFlightAt(creators.both, 0);
  await inFlightAt(creators.emailOnly, 0);
  await inFlightAt(creators.instagramOnly, 1);
});

afterAll(async () => {
  jest.restoreAllMocks();
  for (const statement of [
    `DELETE FROM core."campaignTimelineEvent" WHERE "campaignId"=$1`,
    `DELETE FROM core."campaignOccurrence" WHERE "campaignId"=$1`,
    `DELETE FROM core."campaignEnrollment" WHERE "campaignId"=$1`,
    `DELETE FROM core."campaignActivation" WHERE "campaignId"=$1`,
    `DELETE FROM core."campaignSequenceAuthorization" WHERE "campaignId"=$1`,
    `DELETE FROM core."campaignExecution" WHERE "campaignId"=$1`,
  ])
    await query(statement, [campaignId]).catch(() => undefined);
  await query(
    `DELETE FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."socialProfile" WHERE id=ANY($1::uuid[])`,
    [profileIds],
  );
  await query(
    `DELETE FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."campaignCreator" WHERE "campaignId"=$1`,
    [campaignId],
  );
  await query(
    `DELETE FROM "workspace_1wgvd1injqtife6y4rvfbu3h5".creator WHERE id=ANY($1::uuid[])`,
    [Object.values(creators).map(({ creatorId }) => creatorId)],
  );
  await query(
    `DELETE FROM "workspace_1wgvd1injqtife6y4rvfbu3h5".campaign WHERE id=$1`,
    [campaignId],
  );
});

describe('Instagram steps in a mixed sequence (PostgreSQL)', () => {
  const acceptedAt = new Date('2026-10-05T10:00:00.000Z');

  it('schedules the next Instagram step after the delay and marks the creator Contacted', async () => {
    expect(await accept(creators.both, acceptedAt)).toBe('CHANGED');

    const { occurrences, enrollment, stage } = await state(creators.both);
    expect(occurrences.map(({ index, state }) => [index, state])).toEqual([
      [0, 'SUCCEEDED'],
      [1, 'PENDING'],
    ]);
    expect(new Date(occurrences[1].dueAt).toISOString()).toBe(
      '2026-10-05T10:01:00.000Z',
    );
    expect(enrollment).toMatchObject({ state: 'ACTIVE', next: 1 });
    expect(stage).toBe('CONTACTED');
  });

  it('skips Instagram steps for a creator without a handle and goes to the email step', async () => {
    await accept(creators.emailOnly, acceptedAt);

    const { occurrences, enrollment } = await state(creators.emailOnly);
    expect(occurrences.map(({ index, state }) => [index, state])).toEqual([
      [0, 'SUCCEEDED'],
      [2, 'PENDING'],
    ]);
    // Both skipped gaps are kept: 60 s + 120 s.
    expect(new Date(occurrences[1].dueAt).toISOString()).toBe(
      '2026-10-05T10:03:00.000Z',
    );
    expect(enrollment).toMatchObject({ state: 'ACTIVE', next: 2 });
  });

  it('finishes a creator without an email after the last Instagram step', async () => {
    await accept(creators.instagramOnly, acceptedAt);

    const { occurrences, enrollment } = await state(creators.instagramOnly);
    expect(occurrences.map(({ index, state }) => [index, state])).toEqual([
      [1, 'SUCCEEDED'],
    ]);
    expect(enrollment).toMatchObject({ state: 'FINISHED' });
  });

  it('never schedules twice for a repeated acceptance', async () => {
    expect(await accept(creators.both, acceptedAt)).toBe('NOOP');
    expect((await state(creators.both)).occurrences).toHaveLength(2);
  });
});
