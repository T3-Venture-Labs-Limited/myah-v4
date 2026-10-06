import { randomUUID } from 'node:crypto';

import { type GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { SEED_APPLE_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';
import { USER_WORKSPACE_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/core/utils/seed-user-workspaces.util';
import { type AgentActorContextService } from 'src/engine/metadata-modules/ai/ai-agent-execution/services/agent-actor-context.service';
import { type MyahReplyAgentReviewService } from 'src/modules/myah-reply-agent/services/myah-reply-agent-review.service';
import { type MyahReplyAgentService } from 'src/modules/myah-reply-agent/services/myah-reply-agent.service';
import { type CampaignInstagramReplyService } from 'src/modules/campaign-execution/services/campaign-instagram-reply.service';

import { ensureMyahInboxContactTriageTables } from 'test/integration/myah-inbox/utils/ensure-myah-inbox-contact-triage-tables.util';
import { getDomainService } from 'test/integration/myah-inbox/utils/seed-myah-inbox-task-7-fixture.util';

const workspaceId = SEED_APPLE_WORKSPACE_ID;
const schema = 'workspace_1wgvd1injqtife6y4rvfbu3h5';
const ids = {
  campaign: randomUUID(),
  creator: randomUUID(),
  twinA: randomUUID(),
  twinB: randomUUID(),
  membership: randomUUID(),
  execution: randomUUID(),
  authorization: randomUUID(),
  activation: randomUUID(),
  enrollment: randomUUID(),
  workflowVersion: randomUUID(),
  sentStep: randomUUID(),
  nextStep: randomUUID(),
  binding: randomUUID(),
  receipt: randomUUID(),
  profiles: [randomUUID(), randomUUID(), randomUUID()],
};
const chat = `chat-${ids.campaign}`;
const conversations: string[] = [];
const sentAt = new Date(Date.now() - 60 * 60 * 1000);

let service: CampaignInstagramReplyService;
const query = (sql: string, parameters: unknown[] = []) =>
  global.testDataSource.query(sql, parameters);

const conversation = async (input: {
  username: string;
  providerChatId: string;
  messageAt: Date;
}) => {
  const conversationId = randomUUID();
  const messageId = randomUUID();
  conversations.push(conversationId);
  await query(
    `INSERT INTO "${schema}"."myahSocialConversation" (id,"recipientUsername","providerConversationId",provider,lifecycle,"recipientIgsid")
     VALUES ($1,$2,$3,'UNIPILE','ACTIVE',$4)`,
    [
      conversationId,
      input.username,
      input.providerChatId,
      `igsid-${conversationId}`,
    ],
  );
  await query(
    `INSERT INTO "${schema}"."myahSocialMessage" (id,"conversationId",direction,text,"providerCreatedAt","providerMessageId")
     VALUES ($1,$2,'INBOUND','Sounds fun!',$3,$4)`,
    [messageId, conversationId, input.messageAt, `msg-${messageId}`],
  );
  return { conversationId, messageId };
};

const handle = (input: { conversationId: string; messageId: string }) =>
  service.handleInboundMessage({
    workspaceId,
    conversationRecordId: input.conversationId,
    messageRecordId: input.messageId,
  });

const state = async (conversationId: string) => {
  const [row] = await query(
    `SELECT c."creatorId",
            (SELECT state FROM core."campaignEnrollment" WHERE id=$2) AS enrollment,
            (SELECT state||':'||COALESCE("terminalReason",'') FROM core."campaignOccurrence" WHERE id=$3) AS "nextStep",
            (SELECT stage::text FROM "${schema}"."campaignCreator" WHERE id=$4) AS stage
       FROM "${schema}"."myahSocialConversation" c WHERE c.id=$1`,
    [conversationId, ids.enrollment, ids.nextStep, ids.membership],
  );
  return row;
};

beforeAll(async () => {
  service = getDomainService<CampaignInstagramReplyService>(
    'CampaignInstagramReplyService',
  );
  await ensureMyahInboxContactTriageTables(workspaceId);
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
      id: ids.campaign,
      name: 'Instagram reply fixture',
    });
    await (
      await repository('creator')
    ).insert([
      { id: ids.creator, name: 'Ava Reply', email: 'ava.reply@example.com' },
      { id: ids.twinA, name: 'Twin A' },
      { id: ids.twinB, name: 'Twin B' },
    ]);
    await (
      await repository('campaignCreator')
    ).insert({
      id: ids.membership,
      name: 'Ava membership',
      campaignId: ids.campaign,
      creatorId: ids.creator,
      stage: 'CONTACTED',
    });
  }, buildSystemAuthContext(workspaceId));
  await query(
    `INSERT INTO "${schema}"."socialProfile" (id,"creatorId",platform,handle) VALUES
       ($1,$4,'INSTAGRAM','@Ava.Reply'),($2,$5,'INSTAGRAM','twin.handle'),($3,$6,'INSTAGRAM','twin.handle')`,
    [...ids.profiles, ids.creator, ids.twinA, ids.twinB],
  );
  await query(
    `INSERT INTO core."campaignExecution"
      (id,"workspaceId","campaignId","timeZone","startLocalTime","endLocalTime","campaignCapacityTimeZone")
     VALUES ($1,$2,$3,'UTC','00:00','23:59','UTC')`,
    [ids.execution, workspaceId, ids.campaign],
  );
  await query(
    `INSERT INTO core."campaignSequenceAuthorization"
      ("authorizationId","workspaceId","campaignId","campaignExecutionId",generation,"startIdempotencyKey","preparedFingerprint","workflowId","workflowVersionId","initiatingUserWorkspaceId",state,"authorizedAt",binding)
     VALUES ($1,$2,$3,$4,1,$5,$6,$7,$8,$9,'ACTIVE',now(),'{}'::jsonb)`,
    [
      ids.authorization,
      workspaceId,
      ids.campaign,
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
     VALUES ($1,$2,$3,$4,$5,1,$6,now(),1,2)`,
    [
      ids.activation,
      workspaceId,
      ids.campaign,
      ids.execution,
      ids.authorization,
      ids.workflowVersion,
    ],
  );
  await query(
    `INSERT INTO core."campaignEnrollment"
      (id,"workspaceId","campaignId","campaignExecutionId","authorizationId","authorizationGeneration","campaignCreatorId","creatorId","authoredMessageCount","nextAuthoredMessageIndex",state,"enrolledAt")
     VALUES ($1,$2,$3,$4,$5,1,$6,$7,2,1,'ACTIVE',now())`,
    [
      ids.enrollment,
      workspaceId,
      ids.campaign,
      ids.execution,
      ids.authorization,
      ids.membership,
      ids.creator,
    ],
  );
  await query(
    `INSERT INTO core."actionApprovalBinding" ("workspaceId",id,"initiatorUserWorkspaceId","threadId","actionName","draftId","contentDigest",state,"expiresAt","actionVersion")
     VALUES ($1,$2,$3,$4,'reply_fixture',$5,'x','CONSUMED',now()+interval '1 day',1)`,
    [
      workspaceId,
      ids.binding,
      USER_WORKSPACE_DATA_SEED_IDS.TIM,
      randomUUID(),
      randomUUID(),
    ],
  );
  await query(
    `INSERT INTO core."actionExecutionReceipt" (id,"actionApprovalBindingId",state,"workspaceId","idempotencyKey","providerThreadExternalId","updatedAt")
     VALUES ($1,$2,'PROVIDER_ACCEPTED',$3,$4,$5,$6)`,
    [
      ids.receipt,
      ids.binding,
      workspaceId,
      `reply-${ids.receipt}`,
      chat,
      sentAt,
    ],
  );
  await query(
    `INSERT INTO core."campaignOccurrence"
      (id,"workspaceId","campaignId","enrollmentId","workflowVersionId","messageId","authoredMessageIndex",state,"dueAt","terminalReason","terminalAt","actionExecutionReceiptId")
     VALUES ($1,$3,$4,$5,$6,$7,0,'SUCCEEDED',$9,'PROVIDER_ACCEPTED',$9,$10),
            ($2,$3,$4,$5,$6,$8,1,'PENDING',now()+interval '1 day',NULL,NULL,NULL)`,
    [
      ids.sentStep,
      ids.nextStep,
      workspaceId,
      ids.campaign,
      ids.enrollment,
      ids.workflowVersion,
      randomUUID(),
      randomUUID(),
      sentAt,
      ids.receipt,
    ],
  );
});

afterAll(async () => {
  jest.restoreAllMocks();
  await query(
    `DELETE FROM core."myahAgentRun" WHERE "workspaceId"=$1 AND "creatorId"=$2`,
    [workspaceId, ids.creator],
  );
  await query(
    `DELETE FROM "${schema}"."myahInstagramReplyDraft" WHERE "conversationId"=ANY($1::uuid[])`,
    [conversations],
  );
  await query(
    `DELETE FROM "${schema}"."myahSocialMessage" WHERE "conversationId"=ANY($1::uuid[])`,
    [conversations],
  );
  await query(
    `DELETE FROM "${schema}"."myahSocialConversation" WHERE id=ANY($1::uuid[])`,
    [conversations],
  );
  for (const table of [
    'campaignOccurrence',
    'campaignEnrollment',
    'campaignActivation',
    'campaignSequenceAuthorization',
    'campaignExecution',
  ])
    await query(`DELETE FROM core."${table}" WHERE "campaignId"=$1`, [
      ids.campaign,
    ]);
  await query(`DELETE FROM core."actionExecutionReceipt" WHERE id=$1`, [
    ids.receipt,
  ]);
  await query(`DELETE FROM core."actionApprovalBinding" WHERE id=$1`, [
    ids.binding,
  ]);
  await query(
    `DELETE FROM "${schema}"."socialProfile" WHERE id=ANY($1::uuid[])`,
    [ids.profiles],
  );
  await query(`DELETE FROM "${schema}"."campaignCreator" WHERE id=$1`, [
    ids.membership,
  ]);
  await query(`DELETE FROM "${schema}".creator WHERE id=ANY($1::uuid[])`, [
    [ids.creator, ids.twinA, ids.twinB],
  ]);
  await query(`DELETE FROM "${schema}".campaign WHERE id=$1`, [ids.campaign]);
});

describe('Instagram replies to Campaign steps (PostgreSQL)', () => {
  it('ignores history from before the step and messages in an unrelated chat', async () => {
    const history = await conversation({
      username: 'someone.else',
      providerChatId: chat,
      messageAt: new Date(sentAt.getTime() - 60_000),
    });
    const unrelated = await conversation({
      username: 'someone.else',
      providerChatId: `other-${chat}`,
      messageAt: new Date(),
    });

    await handle(history);
    await handle(unrelated);

    expect(await state(history.conversationId)).toEqual({
      creatorId: null,
      enrollment: 'ACTIVE',
      nextStep: 'PENDING:',
      stage: 'CONTACTED',
    });
  });

  it('leaves a chat unlinked when two creators share the handle', async () => {
    const ambiguous = await conversation({
      username: 'twin.handle',
      providerChatId: `twin-${chat}`,
      messageAt: new Date(),
    });

    await handle(ambiguous);

    expect((await state(ambiguous.conversationId)).creatorId).toBeNull();
  });

  it('links the chat by handle, stops the sequence and moves the creator to Negotiating once', async () => {
    const actor = await getDomainService<AgentActorContextService>(
      'AgentActorContextService',
    ).buildUserAndAgentActorContext(
      USER_WORKSPACE_DATA_SEED_IDS.TIM,
      workspaceId,
    );
    const review = getDomainService<MyahReplyAgentReviewService>(
      'MyahReplyAgentReviewService',
    );
    const progress = async () =>
      (await review.review(ids.campaign, actor.authContext)).nodes.find(
        (node) => node.campaignCreatorId === ids.membership,
      )?.outreach;
    await expect(progress()).resolves.toMatchObject({
      state: 'CONTACTED',
      sentSteps: 1,
      totalSteps: 2,
      nextEligibleAt: expect.any(String),
    });
    const reply = await conversation({
      username: 'ava.reply',
      providerChatId: chat,
      messageAt: new Date(),
    });

    await handle(reply);
    await handle(reply);

    expect(await state(reply.conversationId)).toEqual({
      creatorId: ids.creator,
      enrollment: 'REPLIED',
      nextStep: 'CANCELLED:ENROLLMENT_REPLIED',
      stage: 'NEGOTIATING',
    });
    await expect(progress()).resolves.toMatchObject({
      state: 'REPLIED',
      sentSteps: 1,
      totalSteps: 2,
      nextEligibleAt: null,
    });
  });

  it('turns the reply into an agent draft that Influencers and Inbox label for review', async () => {
    const replyConversation = conversations[conversations.length - 1];
    const agent = getDomainService<MyahReplyAgentService>(
      'MyahReplyAgentService',
    );
    jest.spyOn(agent, 'generate').mockResolvedValue({
      decision: 'REPLY',
      body: 'So glad! Want me to send the brief?',
      reason: '',
      invitationIncluded: false,
    });

    await agent.run({
      workspaceId,
      channel: 'INSTAGRAM',
      conversationRecordId: replyConversation,
    });

    const [draft] = await query(
      `SELECT body FROM "${schema}"."myahInstagramReplyDraft"
        WHERE "conversationId"=$1 AND "deletedAt" IS NULL AND "sentAt" IS NULL`,
      [replyConversation],
    );
    expect(draft?.body).toBe('So glad! Want me to send the brief?');

    const actor = await getDomainService<AgentActorContextService>(
      'AgentActorContextService',
    ).buildUserAndAgentActorContext(
      USER_WORKSPACE_DATA_SEED_IDS.TIM,
      workspaceId,
    );
    const review = getDomainService<MyahReplyAgentReviewService>(
      'MyahReplyAgentReviewService',
    );
    const influencers = await review.review(ids.campaign, actor.authContext);
    expect(
      influencers.nodes.find((node) => node.creatorId === ids.creator),
    ).toMatchObject({
      nextAction: 'REVIEW_DRAFT',
      channel: 'INSTAGRAM',
      conversationRecordId: replyConversation,
    });
    expect(
      await review.draftLabel(
        { channel: 'INSTAGRAM', conversationRecordId: replyConversation },
        actor.authContext,
      ),
    ).toMatchObject({
      kind: 'DRAFTED',
      campaignName: 'Instagram reply fixture',
    });
  });
});
