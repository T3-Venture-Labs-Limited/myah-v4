import { randomUUID } from 'node:crypto';

import {
  type ApplicationWorkspaceAuthContext,
  type UserWorkspaceAuthContext,
  type WorkspaceAuthContext,
} from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { withWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { type GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import {
  SEED_APPLE_WORKSPACE_ID,
  SEED_YCOMBINATOR_WORKSPACE_ID,
} from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';
import {
  CampaignMessageOverviewDateBasis,
  CampaignMessageOverviewInput,
  CampaignMessageOverviewView,
} from 'src/modules/campaign-execution/dtos/campaign-message-overview.dto';
import { CampaignMessageOverviewReaderService } from 'src/modules/campaign-execution/services/campaign-message-overview-reader.service';

import { getDomainService } from 'test/integration/myah-inbox/utils/seed-myah-inbox-task-7-fixture.util';

const workspaceId = SEED_APPLE_WORKSPACE_ID;
const foreignWorkspaceId = SEED_YCOMBINATOR_WORKSPACE_ID;
const campaignId = randomUUID();
const creatorId = randomUUID();
const campaignCreatorId = randomUUID();
const threadId = randomUUID();
const projectedMessageId = randomUUID();
const sentAttemptId = randomUUID();
const malformedMessageId = randomUUID();
const unreadableMessageId = randomUUID();
const unreadableThreadId = randomUUID();
const executionId = randomUUID();
const authorizationId = randomUUID();
const activationId = randomUUID();
const enrollmentId = randomUUID();
const workflowVersionId = randomUUID();
const generationId = randomUUID();
const accountIds = [randomUUID(), randomUUID()];
const occurrenceIds = {
  noForecast: randomUUID(),
  forecast: randomUUID(),
  sent: randomUUID(),
  malformed: randomUUID(),
  unreadable: randomUUID(),
  cancelled: randomUUID(),
  held: randomUUID(),
};
const foreignIds = {
  execution: randomUUID(),
  authorization: randomUUID(),
  activation: randomUUID(),
  enrollment: randomUUID(),
  occurrence: randomUUID(),
};
let reader: CampaignMessageOverviewReaderService;
let orm: GlobalWorkspaceOrmManager;
let adminAuthContext: UserWorkspaceAuthContext;
let brandBrainAuthContext: ApplicationWorkspaceAuthContext;

const buildAuthContext = async (
  roleLabel: string,
): Promise<UserWorkspaceAuthContext> => {
  const [row] = await global.testDataSource.query(
    `SELECT uw.id AS "userWorkspaceId",uw."userId"
       FROM core."userWorkspace" uw
       JOIN core."roleTarget" rt ON rt."userWorkspaceId"=uw.id
       JOIN core.role r ON r.id=rt."roleId" AND r.label=$2
      WHERE uw."workspaceId"=$1 LIMIT 1`,
    [workspaceId, roleLabel],
  );

  if (!row) throw new Error(`Missing seeded ${roleLabel} workspace member`);

  const workspaceMember = await orm.executeInWorkspaceContext(async () => {
    const repository = await orm.getRepository<{
      id: string;
      userId: string;
    }>(workspaceId, 'workspaceMember', { shouldBypassPermissionChecks: true });

    return repository.findOne({ where: { userId: row.userId } });
  }, buildSystemAuthContext(workspaceId));

  if (!workspaceMember)
    throw new Error(`Missing seeded ${roleLabel} workspace member record`);

  return {
    type: 'user',
    workspace: { id: workspaceId },
    userWorkspaceId: row.userWorkspaceId,
    user: { id: row.userId },
    workspaceMemberId: workspaceMember.id,
    workspaceMember: { id: workspaceMember.id },
  } as UserWorkspaceAuthContext;
};

const buildApplicationAuthContext = async (
  roleLabel: string,
): Promise<ApplicationWorkspaceAuthContext> => {
  const [row] = await global.testDataSource.query(
    `SELECT id,"applicationId" FROM core.role
      WHERE "workspaceId"=$1 AND label=$2`,
    [workspaceId, roleLabel],
  );

  if (!row?.applicationId) throw new Error(`Missing seeded ${roleLabel}`);

  return {
    type: 'application',
    workspace: { id: workspaceId },
    application: { id: row.applicationId, defaultRoleId: row.id },
  } as ApplicationWorkspaceAuthContext;
};

const insertExecutionChain = async (input: {
  targetWorkspaceId: string;
  execution: string;
  authorization: string;
  activation: string;
  enrollment: string;
  campaignCreator: string;
  creator: string;
  occurrence: string;
  initiatingUserWorkspaceId: string;
}) => {
  await global.testDataSource.query(
    `INSERT INTO core."campaignExecution"
      (id,"workspaceId","campaignId","timeZone","startLocalTime","endLocalTime","campaignCapacityTimeZone")
     VALUES ($1,$2,$3,'America/New_York','09:00','17:00','America/New_York')`,
    [input.execution, input.targetWorkspaceId, campaignId],
  );
  await global.testDataSource.query(
    `INSERT INTO core."campaignSequenceAuthorization"
      ("authorizationId","workspaceId","campaignId","campaignExecutionId",generation,"startIdempotencyKey","preparedFingerprint","workflowId","workflowVersionId","initiatingUserWorkspaceId",state,"authorizedAt",binding)
     VALUES ($1,$2,$3,$4,1,$5,$6,$7,$8,$9,'ACTIVE',now(),'{}'::jsonb)`,
    [
      input.authorization,
      input.targetWorkspaceId,
      campaignId,
      input.execution,
      randomUUID(),
      'a'.repeat(64),
      randomUUID(),
      workflowVersionId,
      input.initiatingUserWorkspaceId,
    ],
  );
  await global.testDataSource.query(
    `INSERT INTO core."campaignActivation"
      (id,"workspaceId","campaignId","campaignExecutionId","authorizationId","authorizationGeneration","workflowVersionId","activatedAt","createdEnrollmentCount","createdOccurrenceCount")
     VALUES ($1,$2,$3,$4,$5,1,$6,now(),1,1)`,
    [
      input.activation,
      input.targetWorkspaceId,
      campaignId,
      input.execution,
      input.authorization,
      workflowVersionId,
    ],
  );
  await global.testDataSource.query(
    `INSERT INTO core."campaignEnrollment"
      (id,"workspaceId","campaignId","campaignExecutionId","authorizationId","authorizationGeneration","campaignCreatorId","creatorId","authoredMessageCount","nextAuthoredMessageIndex",state,"enrolledAt")
     VALUES ($1,$2,$3,$4,$5,1,$6,$7,3000,0,'ACTIVE',now())`,
    [
      input.enrollment,
      input.targetWorkspaceId,
      campaignId,
      input.execution,
      input.authorization,
      input.campaignCreator,
      input.creator,
    ],
  );
  await global.testDataSource.query(
    `INSERT INTO core."campaignOccurrence"
      (id,"workspaceId","campaignId","enrollmentId","workflowVersionId","messageId","authoredMessageIndex",state,"dueAt")
     VALUES ($1,$2,$3,$4,$5,$6,0,'PENDING','2026-11-06T12:00:00Z')`,
    [
      input.occurrence,
      input.targetWorkspaceId,
      campaignId,
      input.enrollment,
      workflowVersionId,
      randomUUID(),
    ],
  );
};

const insertAcceptedAttempt = async (input: {
  occurrenceId: string;
  attemptId?: string;
  messageId: string;
  threadId: string | null;
  projectedMessageId: string | null;
  acceptedAt: string;
  accountId: string;
}) => {
  const claimedAt = new Date('2026-11-01T09:00:00.000Z');
  await global.testDataSource.query(
    `INSERT INTO core."outboundEmailAttempt"
      ("attemptId","workspaceId",source,"attemptState","capacityState","connectedAccountId","messageChannelId",provider,"normalizedSenderHandle","normalizedRecipient","selectionConstraintKind","senderPoolFingerprint","localDate","claimedAt","slotAt","unknownAfter","campaignId","enrollmentId","occurrenceId","authorizationId","workflowVersionId","messageId","attemptNumber","renderDigest","finalEvidenceDigest","providerMessageId","providerAcceptedAt",retryable,"providerHeaderMessageId","resolvedThreadExternalId","providerDeliveredRecipients","projectedMessageId","projectedMessageThreadId")
     VALUES ($1,$2,'CAMPAIGN_SEQUENCE','ACCEPTED','CONSUMED',$3,$4,'google','sender@example.com','creator@example.com','ROTATE','pool','2026-11-01',$5,$5,$6,$7,$8,$9,$10,$11,$12,1,$13,$14,$15,$16,false,$17,$18,$19::jsonb,$20,$21)`,
    [
      input.attemptId ?? randomUUID(),
      workspaceId,
      input.accountId,
      randomUUID(),
      claimedAt,
      new Date(claimedAt.getTime() + 60_000),
      campaignId,
      enrollmentId,
      input.occurrenceId,
      authorizationId,
      workflowVersionId,
      input.messageId,
      'b'.repeat(64),
      'c'.repeat(64),
      `provider-${input.occurrenceId}`,
      input.acceptedAt,
      `header-${input.occurrenceId}`,
      `thread-${input.occurrenceId}`,
      JSON.stringify({ to: ['creator@example.com'], cc: [], bcc: [] }),
      input.projectedMessageId,
      input.threadId,
    ],
  );
};

const readOverview = (
  authContext: WorkspaceAuthContext,
  filters: Partial<CampaignMessageOverviewInput> = {},
) =>
  withWorkspaceAuthContext(authContext, () =>
    reader.read({
      authContext,
      filters: Object.assign(new CampaignMessageOverviewInput(), {
        first: 50,
        view: CampaignMessageOverviewView.ALL,
        ...filters,
      }),
    }),
  );

describe('Campaign message overview PostgreSQL reader', () => {
  beforeAll(async () => {
    reader = getDomainService<CampaignMessageOverviewReaderService>(
      'CampaignMessageOverviewReaderService',
    );
    orm = getDomainService<GlobalWorkspaceOrmManager>(
      'GlobalWorkspaceOrmManager',
    );
    adminAuthContext = await buildAuthContext('Admin');
    const seededAccounts = await global.testDataSource.query(
      `SELECT id,"userWorkspaceId" FROM core."connectedAccount"
        WHERE "workspaceId"=$1 AND provider='google'
        ORDER BY ("userWorkspaceId"=$2) DESC,id`,
      [workspaceId, adminAuthContext.userWorkspaceId],
    );
    const ownAccount = seededAccounts.find(
      ({ userWorkspaceId }: { userWorkspaceId: string }) =>
        userWorkspaceId === adminAuthContext.userWorkspaceId,
    );
    const hiddenAccount = seededAccounts.find(
      ({ userWorkspaceId }: { userWorkspaceId: string }) =>
        userWorkspaceId !== adminAuthContext.userWorkspaceId,
    );
    if (!ownAccount || !hiddenAccount)
      throw new Error('Missing seeded account visibility fixtures');
    accountIds[0] = ownAccount.id;
    accountIds[1] = hiddenAccount.id;
    brandBrainAuthContext =
      await buildApplicationAuthContext('Brand Brain Admin');

    await orm.executeInWorkspaceContext(async () => {
      const campaign = await orm.getRepository<Record<string, unknown>>(
        workspaceId,
        'campaign',
        { shouldBypassPermissionChecks: true },
      );
      const creator = await orm.getRepository<Record<string, unknown>>(
        workspaceId,
        'creator',
        { shouldBypassPermissionChecks: true },
      );
      const campaignCreator = await orm.getRepository<Record<string, unknown>>(
        workspaceId,
        'campaignCreator',
        { shouldBypassPermissionChecks: true },
      );
      const messageThread = await orm.getRepository<Record<string, unknown>>(
        workspaceId,
        'messageThread',
        { shouldBypassPermissionChecks: true },
      );
      await campaign.insert({ id: campaignId, name: 'Postgres Overview' });
      await creator.insert({
        id: creatorId,
        name: 'Postgres Creator',
        email: 'creator@example.com',
      });
      await campaignCreator.insert({
        id: campaignCreatorId,
        name: 'Postgres membership',
        campaignId,
        creatorId,
      });
      await messageThread.insert({
        id: threadId,
        subject: 'Accepted Campaign message',
        creatorId,
        myahCampaignId: campaignId,
      });
    }, buildSystemAuthContext(workspaceId));

    await insertExecutionChain({
      targetWorkspaceId: workspaceId,
      execution: executionId,
      authorization: authorizationId,
      activation: activationId,
      enrollment: enrollmentId,
      campaignCreator: campaignCreatorId,
      creator: creatorId,
      occurrence: occurrenceIds.noForecast,
      initiatingUserWorkspaceId: adminAuthContext.userWorkspaceId,
    });
    await global.testDataSource.query(
      `INSERT INTO core."campaignOccurrence"
        (id,"workspaceId","campaignId","enrollmentId","workflowVersionId","messageId","authoredMessageIndex",state,"dueAt") VALUES
       ($1,$5,$6,$7,$8,$9,1,'PENDING','2026-11-05T12:00:00Z'),
       ($2,$5,$6,$7,$8,$10,2,'PENDING','2026-11-04T12:00:00Z'),
       ($3,$5,$6,$7,$8,$11,3,'PENDING','2026-11-03T12:00:00Z'),
       ($4,$5,$6,$7,$8,$12,4,'PENDING','2026-11-02T12:00:00Z')`,
      [
        occurrenceIds.forecast,
        occurrenceIds.sent,
        occurrenceIds.malformed,
        occurrenceIds.held,
        workspaceId,
        campaignId,
        enrollmentId,
        workflowVersionId,
        randomUUID(),
        projectedMessageId,
        malformedMessageId,
        randomUUID(),
      ],
    );
    await global.testDataSource.query(
      `INSERT INTO core."campaignOccurrence"
        (id,"workspaceId","campaignId","enrollmentId","workflowVersionId","messageId","authoredMessageIndex",state,"dueAt")
       VALUES ($1,$2,$3,$4,$5,$6,5,'PENDING','2026-11-02T18:00:00Z')`,
      [
        occurrenceIds.unreadable,
        workspaceId,
        campaignId,
        enrollmentId,
        workflowVersionId,
        unreadableMessageId,
      ],
    );
    await global.testDataSource.query(
      `INSERT INTO core."campaignOccurrence"
        (id,"workspaceId","campaignId","enrollmentId","workflowVersionId","messageId","authoredMessageIndex",state,"dueAt","terminalReason","terminalAt")
       VALUES ($1,$2,$3,$4,$5,$6,6,'CANCELLED','2026-11-01T18:00:00Z','AUTHORIZATION_REVOKED','2026-11-01T18:01:00Z')`,
      [
        occurrenceIds.cancelled,
        workspaceId,
        campaignId,
        enrollmentId,
        workflowVersionId,
        randomUUID(),
      ],
    );
    await global.testDataSource.query(
      `UPDATE core."campaignOccurrence"
          SET state='SUCCEEDED',"terminalReason"='PROVIDER_ACCEPTED',"terminalAt"='2026-11-04T12:01:00Z'
        WHERE id=ANY($1::uuid[])`,
      [[occurrenceIds.sent, occurrenceIds.malformed, occurrenceIds.unreadable]],
    );
    await global.testDataSource.query(
      `UPDATE core."campaignOccurrence" SET state='HELD',"holdReason"='SENDER_NOT_READY' WHERE id=$1`,
      [occurrenceIds.held],
    );
    await insertAcceptedAttempt({
      occurrenceId: occurrenceIds.sent,
      attemptId: sentAttemptId,
      messageId: projectedMessageId,
      threadId,
      projectedMessageId,
      acceptedAt: '2026-11-04T12:01:00Z',
      accountId: accountIds[0],
    });
    await global.testDataSource.query(
      `INSERT INTO core."campaignOutboundRender"
        ("attemptId","workspaceId","campaignId","enrollmentId","occurrenceId","authorizationId","workflowVersionId","messageId","renderDigest","rendererRevision",subject,html,text,"bodyWithSignature","toRecipient","references")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'browser-test','Rendered browser subject','<p>Rendered browser preview</p>','Rendered browser preview','Rendered browser preview',$10,'[]'::jsonb)`,
      [
        sentAttemptId,
        workspaceId,
        campaignId,
        enrollmentId,
        occurrenceIds.sent,
        authorizationId,
        workflowVersionId,
        projectedMessageId,
        'b'.repeat(64),
        'creator@example.com',
      ],
    );
    await insertAcceptedAttempt({
      occurrenceId: occurrenceIds.malformed,
      messageId: malformedMessageId,
      threadId: null,
      projectedMessageId: null,
      acceptedAt: '2026-11-03T12:01:00Z',
      accountId: accountIds[1],
    });
    await insertAcceptedAttempt({
      occurrenceId: occurrenceIds.unreadable,
      messageId: unreadableMessageId,
      threadId: unreadableThreadId,
      projectedMessageId: unreadableMessageId,
      acceptedAt: '2026-11-02T18:01:00Z',
      accountId: accountIds[1],
    });

    await global.testDataSource.query(
      `INSERT INTO core."campaignForecastHead" ("workspaceId","scopeKey","inputRevision") VALUES ($1,$2,2)`,
      [workspaceId, `workspace:${workspaceId}`],
    );
    await global.testDataSource.query(
      `INSERT INTO core."campaignForecastGeneration"
        (id,"workspaceId","scopeKey","inputRevision","generatedAt","horizonEndsAt",complete,"evaluatedCount")
       VALUES ($1,$2,$3,1,'2026-11-01T00:00:00Z','2026-11-03T00:00:00Z',false,5)`,
      [generationId, workspaceId, `workspace:${workspaceId}`],
    );
    await global.testDataSource.query(
      `INSERT INTO core."campaignForecastEntry"
        ("generationId","occurrenceId","workspaceId","campaignId","connectedAccountId","estimatedSendAt")
       VALUES ($1,$2,$3,$4,$5,'2026-11-05T13:00:00Z')`,
      [
        generationId,
        occurrenceIds.forecast,
        workspaceId,
        campaignId,
        accountIds[0],
      ],
    );
    await global.testDataSource.query(
      `UPDATE core."campaignForecastHead" SET "currentGenerationId"=$3 WHERE "workspaceId"=$1 AND "scopeKey"=$2`,
      [workspaceId, `workspace:${workspaceId}`, generationId],
    );

    await insertExecutionChain({
      targetWorkspaceId: foreignWorkspaceId,
      execution: foreignIds.execution,
      authorization: foreignIds.authorization,
      activation: foreignIds.activation,
      enrollment: foreignIds.enrollment,
      campaignCreator: campaignCreatorId,
      creator: creatorId,
      occurrence: foreignIds.occurrence,
      initiatingUserWorkspaceId: adminAuthContext.userWorkspaceId,
    });
  });

  afterAll(async () => {
    await global.testDataSource.query(
      `DELETE FROM core."campaignOutboundRender" WHERE "workspaceId"=$1 AND "campaignId"=$2`,
      [workspaceId, campaignId],
    );
    await global.testDataSource.query(
      `DELETE FROM core."outboundEmailAttempt" WHERE "workspaceId"=$1 AND "campaignId"=$2`,
      [workspaceId, campaignId],
    );
    await global.testDataSource.query(
      `DELETE FROM core."campaignForecastHead" WHERE "workspaceId"=$1 AND "scopeKey"=$2`,
      [workspaceId, `workspace:${workspaceId}`],
    );
    await global.testDataSource.query(
      `DELETE FROM core."campaignOccurrence" WHERE "campaignId"=$1 AND "workspaceId"=ANY($2::uuid[])`,
      [campaignId, [workspaceId, foreignWorkspaceId]],
    );
    await global.testDataSource.query(
      `DELETE FROM core."campaignEnrollment" WHERE "campaignId"=$1 AND "workspaceId"=ANY($2::uuid[])`,
      [campaignId, [workspaceId, foreignWorkspaceId]],
    );
    await global.testDataSource.query(
      `DELETE FROM core."campaignActivation" WHERE "campaignId"=$1 AND "workspaceId"=ANY($2::uuid[])`,
      [campaignId, [workspaceId, foreignWorkspaceId]],
    );
    await global.testDataSource.query(
      `DELETE FROM core."campaignSequenceAuthorization" WHERE "campaignId"=$1 AND "workspaceId"=ANY($2::uuid[])`,
      [campaignId, [workspaceId, foreignWorkspaceId]],
    );
    await global.testDataSource.query(
      `DELETE FROM core."campaignExecution" WHERE "campaignId"=$1 AND "workspaceId"=ANY($2::uuid[])`,
      [campaignId, [workspaceId, foreignWorkspaceId]],
    );
    await orm.executeInWorkspaceContext(async () => {
      for (const [name, id] of [
        ['messageThread', threadId],
        ['campaignCreator', campaignCreatorId],
        ['creator', creatorId],
        ['campaign', campaignId],
      ] as const) {
        const repository = await orm.getRepository<Record<string, unknown>>(
          workspaceId,
          name,
          { shouldBypassPermissionChecks: true },
        );
        await repository.delete({ id });
      }
    }, buildSystemAuthContext(workspaceId));
  });

  it('reads tenant-scoped queued, sent, malformed and no-forecast rows with keyset state', async () => {
    const result = await readOverview(adminAuthContext, { first: 2 });

    expect(result.nodes).toHaveLength(2);
    expect(result.pageInfo).toEqual(
      expect.objectContaining({
        forecastComplete: false,
        generationId,
        hasNextPage: true,
        refreshing: true,
      }),
    );
    expect(result.pageInfo.endCursor).toEqual(expect.any(String));

    const secondPage = await readOverview(adminAuthContext, {
      after: result.pageInfo.endCursor ?? undefined,
      first: 10,
    });
    const allNodes = [...result.nodes, ...secondPage.nodes];

    expect(allNodes.map(({ occurrenceId }) => occurrenceId)).toEqual(
      expect.arrayContaining(Object.values(occurrenceIds)),
    );
    expect(allNodes.map(({ occurrenceId }) => occurrenceId)).not.toContain(
      foreignIds.occurrence,
    );
    expect(
      allNodes.find(
        ({ occurrenceId }) => occurrenceId === occurrenceIds.noForecast,
      ),
    ).toEqual(
      expect.objectContaining({ estimatedSendAt: null, status: 'SCHEDULED' }),
    );
    expect(
      allNodes.find(({ occurrenceId }) => occurrenceId === occurrenceIds.sent),
    ).toEqual(
      expect.objectContaining({
        inboxThreadId: threadId,
        status: 'SENT',
      }),
    );
    expect(
      allNodes.find(
        ({ occurrenceId }) => occurrenceId === occurrenceIds.malformed,
      ),
    ).toEqual(
      expect.objectContaining({
        connectedAccountId: null,
        inboxThreadId: null,
        needsAttention: true,
        status: 'NEEDS_ATTENTION',
      }),
    );
    expect(
      allNodes.find(
        ({ occurrenceId }) => occurrenceId === occurrenceIds.cancelled,
      ),
    ).toEqual(
      expect.objectContaining({
        eligibleAfter: null,
        estimatedSendAt: null,
        status: 'CANCELLED',
      }),
    );
    expect(secondPage.filterOptions.connectedAccountIds).not.toContain(
      accountIds[1],
    );
  });

  it('intersects search, account and estimated-send dates without inventing missing dates', async () => {
    const result = await readOverview(adminAuthContext, {
      connectedAccountIds: [accountIds[0]],
      dateBasis: CampaignMessageOverviewDateBasis.ESTIMATED_SEND,
      dateFrom: '2026-11-05T00:00:00.000Z',
      dateTo: '2026-11-06T00:00:00.000Z',
      search: 'postgres creator',
    });

    expect(result.nodes).toEqual([
      expect.objectContaining({
        connectedAccountId: accountIds[0],
        estimatedSendAt: '2026-11-05T13:00:00.000Z',
        occurrenceId: occurrenceIds.forecast,
      }),
    ]);
    expect(result.nodes).not.toContainEqual(
      expect.objectContaining({ occurrenceId: occurrenceIds.noForecast }),
    );
  });

  it('searches only permitted rendered message content and returns its preview', async () => {
    const result = await readOverview(adminAuthContext, {
      search: 'rendered browser subject',
    });

    expect(result.nodes).toEqual([
      expect.objectContaining({
        occurrenceId: occurrenceIds.sent,
        preview: 'Rendered browser preview',
        subject: 'Rendered browser subject',
      }),
    ]);
  });

  it('keeps overview facts visible but removes Inbox handoff for a thread outside the workspace view', async () => {
    const result = await readOverview(adminAuthContext);
    const sent = result.nodes.find(
      ({ occurrenceId }) => occurrenceId === occurrenceIds.unreadable,
    );

    expect(sent).toEqual(
      expect.objectContaining({
        inboxContactId: null,
        inboxThreadId: null,
        status: 'SENT',
      }),
    );
  });

  it('does not expose rows when Campaign access is denied', async () => {
    await expect(readOverview(brandBrainAuthContext)).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
    });
  });

  it('rejects a keyset cursor after a new forecast generation is published', async () => {
    const firstPage = await readOverview(adminAuthContext, { first: 1 });
    const nextGenerationId = randomUUID();

    await global.testDataSource.query(
      `INSERT INTO core."campaignForecastGeneration"
        (id,"workspaceId","scopeKey","inputRevision","generatedAt","horizonEndsAt",complete,"evaluatedCount")
       VALUES ($1,$2,$3,2,'2026-11-01T01:00:00Z','2026-11-03T01:00:00Z',true,6)`,
      [nextGenerationId, workspaceId, `workspace:${workspaceId}`],
    );
    await global.testDataSource.query(
      `UPDATE core."campaignForecastHead" SET "currentGenerationId"=$3
        WHERE "workspaceId"=$1 AND "scopeKey"=$2`,
      [workspaceId, `workspace:${workspaceId}`, nextGenerationId],
    );

    await expect(
      readOverview(adminAuthContext, {
        after: firstPage.pageInfo.endCursor ?? undefined,
        first: 1,
      }),
    ).rejects.toThrow('Campaign message overview changed; restart pagination');

    await global.testDataSource.query(
      `UPDATE core."campaignForecastHead" SET "currentGenerationId"=$3
        WHERE "workspaceId"=$1 AND "scopeKey"=$2`,
      [workspaceId, `workspace:${workspaceId}`, generationId],
    );
    await global.testDataSource.query(
      `DELETE FROM core."campaignForecastGeneration" WHERE id=$1`,
      [nextGenerationId],
    );
  });

  it('uses the bounded overview index for dense and distant queues under concurrent readers', async () => {
    await global.testDataSource.query(
      `INSERT INTO core."campaignOccurrence"
        (id,"workspaceId","campaignId","enrollmentId","workflowVersionId","messageId","authoredMessageIndex",state,"dueAt")
       SELECT uuid_generate_v4(),$1,$2,$3,$4,uuid_generate_v4(),100 + n,'PENDING',
              CASE WHEN n <= 1000 THEN '2026-11-02T00:00:00Z'::timestamptz + n * interval '1 second'
                   ELSE '2036-11-02T00:00:00Z'::timestamptz + n * interval '1 day' END
         FROM generate_series(1,2000) n`,
      [workspaceId, campaignId, enrollmentId, workflowVersionId],
    );
    await global.testDataSource.query(
      `INSERT INTO core."campaignForecastEntry"
        ("generationId","occurrenceId","workspaceId","campaignId","connectedAccountId","estimatedSendAt")
       SELECT $1,o.id,$2,$3,CASE WHEN o."authoredMessageIndex" % 2=0 THEN $4::uuid ELSE $5::uuid END,o."dueAt"
         FROM core."campaignOccurrence" o
        WHERE o."workspaceId"=$2 AND o."campaignId"=$3 AND o."authoredMessageIndex">=101`,
      [generationId, workspaceId, campaignId, accountIds[0], accountIds[1]],
    );

    const [plan] = await global.testDataSource.query(
      `EXPLAIN (ANALYZE,FORMAT JSON)
       SELECT id FROM core."campaignOccurrence"
        WHERE "workspaceId"=$1 ORDER BY "dueAt" DESC,id DESC LIMIT 51`,
      [workspaceId],
    );
    expect(JSON.stringify(plan['QUERY PLAN'])).toMatch(/Index.*Scan/);

    const startedAt = performance.now();
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        readOverview(adminAuthContext, {
          connectedAccountIds: [accountIds[0]],
          first: 50,
        }),
      ),
    );
    const durationMs = performance.now() - startedAt;

    expect(results.map(({ nodes }) => nodes.length)).toEqual(
      Array<number>(8).fill(50),
    );
    expect(durationMs).toBeLessThan(10_000);

    await global.testDataSource.query(
      `DELETE FROM core."campaignForecastEntry" WHERE "generationId"=$1 AND "occurrenceId" IN
        (SELECT id FROM core."campaignOccurrence" WHERE "workspaceId"=$2 AND "campaignId"=$3 AND "authoredMessageIndex">=101)`,
      [generationId, workspaceId, campaignId],
    );
    await global.testDataSource.query(
      `DELETE FROM core."campaignOccurrence" WHERE "workspaceId"=$1 AND "campaignId"=$2 AND "authoredMessageIndex">=101`,
      [workspaceId, campaignId],
    );
  });
});
