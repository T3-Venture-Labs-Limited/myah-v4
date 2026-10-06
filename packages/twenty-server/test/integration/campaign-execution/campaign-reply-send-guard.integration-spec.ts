import { randomUUID } from 'node:crypto';

import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { type GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { SEED_APPLE_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';
import { USER_WORKSPACE_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/core/utils/seed-user-workspaces.util';
import { type CampaignProgressionService } from 'src/modules/campaign-execution/services/campaign-progression.service';

import { getDomainService } from 'test/integration/myah-inbox/utils/seed-myah-inbox-task-7-fixture.util';

// MYAH-453: a creator who has written since step 1, on any channel, never gets
// the next step — even when the reply notification is late or missing.
const workspaceId = SEED_APPLE_WORKSPACE_ID;
const schema = 'workspace_1wgvd1injqtife6y4rvfbu3h5';
const campaignId = randomUUID();
const ids = {
  execution: randomUUID(),
  authorization: randomUUID(),
  activation: randomUUID(),
  workflowVersion: randomUUID(),
};
const fingerprint = 'b'.repeat(64);
const firstSentAt = new Date(Date.now() - 30 * 60 * 1000);
const before = new Date(firstSentAt.getTime() - 10 * 60 * 1000);
const after = new Date(firstSentAt.getTime() + 5 * 60 * 1000);

type Creator = {
  key: string;
  creatorId: string;
  email: string | null;
  membershipId: string;
  enrollmentId: string;
  sentStep: string;
  nextStep: string;
};
const newCreator = (key: string, email: string | null): Creator => ({
  key,
  creatorId: randomUUID(),
  email,
  membershipId: randomUUID(),
  enrollmentId: randomUUID(),
  sentStep: randomUUID(),
  nextStep: randomUUID(),
});
const creators = {
  instagramReply: newCreator('ig', 'ig.reply@example.test'),
  emailReply: newCreator('email', 'email.reply@example.test'),
  earlierMessageOnly: newCreator('early', 'early@example.test'),
  ownMailbox: newCreator('own', null),
};
const conversations: string[] = [];
const emailMessages: string[] = [];

const query = (sql: string, parameters: unknown[] = []) =>
  global.testDataSource.query(sql, parameters);

const instagramMessage = async (creator: Creator, at: Date) => {
  const conversationId = randomUUID();
  conversations.push(conversationId);
  await query(
    `INSERT INTO "${schema}"."myahSocialConversation" (id,"providerConversationId",provider,lifecycle,"recipientIgsid","creatorId")
     VALUES ($1,$2,'UNIPILE','ACTIVE',$3,$4)`,
    [
      conversationId,
      `chat-${conversationId}`,
      `igsid-${conversationId}`,
      creator.creatorId,
    ],
  );
  await query(
    `INSERT INTO "${schema}"."myahSocialMessage" (id,"conversationId",direction,text,"providerCreatedAt","providerMessageId")
     VALUES ($1,$2,'INBOUND','Hello nice to meet',$3,$4)`,
    [randomUUID(), conversationId, at, `msg-${conversationId}`],
  );
};

const emailFrom = async (handle: string, at: Date) => {
  const messageId = randomUUID();
  emailMessages.push(messageId);
  await query(
    `INSERT INTO "${schema}".message (id,"headerMessageId",subject,text,"receivedAt","isDraft")
     VALUES ($1,$2,'Re: collab','Sounds good',$3,false)`,
    [messageId, `<${messageId}@example.test>`, at],
  );
  await query(
    `INSERT INTO "${schema}"."messageParticipant" (id,"messageId",role,handle)
     VALUES ($1,$2,'FROM',$3)`,
    [randomUUID(), messageId, handle],
  );
};

// Step 1 was accepted at `firstSentAt`; step 2 is due now.
const enroll = async (creator: Creator) => {
  await query(
    `INSERT INTO core."campaignEnrollment"
      (id,"workspaceId","campaignId","campaignExecutionId","authorizationId","authorizationGeneration","campaignCreatorId","creatorId","authoredMessageCount","nextAuthoredMessageIndex",state,"enrolledAt")
     VALUES ($1,$2,$3,$4,$5,1,$6,$7,2,1,'ACTIVE',now())`,
    [
      creator.enrollmentId,
      workspaceId,
      campaignId,
      ids.execution,
      ids.authorization,
      creator.membershipId,
      creator.creatorId,
    ],
  );
  await query(
    `INSERT INTO core."campaignOccurrence"
      (id,"workspaceId","campaignId","enrollmentId","workflowVersionId","messageId","authoredMessageIndex",state,"dueAt","terminalAt","terminalReason")
     VALUES ($1,$2,$3,$4,$5,$6,0,'SUCCEEDED',$7,$7,'PROVIDER_ACCEPTED'),
            ($8,$2,$3,$4,$5,$9,1,'PENDING',now() - interval '1 minute',NULL,NULL)`,
    [
      creator.sentStep,
      workspaceId,
      campaignId,
      creator.enrollmentId,
      ids.workflowVersion,
      randomUUID(),
      firstSentAt,
      creator.nextStep,
      randomUUID(),
    ],
  );
};

const claim = (creator: Creator) => {
  const orm = getDomainService<GlobalWorkspaceOrmManager>(
    'GlobalWorkspaceOrmManager',
  );
  return orm.executeInWorkspaceContext(async () => {
    const dataSource = await orm.getGlobalWorkspaceDataSource();
    return dataSource.transaction((manager) =>
      getDomainService<CampaignProgressionService>(
        'CampaignProgressionService',
      ).claimAndReserveDueOccurrenceInTransaction(
        { workspaceId, campaignId, occurrenceId: creator.nextStep },
        manager as WorkspaceEntityManager,
      ),
    );
  }, buildSystemAuthContext(workspaceId));
};

const state = async (creator: Creator) => {
  const [row] = await query(
    `SELECT (SELECT state FROM core."campaignEnrollment" WHERE id=$1) AS enrollment,
            (SELECT state||':'||COALESCE("terminalReason",'') FROM core."campaignOccurrence" WHERE id=$2) AS "nextStep",
            (SELECT stage::text FROM "${schema}"."campaignCreator" WHERE id=$3) AS stage,
            (SELECT count(*)::int FROM "${schema}"."timelineActivity"
              WHERE "targetCreatorId"=$5 AND name='campaign.replied'
                AND properties->'campaignEvent'->>'campaignId'=$4::text) AS "repliedEvents"`,
    [
      creator.enrollmentId,
      creator.nextStep,
      creator.membershipId,
      campaignId,
      creator.creatorId,
    ],
  );
  return row;
};

let ownMailboxHandle: string | null = null;

beforeAll(async () => {
  const [mailbox] = await query(
    `SELECT handle FROM core."connectedAccount" WHERE "workspaceId"=$1 AND handle IS NOT NULL LIMIT 1`,
    [workspaceId],
  );
  ownMailboxHandle = mailbox?.handle ?? null;
  creators.ownMailbox.email = ownMailboxHandle;

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
      name: 'Reply send guard fixture',
      lifecycleStatus: 'ACTIVE',
    });
    await (
      await repository('creator')
    ).insert(
      Object.values(creators).map((creator) => ({
        id: creator.creatorId,
        name: `Guard ${creator.key}`,
        email: creator.email,
      })),
    );
    await (
      await repository('campaignCreator')
    ).insert(
      Object.values(creators).map((creator) => ({
        id: creator.membershipId,
        campaignId,
        creatorId: creator.creatorId,
        stage: 'CONTACTED',
      })),
    );
  }, buildSystemAuthContext(workspaceId));
  await query(
    `UPDATE "${schema}".campaign SET "sequenceAuthorization"=$2::jsonb WHERE id=$1`,
    [
      campaignId,
      JSON.stringify({
        state: 'ACTIVE',
        generation: 1,
        schemaVersion: 1,
        authorizationId: ids.authorization,
        workflowVersionId: ids.workflowVersion,
        preparedFingerprint: fingerprint,
      }),
    ],
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
      fingerprint,
      randomUUID(),
      ids.workflowVersion,
      USER_WORKSPACE_DATA_SEED_IDS.TIM,
    ],
  );
  await query(
    `INSERT INTO core."campaignActivation"
      (id,"workspaceId","campaignId","campaignExecutionId","authorizationId","authorizationGeneration","workflowVersionId","activatedAt","createdEnrollmentCount","createdOccurrenceCount")
     VALUES ($1,$2,$3,$4,$5,1,$6,now(),4,8)`,
    [
      ids.activation,
      workspaceId,
      campaignId,
      ids.execution,
      ids.authorization,
      ids.workflowVersion,
    ],
  );
  for (const creator of Object.values(creators)) await enroll(creator);

  await instagramMessage(creators.instagramReply, after);
  await emailFrom('Email.Reply@Example.test ', after);
  await instagramMessage(creators.earlierMessageOnly, before);
  await emailFrom('early@example.test', before);
  if (ownMailboxHandle !== null) await emailFrom(ownMailboxHandle, after);
});

afterAll(async () => {
  for (const statement of [
    `DELETE FROM core."campaignOccurrence" WHERE "campaignId"=$1`,
    `DELETE FROM core."campaignEnrollment" WHERE "campaignId"=$1`,
    `DELETE FROM core."campaignActivation" WHERE "campaignId"=$1`,
    `DELETE FROM core."campaignSequenceAuthorization" WHERE "campaignId"=$1`,
    `DELETE FROM core."campaignExecution" WHERE "campaignId"=$1`,
  ])
    await query(statement, [campaignId]).catch(() => undefined);
  await query(
    `DELETE FROM "${schema}"."timelineActivity" WHERE properties->'campaignEvent'->>'campaignId'=$1::text`,
    [campaignId],
  );
  await query(
    `DELETE FROM "${schema}"."messageParticipant" WHERE "messageId"=ANY($1::uuid[])`,
    [emailMessages],
  );
  await query(`DELETE FROM "${schema}".message WHERE id=ANY($1::uuid[])`, [
    emailMessages,
  ]);
  await query(
    `DELETE FROM "${schema}"."myahSocialMessage" WHERE "conversationId"=ANY($1::uuid[])`,
    [conversations],
  );
  await query(
    `DELETE FROM "${schema}"."myahSocialConversation" WHERE id=ANY($1::uuid[])`,
    [conversations],
  );
  await query(
    `DELETE FROM "${schema}"."campaignCreator" WHERE "campaignId"=$1`,
    [campaignId],
  );
  await query(`DELETE FROM "${schema}".creator WHERE id=ANY($1::uuid[])`, [
    Object.values(creators).map(({ creatorId }) => creatorId),
  ]);
  await query(`DELETE FROM "${schema}".campaign WHERE id=$1`, [campaignId]);
});

describe('Campaign send guard for creator replies (PostgreSQL)', () => {
  it('does not send the next step after an Instagram reply', async () => {
    expect(await claim(creators.instagramReply)).toEqual({
      status: 'CANCELLED',
      reason: 'ENROLLMENT_REPLIED',
    });
    expect(await state(creators.instagramReply)).toEqual({
      enrollment: 'REPLIED',
      nextStep: 'CANCELLED:ENROLLMENT_REPLIED',
      stage: 'NEGOTIATING',
      repliedEvents: 1,
    });
  });

  it('does not send the next step after an email from the creator', async () => {
    expect(await claim(creators.emailReply)).toEqual({
      status: 'CANCELLED',
      reason: 'ENROLLMENT_REPLIED',
    });
    expect(await state(creators.emailReply)).toMatchObject({
      enrollment: 'REPLIED',
      nextStep: 'CANCELLED:ENROLLMENT_REPLIED',
      stage: 'NEGOTIATING',
    });
  });

  it('ignores messages sent before the first step', async () => {
    const result = await claim(creators.earlierMessageOnly);

    expect(result).not.toEqual({
      status: 'CANCELLED',
      reason: 'ENROLLMENT_REPLIED',
    });
    expect((await state(creators.earlierMessageOnly)).enrollment).not.toBe(
      'REPLIED',
    );
  });

  it("ignores mail sent from the workspace's own mailbox", async () => {
    if (ownMailboxHandle === null) return;
    const result = await claim(creators.ownMailbox);

    expect(result).not.toEqual({
      status: 'CANCELLED',
      reason: 'ENROLLMENT_REPLIED',
    });
    expect((await state(creators.ownMailbox)).enrollment).not.toBe('REPLIED');
  });

  it('is idempotent once the enrollment has ended', async () => {
    expect(await claim(creators.instagramReply)).toEqual({
      status: 'TERMINAL',
    });
    expect((await state(creators.instagramReply)).repliedEvents).toBe(1);
  });
});
