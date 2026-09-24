// Shared committed PostgreSQL fixture for Campaign reply evidence races.
// Workspace schema identifiers are UUID-derived; all row values are bound.
import { randomUUID } from 'node:crypto';

import { type GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';

export const getOrm = (): GlobalWorkspaceOrmManager => {
  const container = (
    global.app as typeof global.app & {
      container: {
        getModules: () => Map<
          unknown,
          { providers: Map<unknown, { instance?: unknown }> }
        >;
      };
    }
  ).container;
  for (const moduleRef of container.getModules().values()) {
    for (const [token, provider] of moduleRef.providers) {
      if (
        typeof token === 'function' &&
        token.name === 'GlobalWorkspaceOrmManager' &&
        provider.instance
      )
        return provider.instance as GlobalWorkspaceOrmManager;
    }
  }
  throw new Error('Workspace ORM provider not found');
};

export type FixtureIds = Record<string, string>;
export type Routing = {
  channelId: string;
  accountId: string;
  sender: string;
  userWorkspaceId: string;
};
type Runner = {
  query: (sql: string, parameters?: unknown[]) => Promise<unknown>;
};

export const createCampaignFixtureIds = (): FixtureIds =>
  Object.fromEntries(
    [
      'campaign',
      'execution',
      'authorization',
      'activation',
      'workflow',
      'version',
      'creatorA',
      'creatorB',
      'campaignCreatorA',
      'campaignCreatorB',
      'enrollmentA',
      'enrollmentB',
      'occurrenceA',
      'occurrenceB',
      'messageA',
      'messageB',
      'attemptA',
      'attemptB',
      'inbound',
      'inboundThread',
    ].map((key) => [key, randomUUID()]),
  );

// Seeds a Campaign with enrollments A/B, attempt A ACCEPTED and attempt B UNKNOWN.
export const seedCampaignFixture = async (
  runner: Runner,
  {
    ids,
    workspaceId,
    schemaName,
    routing,
    secondEnrollmentId,
    threadExternalId = 'shared-thread',
    recipient = 'creator@example.com',
  }: {
    ids: FixtureIds;
    workspaceId: string;
    schemaName: string;
    routing: Routing;
    secondEnrollmentId: string;
    threadExternalId?: string;
    recipient?: string;
  },
) => {
  // UUID-derived schema identifier; all values remain bound parameters.
  // pi-lens-ignore: sql-injection, no-sql-in-code
  await runner.query(
    `INSERT INTO "${schemaName}".campaign (id,name) VALUES ($1,'MYAH-415 test')`,
    [ids.campaign],
  );
  // pi-lens-ignore: sql-injection, no-sql-in-code
  await runner.query(
    `INSERT INTO "${schemaName}".creator (id,name) VALUES ($1,'Creator A'),($2,'Creator B')`,
    [ids.creatorA, ids.creatorB],
  );
  // pi-lens-ignore: sql-injection, no-sql-in-code
  await runner.query(
    `INSERT INTO "${schemaName}"."messageThread" (id,subject) VALUES ($1,'MYAH-415 reply')`,
    [ids.inboundThread],
  );
  // pi-lens-ignore: sql-injection, no-sql-in-code
  await runner.query(
    `INSERT INTO "${schemaName}"."campaignCreator" (id,"campaignId","creatorId",stage)
    VALUES ($1,$3,$4,'CONTACTED'),($2,$3,$5,'CONTACTED')`,
    [
      ids.campaignCreatorA,
      ids.campaignCreatorB,
      ids.campaign,
      ids.creatorA,
      ids.creatorB,
    ],
  );
  await runner.query(
    `INSERT INTO core."campaignExecution"
    (id,"workspaceId","campaignId","timeZone","startLocalTime","endLocalTime","campaignCapacityTimeZone")
    VALUES ($1,$2,$3,'UTC','00:00','23:59','UTC')`,
    [ids.execution, workspaceId, ids.campaign],
  );
  await runner.query(
    `INSERT INTO core."campaignSequenceAuthorization"
    ("authorizationId","workspaceId","campaignId","campaignExecutionId",generation,
     "startIdempotencyKey","preparedFingerprint","workflowId","workflowVersionId",
     "initiatingUserWorkspaceId",state,"authorizedAt",binding)
    VALUES ($1,$2,$3,$4,1,$5,repeat('a',64),$6,$7,$8,'ACTIVE',now(),'{}'::jsonb)`,
    [
      ids.authorization,
      workspaceId,
      ids.campaign,
      ids.execution,
      randomUUID(),
      ids.workflow,
      ids.version,
      routing.userWorkspaceId,
    ],
  );
  await runner.query(
    `INSERT INTO core."campaignActivation"
    (id,"workspaceId","campaignId","campaignExecutionId","authorizationId",
     "authorizationGeneration","workflowVersionId","activatedAt","createdEnrollmentCount","createdOccurrenceCount")
    VALUES ($1,$2,$3,$4,$5,1,$6,now(),2,2)`,
    [
      ids.activation,
      workspaceId,
      ids.campaign,
      ids.execution,
      ids.authorization,
      ids.version,
    ],
  );
  for (const [enrollmentId, campaignCreatorId, creatorId] of [
    [ids.enrollmentA, ids.campaignCreatorA, ids.creatorA],
    [ids.enrollmentB, ids.campaignCreatorB, ids.creatorB],
  ]) {
    await runner.query(
      `INSERT INTO core."campaignEnrollment"
      (id,"workspaceId","campaignId","campaignExecutionId","authorizationId","authorizationGeneration",
       "campaignCreatorId","creatorId","authoredMessageCount","nextAuthoredMessageIndex",state,"enrolledAt")
      VALUES ($1,$2,$3,$4,$5,1,$6,$7,2,1,'ACTIVE',now())`,
      [
        enrollmentId,
        workspaceId,
        ids.campaign,
        ids.execution,
        ids.authorization,
        campaignCreatorId,
        creatorId,
      ],
    );
  }
  for (const [occurrenceId, enrollmentId, messageId, index, state] of [
    [ids.occurrenceA, ids.enrollmentA, ids.messageA, 0, 'SUCCEEDED'],
    [ids.occurrenceB, secondEnrollmentId, ids.messageB, 1, 'IN_FLIGHT'],
  ] as const) {
    await runner.query(
      `INSERT INTO core."campaignOccurrence"
      (id,"workspaceId","campaignId","enrollmentId","workflowVersionId","messageId",
       "authoredMessageIndex",state,"dueAt","terminalReason","terminalAt")
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now(),$9,$10)`,
      [
        occurrenceId,
        workspaceId,
        ids.campaign,
        enrollmentId,
        ids.version,
        messageId,
        index,
        state,
        state === 'SUCCEEDED' ? 'PROVIDER_ACCEPTED' : null,
        state === 'SUCCEEDED' ? new Date() : null,
      ],
    );
  }
  await runner.query(
    `INSERT INTO core."outboundEmailAttempt"
    ("attemptId","workspaceId",source,"attemptState","capacityState","connectedAccountId","messageChannelId",
     provider,"normalizedSenderHandle","normalizedRecipient","selectionConstraintKind","senderPoolFingerprint",
     "localDate","claimedAt","slotAt","unknownAfter","campaignId","enrollmentId","occurrenceId",
     "authorizationId","workflowVersionId","messageId","attemptNumber","renderDigest","finalEvidenceDigest",
     "providerMessageId","providerMessageExternalId","providerHeaderMessageId","providerAcceptedAt",retryable,"resolvedThreadExternalId")
    VALUES ($1,$2,'CAMPAIGN_SEQUENCE','ACCEPTED','CONSUMED',$3,$4,'google',$5,$13,
      'ROTATE',repeat('b',64),current_date,now(),now(),now()+interval '1 minute',$6,$7,$8,$9,$10,$11,1,
      repeat('c',64),repeat('d',64),'provider-a','external-a','<first@example.com>',now(),false,$12)`,
    [
      ids.attemptA,
      workspaceId,
      routing.accountId,
      routing.channelId,
      routing.sender,
      ids.campaign,
      ids.enrollmentA,
      ids.occurrenceA,
      ids.authorization,
      ids.version,
      ids.messageA,
      threadExternalId,
      recipient,
    ],
  );
  await runner.query(
    `INSERT INTO core."outboundEmailAttempt"
    ("attemptId","workspaceId",source,"attemptState","capacityState","connectedAccountId","messageChannelId",
     provider,"normalizedSenderHandle","normalizedRecipient","selectionConstraintKind","senderPoolFingerprint",
     "localDate","claimedAt","slotAt","unknownAfter","campaignId","enrollmentId","occurrenceId",
     "authorizationId","workflowVersionId","messageId","attemptNumber","renderDigest")
    VALUES ($1,$2,'CAMPAIGN_SEQUENCE','UNKNOWN','PROVISIONAL_UNKNOWN',$3,$4,'google',$5,$12,
      'ROTATE',repeat('b',64),current_date,now(),now(),now()+interval '1 minute',$6,$7,$8,$9,$10,$11,1,repeat('c',64))`,
    [
      ids.attemptB,
      workspaceId,
      routing.accountId,
      routing.channelId,
      routing.sender,
      ids.campaign,
      secondEnrollmentId,
      ids.occurrenceB,
      ids.authorization,
      ids.version,
      ids.messageB,
      recipient,
    ],
  );
};

// Deletes committed rows written by seedCampaignFixture and the reply path.
export const cleanupCampaignFixture = async (
  runner: Runner,
  {
    ids,
    workspaceId,
    schemaName,
  }: { ids: FixtureIds; workspaceId: string; schemaName: string },
) => {
  await runner.query(
    `DELETE FROM core."myahCampaignReplyPending" WHERE "workspaceId"=$1 AND "messageId"=$2`,
    [workspaceId, ids.inbound],
  );
  await runner.query(
    `DELETE FROM core."myahCampaignReplyEvidence" WHERE "workspaceId"=$1 AND "inboundMessageId"=$2`,
    [workspaceId, ids.inbound],
  );
  // pi-lens-ignore: sql-injection, no-sql-in-code
  await runner.query(
    `DELETE FROM "${schemaName}"."messageThread" WHERE id=$1`,
    [ids.inboundThread],
  );
  await runner.query(
    `DELETE FROM core."outboundEmailAttempt" WHERE "attemptId"=ANY($1::uuid[])`,
    [[ids.attemptA, ids.attemptB]],
  );
  await runner.query(
    `DELETE FROM core."campaignOccurrence" WHERE id=ANY($1::uuid[])`,
    [[ids.occurrenceA, ids.occurrenceB]],
  );
  await runner.query(
    `DELETE FROM core."campaignEnrollment" WHERE id=ANY($1::uuid[])`,
    [[ids.enrollmentA, ids.enrollmentB]],
  );
  await runner.query(`DELETE FROM core."campaignActivation" WHERE id=$1`, [
    ids.activation,
  ]);
  await runner.query(
    `DELETE FROM core."campaignSequenceAuthorization" WHERE "authorizationId"=$1`,
    [ids.authorization],
  );
  await runner.query(`DELETE FROM core."campaignExecution" WHERE id=$1`, [
    ids.execution,
  ]);
  // UUID-derived workspace schema identifier; all values remain bound parameters.
  // pi-lens-ignore: sql-injection, no-sql-in-code
  await runner.query(
    `DELETE FROM "${schemaName}"."campaignCreator" WHERE id=ANY($1::uuid[])`,
    [[ids.campaignCreatorA, ids.campaignCreatorB]],
  );
  // pi-lens-ignore: sql-injection, no-sql-in-code
  await runner.query(
    `DELETE FROM "${schemaName}".creator WHERE id=ANY($1::uuid[])`,
    [[ids.creatorA, ids.creatorB]],
  );
  // pi-lens-ignore: sql-injection, no-sql-in-code
  await runner.query(`DELETE FROM "${schemaName}".campaign WHERE id=$1`, [
    ids.campaign,
  ]);
};
