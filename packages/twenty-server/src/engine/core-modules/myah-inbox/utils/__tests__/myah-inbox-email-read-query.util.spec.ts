import { Test } from '@nestjs/testing';
import {
  GraphQLSchemaBuilderModule,
  GraphQLSchemaFactory,
} from '@nestjs/graphql';
import { buildSchema, graphql, printSchema } from 'graphql';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import {
  PermissionsException,
  PermissionsExceptionCode,
} from 'src/engine/metadata-modules/permissions/permissions.exception';
import { MyahInboxContactEmailQueryService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-email-query.service';
import { MyahInboxContactResolver } from 'src/engine/core-modules/myah-inbox/resolvers/myah-inbox-contact.resolver';
import { MessageVisibilityPolicyService } from 'src/modules/messaging/common/query-hooks/message/message-visibility-policy.service';
import { encodeMyahInboxContactId } from 'src/engine/core-modules/myah-inbox/utils/myah-inbox-contact-id.util';
import { decodeMyahInboxEmailCardCursor } from 'src/engine/core-modules/myah-inbox/utils/myah-inbox-email-card-cursor.util';
import { FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED } from 'twenty-shared/constants';

jest.mock(
  'src/engine/twenty-orm/storage/orm-workspace-context.storage',
  () => ({
    getWorkspaceContext: () => ({
      userWorkspaceRoleMap: new Map(),
      apiKeyRoleMap: new Map(),
    }),
  }),
);
jest.mock(
  'src/engine/twenty-orm/utils/resolve-role-permission-config.util',
  () => ({
    resolveRolePermissionConfig: () => ({ unionOf: ['fixture-role'] }),
  }),
);

// Dedicated, opt-in local fixture connection only; never consult application env.
const connectionString = process.env.MYAH_INBOX_TEST_POSTGRES_URL;
const describePostgres = connectionString ? describe : describe.skip;

describePostgres('myah-inbox-email-read-query (rolled-back PostgreSQL)', () => {
  let client: Client;
  beforeAll(async () => {
    jest.useRealTimers();
    const endpoint = new URL(connectionString!);
    if (
      endpoint.hostname !== '127.0.0.1' ||
      !(
        (endpoint.port === '15432' && endpoint.pathname === '/default') ||
        (endpoint.port === '32768' && endpoint.pathname === '/myah415_test')
      ) ||
      endpoint.search ||
      endpoint.hash ||
      !['postgres:', 'postgresql:'].includes(endpoint.protocol)
    ) {
      throw new Error('Inbox test database endpoint is not allowlisted');
    }
    client = new Client({
      connectionString,
      connectionTimeoutMillis: 3000,
      statement_timeout: 5000,
    });
    await client.connect();
    await client.query('BEGIN');
    await client.query(`CREATE TEMP TABLE inbox_email_fixture (
      id uuid, "messageThreadId" uuid, "receivedAt" timestamptz, "createdAt" timestamptz,
      subject text, text text, visibility text, direction text
    ) ON COMMIT DROP`);
    await client.query(`INSERT INTO inbox_email_fixture
      SELECT ('00000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,
        ('00000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,
        '2026-09-01T00:00:00Z'::timestamptz + i * interval '1 microsecond',
        '2026-08-01T00:00:00Z', 'same subject', 'body', 'FULL', 'INCOMING'
      FROM generate_series(1,5) i`);
    await client.query(`INSERT INTO inbox_email_fixture
      SELECT ('00000000-0000-4000-8000-' || lpad((i+100)::text,12,'0'))::uuid,
        '00000000-0000-4000-8000-000000000005',
        '2026-09-02T00:00:00Z'::timestamptz + i * interval '1 microsecond',
        '2026-08-01T00:00:00Z', 'reply', 'reply body', 'FULL', 'INCOMING'
      FROM generate_series(1,200) i`);
    await client.query(`ALTER TABLE inbox_email_fixture ADD "deletedAt" timestamptz, ADD "isDraft" boolean DEFAULT FALSE, ADD readable boolean DEFAULT TRUE, ADD "headerMessageId" text;
      CREATE TEMP TABLE inbox_thread_fixture ON COMMIT DROP AS SELECT DISTINCT "messageThreadId" AS id, '00000000-0000-4000-8000-000000000050'::uuid AS "creatorId", NULL::uuid AS "myahCampaignId", NULL::timestamptz AS "deletedAt", TRUE AS readable FROM inbox_email_fixture;
      CREATE TEMP TABLE inbox_context_fixture (id uuid, name text, "deletedAt" timestamptz, readable boolean DEFAULT TRUE) ON COMMIT DROP;
      INSERT INTO inbox_context_fixture (id, name) VALUES ('00000000-0000-4000-8000-000000000050','Contact'), ('00000000-0000-4000-8000-000000000051','Member');
      CREATE TEMP TABLE inbox_participant_fixture (id uuid, "messageId" uuid, role text, handle text, "displayName" text, "deletedAt" timestamptz, readable boolean DEFAULT TRUE) ON COMMIT DROP;
      CREATE TEMP TABLE inbox_channel_fixture (id uuid, "workspaceId" uuid, "connectedAccountId" uuid, type text, visibility text) ON COMMIT DROP;
      INSERT INTO inbox_channel_fixture VALUES ('00000000-0000-4000-8000-000000000052', '00000000-0000-4000-8000-000000000053', NULL, 'EMAIL', 'SHARE_EVERYTHING');
      INSERT INTO inbox_context_fixture (id, name) VALUES ('00000000-0000-4000-8000-000000000056','Readable campaign');
      UPDATE inbox_thread_fixture SET "myahCampaignId" = '00000000-0000-4000-8000-000000000056';
      INSERT INTO inbox_participant_fixture (id, "messageId", role, handle) SELECT id, id, 'FROM', 'creator@example.test' FROM inbox_email_fixture;
      CREATE TEMP TABLE inbox_reply_evidence_fixture (
        "workspaceId" uuid, "inboundMessageId" uuid, "messageChannelId" uuid,
        classification text, "matchedAttemptId" uuid, "campaignId" uuid, "enrollmentId" uuid
      ) ON COMMIT DROP;
      CREATE TEMP TABLE inbox_attempt_fixture (
        "attemptId" uuid, "workspaceId" uuid, "messageChannelId" uuid,
        "projectedMessageId" uuid, "attemptState" text,
        "campaignId" uuid, "enrollmentId" uuid,
        "providerAcceptedAt" timestamptz DEFAULT '2026-09-01T00:00:00Z',
        source text NOT NULL DEFAULT 'CAMPAIGN_SEQUENCE'
      ) ON COMMIT DROP;
      CREATE TEMP TABLE inbox_account_fixture (id uuid, "workspaceId" uuid, "userWorkspaceId" uuid) ON COMMIT DROP;
      CREATE TEMP TABLE inbox_association_fixture ON COMMIT DROP AS SELECT id, id AS "messageId", '00000000-0000-4000-8000-000000000052'::uuid AS "messageChannelId", direction, NULL::timestamptz AS "deletedAt", NULL::text AS "messageExternalId" FROM inbox_email_fixture;
      CREATE TEMP TABLE inbox_binding_fixture (id uuid, "workspaceId" uuid, "actionName" text) ON COMMIT DROP;
      CREATE TEMP TABLE inbox_receipt_fixture ("workspaceId" uuid, "actionApprovalBindingId" uuid, state text, "providerMessageId" text, "providerExternalMessageId" text) ON COMMIT DROP;
      CREATE TEMP TABLE inbox_binding_link_fixture ("actionApprovalBindingId" uuid, role text, "recordId" uuid) ON COMMIT DROP;
    `);
  }, 15000);
  beforeEach(async () => {
    await client.query('SAVEPOINT example');
  });
  afterEach(async () => {
    await client.query('ROLLBACK TO SAVEPOINT example');
  });
  afterAll(async () => {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } finally {
        await client.end();
      }
    }
  });

  const serviceFixture = (
    denied = new Set<string>(),
    replyEvidenceReady = false,
    responseFocusEnabled = true,
  ) => {
    const workspaceId = '00000000-0000-4000-8000-000000000053';
    const workspaceMemberId = '00000000-0000-4000-8000-000000000051';
    const workspace = { id: workspaceId };
    const user = { id: '00000000-0000-4000-8000-000000000054' };
    const authContext = {
      type: 'user',
      workspace,
      user,
      workspaceMemberId,
      userWorkspaceId: '00000000-0000-4000-8000-000000000055',
    };
    const request = {
      workspace,
      user,
      authContext,
      workspaceMemberId,
      expectedWorkspaceId: workspaceId,
      contactId: encodeMyahInboxContactId({
        workspaceId,
        identity: {
          kind: 'creator',
          recordId: '00000000-0000-4000-8000-000000000050',
        },
      }),
    };
    const tables: Record<string, string> = {
      message: 'inbox_email_fixture',
      messageThread: 'inbox_thread_fixture',
      messageParticipant: 'inbox_participant_fixture',
      creator: 'inbox_context_fixture',
      workspaceMember: 'inbox_context_fixture',
      campaign: 'inbox_context_fixture',
    };
    // TypeORM serializes real parameterized SQL without initializing a second connection.
    // The fixture's permission seam emulates denied selections and readable-row predicates;
    // production uses WorkspaceSelectQueryBuilder's native validator/RLS implementation.
    const serializer = new DataSource({ type: 'postgres' });
    let statements = 0;
    const manager = {
      executeInWorkspaceContext: async (run: () => Promise<unknown>) => run(),
      getRepository: async (_workspaceId: string, object: string) => ({
        createQueryBuilder: (alias: string) => {
          const builder = serializer
            .createQueryBuilder()
            .from(`pg_temp.${tables[object]}`, alias);
          return Object.assign(builder, {
            validatePermissionsBeforeSerialization: () => {
              for (const field of builder.expressionMap.selects) {
                const property = field.selection
                  .replace(/"/g, '')
                  .split('.')
                  .pop();
                if (denied.has(`${object}.${property}`))
                  throw new PermissionsException(
                    'Fixture selection denied',
                    PermissionsExceptionCode.PERMISSION_DENIED,
                  );
              }
              builder.andWhere(`${alias}.readable = TRUE`);
            },
          });
        },
      }),
      getGlobalWorkspaceDataSource: async () => ({
        query: async (sql: string, parameters: unknown[]) => {
          statements++;
          if (sql.startsWith('SELECT to_regclass'))
            return [{ exists: replyEvidenceReady }];
          const fixtureSql = sql
            .replace(
              /"workspace_[^"]+"\."messageChannelMessageAssociation"/g,
              'pg_temp.inbox_association_fixture',
            )
            .replace(
              /"workspace_[^"]+"\."message"/g,
              'pg_temp.inbox_email_fixture',
            )
            .replace(/core\."messageChannel"/g, 'pg_temp.inbox_channel_fixture')
            .replace(
              /core\."connectedAccount"/g,
              'pg_temp.inbox_account_fixture',
            )
            .replace(
              /core\."myahCampaignReplyEvidence"/g,
              'pg_temp.inbox_reply_evidence_fixture',
            )
            // This fixture's linked Creator is fixed; the real GraphQL suite
            // covers evidence-Creator mismatch against the full core table.
            .replace(
              /ev\."creatorId"/g,
              "'00000000-0000-4000-8000-000000000050'::uuid",
            )
            .replace(
              /core\."outboundEmailAttempt"/g,
              'pg_temp.inbox_attempt_fixture',
            )
            .replace(
              /core\."actionExecutionReceipt"/g,
              'pg_temp.inbox_receipt_fixture',
            )
            .replace(
              /core\."actionApprovalBindingEvidenceLink"/g,
              'pg_temp.inbox_binding_link_fixture',
            )
            .replace(
              /core\."actionApprovalBinding"/g,
              'pg_temp.inbox_binding_fixture',
            );
          return (await client.query(fixtureSql, parameters)).rows;
        },
      }),
    };
    return {
      request,
      statements: () => statements,
      service: new MyahInboxContactEmailQueryService(
        manager as never,
        new MessageVisibilityPolicyService(
          {} as never,
          {} as never,
          {} as never,
        ),
        { get: () => responseFocusEnabled } as never,
      ),
    };
  };

  it('keeps pre-upgrade legacy Creator cards but excludes unrelated legacy threads after evidence provisioning', async () => {
    const legacy = serviceFixture();
    expect(
      (await legacy.service.listCards(legacy.request as never)).cards,
    ).toHaveLength(3);
    const provisioned = serviceFixture(new Set(), true);
    expect(
      (await provisioned.service.listCards(provisioned.request as never)).cards,
    ).toEqual([]);
    const threadId = '00000000-0000-4000-8000-000000000004';
    const explicitContactId = encodeMyahInboxContactId({
      workspaceId: provisioned.request.workspace.id,
      identity: { kind: 'email-thread', recordId: threadId },
    });
    const explicit = await provisioned.service.readCard({
      ...provisioned.request,
      contactId: explicitContactId,
      threadId,
    } as never);
    expect(explicit.card?.anchorKey).toBe(`legacy:${threadId}`);
  });

  it('withholds a response card when its Campaign is not readable', async () => {
    const visible = serviceFixture(new Set(), true);
    await client.query(
      `INSERT INTO inbox_reply_evidence_fixture VALUES ($1,$2,$3,'THREAD',NULL,$4,$5)`,
      [
        visible.request.workspace.id,
        '00000000-0000-4000-8000-000000000101',
        '00000000-0000-4000-8000-000000000052',
        '00000000-0000-4000-8000-000000000056',
        '00000000-0000-4000-8000-000000000057',
      ],
    );
    expect(
      (await visible.service.listCards(visible.request as never)).cards,
    ).toHaveLength(1);
    const denied = serviceFixture(new Set(['campaign.id']), true);
    expect(
      (await denied.service.listCards(denied.request as never)).cards,
    ).toEqual([]);
    await client.query(
      `UPDATE inbox_context_fixture SET readable=FALSE WHERE id='00000000-0000-4000-8000-000000000056'`,
    );
    expect(
      (await visible.service.listCards(visible.request as never)).cards,
    ).toEqual([]);
  });

  it('returns two stable accepted-send groups for two answered sends in one thread', async () => {
    const fixture = serviceFixture(new Set(), true);
    const workspaceId = fixture.request.workspace.id;
    const threadId = '00000000-0000-4000-8000-000000000005';
    const channelId = '00000000-0000-4000-8000-000000000052';
    const attemptA = '00000000-0000-4000-8000-000000000401';
    const attemptB = '00000000-0000-4000-8000-000000000402';
    await client.query(
      `UPDATE inbox_email_fixture SET direction='OUTGOING' WHERE id=$1`,
      [threadId],
    );
    await client.query(
      `UPDATE inbox_association_fixture SET direction='OUTGOING' WHERE "messageId"=$1`,
      [threadId],
    );
    await client.query(
      `INSERT INTO inbox_attempt_fixture ("attemptId","workspaceId","messageChannelId","projectedMessageId","attemptState") VALUES ($1,$2,$3,$4,'ACCEPTED'),($5,$2,$3,NULL,'ACCEPTED')`,
      [attemptA, workspaceId, channelId, threadId, attemptB],
    );
    await client.query(
      `INSERT INTO inbox_reply_evidence_fixture VALUES
         ($1,$2,$3,'EXACT',$4,'00000000-0000-4000-8000-000000000056','00000000-0000-4000-8000-000000000057'),
         ($1,$5,$3,'EXACT',$4,'00000000-0000-4000-8000-000000000056','00000000-0000-4000-8000-000000000057'),
         ($1,$6,$3,'EXACT',$7,'00000000-0000-4000-8000-000000000056','00000000-0000-4000-8000-000000000057')`,
      [
        workspaceId,
        '00000000-0000-4000-8000-000000000101',
        channelId,
        attemptA,
        '00000000-0000-4000-8000-000000000102',
        '00000000-0000-4000-8000-000000000103',
        attemptB,
      ],
    );
    const answeredSecondId = '00000000-0000-4000-8000-000000000407';
    await client.query(
      `INSERT INTO inbox_email_fixture (id,"messageThreadId","receivedAt","createdAt",subject,text,visibility,direction)
       VALUES ($1,$2,'2026-09-01T00:00:00.000005Z','2026-08-01T00:00:00Z','second send','body','FULL','OUTGOING')`,
      [answeredSecondId, threadId],
    );
    await client.query(
      `INSERT INTO inbox_association_fixture (id,"messageId","messageChannelId",direction,"deletedAt") VALUES ($1,$1,$2,'OUTGOING',NULL)`,
      [answeredSecondId, channelId],
    );
    await client.query(
      `UPDATE inbox_attempt_fixture SET "projectedMessageId"=$1 WHERE "attemptId"=$2`,
      [answeredSecondId, attemptB],
    );
    const unansweredId = '00000000-0000-4000-8000-000000000406';
    const unrelatedId = '00000000-0000-4000-8000-000000000408';
    const lateReplyId = '00000000-0000-4000-8000-000000000504';
    await client.query(
      `INSERT INTO inbox_email_fixture (id,"messageThreadId","receivedAt","createdAt",subject,text,visibility,direction)
       VALUES ($1,$2,'2026-09-03T00:00:00Z','2026-08-01T00:00:00Z','send five','body','FULL','OUTGOING'),
         ($3,$2,'2026-09-04T00:00:00Z','2026-08-01T00:00:00Z','late send three reply','body','FULL','INCOMING')`,
      [unansweredId, threadId, lateReplyId],
    );
    await client.query(
      `INSERT INTO inbox_association_fixture (id,"messageId","messageChannelId",direction,"deletedAt") VALUES ($1,$1,$2,'OUTGOING',NULL),($3,$3,$2,'INCOMING',NULL)`,
      [unansweredId, channelId, lateReplyId],
    );
    await client.query(
      `INSERT INTO inbox_email_fixture (id,"messageThreadId","receivedAt","createdAt",subject,text,visibility,direction)
       VALUES ($1,$2,'2026-09-03T12:00:00Z','2026-08-01T00:00:00Z','unrelated send','body','FULL','OUTGOING')`,
      [unrelatedId, threadId],
    );
    await client.query(
      `INSERT INTO inbox_association_fixture (id,"messageId","messageChannelId",direction,"deletedAt") VALUES ($1,$1,$2,'OUTGOING',NULL)`,
      [unrelatedId, channelId],
    );
    await client.query(
      `INSERT INTO inbox_attempt_fixture ("attemptId","workspaceId","messageChannelId","projectedMessageId","attemptState") VALUES ($1,$2,$3,$4,'ACCEPTED')`,
      [
        '00000000-0000-4000-8000-000000000403',
        workspaceId,
        channelId,
        unansweredId,
      ],
    );
    await client.query(
      `INSERT INTO inbox_reply_evidence_fixture VALUES ($1,$2,$3,'EXACT',$4,'00000000-0000-4000-8000-000000000056','00000000-0000-4000-8000-000000000057')`,
      [workspaceId, lateReplyId, channelId, attemptA],
    );
    const operatorReplyId = '00000000-0000-4000-8000-000000000409';
    const bindingId = '00000000-0000-4000-8000-000000000601';
    await client.query(
      `INSERT INTO inbox_email_fixture (id,"messageThreadId","receivedAt","createdAt",subject,text,visibility,direction,"headerMessageId")
       VALUES ($1,$2,'2026-09-03T13:00:00Z','2026-08-01T00:00:00Z','Inbox reply','body','FULL','OUTGOING','<inbox-reply@example.com>')`,
      [operatorReplyId, threadId],
    );
    await client.query(
      `INSERT INTO inbox_association_fixture (id,"messageId","messageChannelId",direction,"messageExternalId")
       VALUES ($1,$1,$2,'OUTGOING','inbox-reply-external')`,
      [operatorReplyId, channelId],
    );
    await client.query(
      `INSERT INTO inbox_binding_fixture VALUES ($1,$2,'send_inbox_reply')`,
      [bindingId, workspaceId],
    );
    await client.query(
      `INSERT INTO inbox_binding_link_fixture VALUES ($1,'thread_parent',$2),($1,'delivery_target',$3)`,
      [bindingId, '00000000-0000-4000-8000-000000000101', threadId],
    );
    await client.query(
      `INSERT INTO inbox_receipt_fixture VALUES ($1,$2,'SENT','<inbox-reply@example.com>','inbox-reply-external')`,
      [workspaceId, bindingId],
    );
    const legacyOperatorReplyId = '00000000-0000-4000-8000-000000000410';
    const legacyBindingId = '00000000-0000-4000-8000-000000000602';
    await client.query(
      `INSERT INTO inbox_email_fixture (id,"messageThreadId","receivedAt","createdAt",subject,text,visibility,direction,"headerMessageId")
       VALUES ($1,$2,'2026-09-03T13:01:00Z','2026-08-01T00:00:00Z','Legacy Inbox reply','body','FULL','OUTGOING','<inbox-reply-v1@example.com>')`,
      [legacyOperatorReplyId, threadId],
    );
    await client.query(
      `INSERT INTO inbox_association_fixture (id,"messageId","messageChannelId",direction,"messageExternalId")
       VALUES ($1,$1,$2,'OUTGOING','inbox-reply-v1-external')`,
      [legacyOperatorReplyId, channelId],
    );
    await client.query(
      `INSERT INTO inbox_binding_fixture VALUES ($1,$2,'send_inbox_reply')`,
      [legacyBindingId, workspaceId],
    );
    await client.query(
      `INSERT INTO inbox_binding_link_fixture VALUES ($1,'thread_parent',$2),($1,'draft',$3)`,
      [legacyBindingId, '00000000-0000-4000-8000-000000000101', threadId],
    );
    await client.query(
      `INSERT INTO inbox_receipt_fixture VALUES ($1,$2,'SENT','<inbox-reply-v1@example.com>','inbox-reply-v1-external')`,
      [workspaceId, legacyBindingId],
    );
    const followUpId = '00000000-0000-4000-8000-000000000411';
    const followUpBindingId = '00000000-0000-4000-8000-000000000603';
    await client.query(
      `INSERT INTO inbox_email_fixture (id,"messageThreadId","receivedAt","createdAt",subject,text,visibility,direction,"headerMessageId")
       VALUES ($1,$2,'2026-09-03T13:02:00Z','2026-08-01T00:00:00Z','Inbox follow-up','body','FULL','OUTGOING','<inbox-follow-up@example.com>')`,
      [followUpId, threadId],
    );
    await client.query(
      `INSERT INTO inbox_association_fixture (id,"messageId","messageChannelId",direction,"messageExternalId")
       VALUES ($1,$1,$2,'OUTGOING','inbox-follow-up-external')`,
      [followUpId, channelId],
    );
    await client.query(
      `INSERT INTO inbox_binding_fixture VALUES ($1,$2,'send_inbox_reply')`,
      [followUpBindingId, workspaceId],
    );
    await client.query(
      `INSERT INTO inbox_binding_link_fixture VALUES ($1,'thread_parent',$2),($1,'delivery_target',$3)`,
      [followUpBindingId, operatorReplyId, threadId],
    );
    await client.query(
      `INSERT INTO inbox_receipt_fixture VALUES ($1,$2,'SENT','<inbox-follow-up@example.com>','inbox-follow-up-external')`,
      [workspaceId, followUpBindingId],
    );
    const head = await fixture.service.listCards(fixture.request as never);
    const answeredCards = head.cards.filter(
      (card) => card.threadId === threadId,
    );
    expect(answeredCards.map((card) => card.anchorKey).sort()).toEqual([
      `attempt:${attemptA}`,
      `attempt:${attemptB}`,
    ]);
    expect(answeredCards[0].startTimestamp).toBe(
      answeredCards[1].startTimestamp,
    );
    const firstCard = await fixture.service.readCard({
      ...fixture.request,
      threadId,
      anchorKey: `attempt:${attemptA}`,
    } as never);
    expect(firstCard.card?.anchorKey).toBe(`attempt:${attemptA}`);
    const firstPage = await fixture.service.listCardMessages({
      ...fixture.request,
      threadId,
      anchorKey: `attempt:${attemptA}`,
      snapshot: head.snapshot,
    } as never);
    expect(firstPage.anchorKey).toBe(`attempt:${attemptA}`);
    expect(firstPage.messages.map((message) => message.id)).toContain(
      operatorReplyId,
    );
    expect(firstPage.messages.map((message) => message.id)).toContain(
      legacyOperatorReplyId,
    );
    expect(firstPage.messages.map((message) => message.id)).toContain(
      followUpId,
    );
    expect(firstPage.messages.map((message) => message.id)).not.toContain(
      '00000000-0000-4000-8000-000000000103',
    );
    expect(firstPage.messages.map((message) => message.id)).not.toContain(
      unrelatedId,
    );
    const oldClient = await fixture.service.readCard({
      ...fixture.request,
      threadId,
    } as never);
    expect(oldClient.card).toMatchObject({
      anchorKey: `legacy:${threadId}`,
      rootMessageId: threadId,
    });
    const oldPage = await fixture.service.listCardMessages({
      ...fixture.request,
      threadId,
      snapshot: oldClient.snapshot,
    } as never);
    expect(oldPage).toMatchObject({
      anchorKey: `legacy:${threadId}`,
      root: { id: threadId },
    });
    expect(oldPage.messages.map((message) => message.id)).toContain(
      unansweredId,
    );
    expect(oldPage.messages.map((message) => message.id)).toContain(
      unrelatedId,
    );
    await expect(
      fixture.service.readCard({
        ...fixture.request,
        threadId,
        anchorKey: 'attempt:00000000-0000-4000-8000-000000000499',
      } as never),
    ).rejects.toThrow('Inbox card is not readable');
    await expect(
      fixture.service.readCard({
        ...fixture.request,
        threadId,
        anchorKey: 'thread:00000000-0000-4000-8000-000000000003',
      } as never),
    ).rejects.toThrow('Invalid Inbox card key');
    const firstReply = await fixture.service.locateMessage({
      ...fixture.request,
      snapshot: head.snapshot,
      messageId: '00000000-0000-4000-8000-000000000101',
    } as never);
    expect(firstReply?.card.anchorKey).toBe(`attempt:${attemptA}`);
    expect(
      firstReply?.page.messages.map((message) => message.id),
    ).not.toContain('00000000-0000-4000-8000-000000000103');
    expect(
      await fixture.service.locateMessage({
        ...fixture.request,
        snapshot: head.snapshot,
        messageId: unrelatedId,
      } as never),
    ).toBeNull();
    const laterReply = await fixture.service.locateMessage({
      ...fixture.request,
      snapshot: head.snapshot,
      messageId: '00000000-0000-4000-8000-000000000103',
    } as never);
    expect(laterReply?.card.anchorKey).toBe(`attempt:${attemptB}`);
    const lateReply = await fixture.service.locateMessage({
      ...fixture.request,
      snapshot: head.snapshot,
      messageId: lateReplyId,
    } as never);
    expect(lateReply?.card.anchorKey).toBe(`attempt:${attemptA}`);
    const secondGroup = await fixture.service.listCardMessages({
      ...fixture.request,
      snapshot: head.snapshot,
      threadId,
      anchorKey: `attempt:${attemptB}`,
    } as never);
    expect(secondGroup.messages.map((message) => message.id)).not.toContain(
      unansweredId,
    );
    expect(secondGroup.messages.map((message) => message.id)).not.toContain(
      operatorReplyId,
    );
    expect(secondGroup.messages.map((message) => message.id)).not.toContain(
      legacyOperatorReplyId,
    );
    expect(secondGroup.messages.map((message) => message.id)).not.toContain(
      followUpId,
    );
    const invalidProofs: Array<[string, unknown[]]> = [
      [
        `DELETE FROM inbox_receipt_fixture WHERE "actionApprovalBindingId"=$1`,
        [bindingId],
      ],
      [
        `UPDATE inbox_receipt_fixture SET state='FAILED' WHERE "actionApprovalBindingId"=$1`,
        [bindingId],
      ],
      [
        `UPDATE inbox_receipt_fixture SET "providerMessageId"='<other@example.com>' WHERE "actionApprovalBindingId"=$1`,
        [bindingId],
      ],
      [
        `UPDATE inbox_receipt_fixture SET "providerExternalMessageId"='other-external' WHERE "actionApprovalBindingId"=$1`,
        [bindingId],
      ],
      [
        `UPDATE inbox_binding_link_fixture SET "recordId"=$2 WHERE "actionApprovalBindingId"=$1 AND role='delivery_target'`,
        [bindingId, '00000000-0000-4000-8000-000000000999'],
      ],
      [
        `UPDATE inbox_association_fixture SET "messageChannelId"=$2 WHERE "messageId"=$1`,
        [operatorReplyId, '00000000-0000-4000-8000-000000000999'],
      ],
    ];
    await client.query('SAVEPOINT operator_proof');
    for (const [sql, parameters] of invalidProofs) {
      await client.query(sql, parameters);
      const current = await fixture.service.listCards(fixture.request as never);
      const currentPage = await fixture.service.listCardMessages({
        ...fixture.request,
        threadId,
        anchorKey: `attempt:${attemptA}`,
        snapshot: current.snapshot,
      } as never);
      expect(currentPage.messages.map((message) => message.id)).not.toContain(
        operatorReplyId,
      );
      expect(currentPage.messages.map((message) => message.id)).not.toContain(
        followUpId,
      );
      await client.query('ROLLBACK TO SAVEPOINT operator_proof');
    }
    await client.query('RELEASE SAVEPOINT operator_proof');
    await client.query(
      `UPDATE inbox_binding_link_fixture SET "recordId"=$1 WHERE "actionApprovalBindingId" IN ($2,$3) AND role='thread_parent'`,
      ['00000000-0000-4000-8000-000000000999', bindingId, legacyBindingId],
    );
    const unproven = await fixture.service.listCards(fixture.request as never);
    const unprovenPage = await fixture.service.listCardMessages({
      ...fixture.request,
      threadId,
      anchorKey: `attempt:${attemptA}`,
      snapshot: unproven.snapshot,
    } as never);
    expect(unprovenPage.messages.map((message) => message.id)).not.toContain(
      operatorReplyId,
    );
    expect(unprovenPage.messages.map((message) => message.id)).not.toContain(
      legacyOperatorReplyId,
    );
    expect(unprovenPage.messages.map((message) => message.id)).not.toContain(
      followUpId,
    );
    await client.query(
      `UPDATE inbox_email_fixture SET readable=FALSE WHERE id=$1`,
      ['00000000-0000-4000-8000-000000000103'],
    );
    await expect(
      fixture.service.readCard({
        ...fixture.request,
        threadId,
        anchorKey: `attempt:${attemptB}`,
      } as never),
    ).rejects.toThrow('Inbox card is not readable');
    expect(
      (
        await fixture.service.readCard({
          ...fixture.request,
          threadId,
        } as never)
      ).card?.anchorKey,
    ).toBe(`legacy:${threadId}`);
  });

  it('executes old and keyed GraphQL operations against real authorized card SQL without fallback', async () => {
    const fixture = serviceFixture(new Set(), true);
    const workspaceId = fixture.request.workspace.id;
    const threadId = '00000000-0000-4000-8000-000000000005';
    const channelId = '00000000-0000-4000-8000-000000000052';
    const attemptId = '00000000-0000-4000-8000-000000000401';
    await client.query(
      `UPDATE inbox_email_fixture SET direction='OUTGOING' WHERE id=$1`,
      [threadId],
    );
    await client.query(
      `UPDATE inbox_association_fixture SET direction='OUTGOING' WHERE "messageId"=$1`,
      [threadId],
    );
    await client.query(
      `INSERT INTO inbox_attempt_fixture ("attemptId","workspaceId","messageChannelId","projectedMessageId","attemptState") VALUES ($1,$2,$3,$4,'ACCEPTED')`,
      [attemptId, workspaceId, channelId, threadId],
    );
    await client.query(
      `INSERT INTO inbox_reply_evidence_fixture VALUES ($1,$2,$3,'EXACT',$4,'00000000-0000-4000-8000-000000000056','00000000-0000-4000-8000-000000000057')`,
      [
        workspaceId,
        '00000000-0000-4000-8000-000000000101',
        channelId,
        attemptId,
      ],
    );
    await client.query(
      `DELETE FROM inbox_email_fixture WHERE "messageThreadId"=$1 AND id NOT IN ($1,$2)`,
      [threadId, '00000000-0000-4000-8000-000000000101'],
    );
    const moduleRef = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
    }).compile();
    try {
      const generated = await moduleRef
        .get(GraphQLSchemaFactory)
        .create([MyahInboxContactResolver]);
      const schema = buildSchema(printSchema(generated));
      const variables = {
        contactId: fixture.request.contactId,
        expectedWorkspaceId: workspaceId,
        threadId,
      };
      const rootValue = {
        myahInboxContactEmailCard: (args: {
          threadId: string;
          anchorKey?: string;
        }) =>
          fixture.service.readCard({ ...fixture.request, ...args } as never),
        myahInboxContactEmailCardMessages: (args: {
          threadId: string;
          anchorKey?: string;
          snapshot: string;
        }) =>
          fixture.service.listCardMessages({
            ...fixture.request,
            ...args,
          } as never),
      };
      const readCard = (anchorKey?: string) =>
        graphql({
          schema,
          rootValue,
          source: `query($contactId: String!, $expectedWorkspaceId: UUID!, $threadId: UUID!${anchorKey ? ', $anchorKey: String' : ''}) {
          myahInboxContactEmailCard(contactId: $contactId, expectedWorkspaceId: $expectedWorkspaceId, threadId: $threadId${anchorKey ? ', anchorKey: $anchorKey' : ''}) {
            snapshot card { threadId anchorKey rootMessageId }
          }
        }`,
          variableValues: { ...variables, ...(anchorKey ? { anchorKey } : {}) },
        });
      const oldCard = await readCard();
      expect(oldCard.errors).toBeUndefined();
      expect(oldCard.data?.myahInboxContactEmailCard).toMatchObject({
        card: { anchorKey: `legacy:${threadId}`, rootMessageId: threadId },
      });
      const keyedCard = await readCard(`attempt:${attemptId}`);
      expect(keyedCard.errors).toBeUndefined();
      expect(keyedCard.data?.myahInboxContactEmailCard).toMatchObject({
        card: { anchorKey: `attempt:${attemptId}`, rootMessageId: threadId },
      });
      for (const [anchorKey, projection] of [
        [undefined, oldCard],
        [`attempt:${attemptId}`, keyedCard],
      ] as const) {
        const result = await graphql({
          schema,
          rootValue,
          source: `query($contactId: String!, $expectedWorkspaceId: UUID!, $threadId: UUID!, $snapshot: String!${anchorKey ? ', $anchorKey: String' : ''}) {
            myahInboxContactEmailCardMessages(contactId: $contactId, expectedWorkspaceId: $expectedWorkspaceId, threadId: $threadId, snapshot: $snapshot${anchorKey ? ', anchorKey: $anchorKey' : ''}) {
              threadId anchorKey root { id } messages { id }
            }
          }`,
          variableValues: {
            ...variables,
            snapshot: (
              projection.data?.myahInboxContactEmailCard as { snapshot: string }
            ).snapshot,
            ...(anchorKey ? { anchorKey } : {}),
          },
        });
        expect(result.errors).toBeUndefined();
        expect(result.data?.myahInboxContactEmailCardMessages).toMatchObject({
          anchorKey: anchorKey ?? `legacy:${threadId}`,
          root: { id: threadId },
          messages: expect.arrayContaining([
            { id: '00000000-0000-4000-8000-000000000101' },
          ]),
        });
      }
      for (const key of [
        'attempt:00000000-0000-4000-8000-000000000499',
        'thread:00000000-0000-4000-8000-000000000003',
      ]) {
        const invalid = await readCard(key);
        expect(invalid.data).toBeNull();
        expect(invalid.errors?.[0].message).toMatch(
          /Inbox card is not readable|Invalid Inbox card key/,
        );
      }
      await client.query(
        `UPDATE inbox_email_fixture SET readable=FALSE WHERE id=$1`,
        ['00000000-0000-4000-8000-000000000101'],
      );
      const unauthorized = await readCard(`attempt:${attemptId}`);
      expect(unauthorized.data).toBeNull();
      expect(unauthorized.errors?.[0].message).toBe(
        'Inbox card is not readable',
      );
      expect((await readCard()).data?.myahInboxContactEmailCard).toMatchObject({
        card: { anchorKey: `legacy:${threadId}` },
      });
    } finally {
      await moduleRef.close();
    }
  });

  it('withholds a pending-only inbound from an answered group until durable evidence resolves it', async () => {
    const fixture = serviceFixture(new Set(), true);
    const workspaceId = fixture.request.workspace.id;
    const threadId = '00000000-0000-4000-8000-000000000005';
    const channelId = '00000000-0000-4000-8000-000000000052';
    const attemptId = '00000000-0000-4000-8000-000000000401';
    const pendingId = '00000000-0000-4000-8000-000000000701';
    await client.query(
      `INSERT INTO inbox_attempt_fixture ("attemptId","workspaceId","messageChannelId","projectedMessageId","attemptState") VALUES ($1,$2,$3,NULL,'ACCEPTED')`,
      [attemptId, workspaceId, channelId],
    );
    await client.query(
      `INSERT INTO inbox_reply_evidence_fixture VALUES ($1,$2,$3,'EXACT',$4,'00000000-0000-4000-8000-000000000056','00000000-0000-4000-8000-000000000057')`,
      [
        workspaceId,
        '00000000-0000-4000-8000-000000000101',
        channelId,
        attemptId,
      ],
    );
    await client.query(
      `INSERT INTO inbox_email_fixture (id,"messageThreadId","receivedAt","createdAt",subject,text,visibility,direction)
      VALUES ($1,$2,'2026-09-03T00:00:00Z','2026-08-01T00:00:00Z','pending reply','body','FULL','INCOMING')`,
      [pendingId, threadId],
    );
    await client.query(
      `INSERT INTO inbox_association_fixture (id,"messageId","messageChannelId",direction,"deletedAt") VALUES ($1,$1,$2,'INCOMING',NULL)`,
      [pendingId, channelId],
    );
    const pending = await fixture.service.listCards(fixture.request as never);
    expect(
      pending.cards.filter((card) => card.threadId === threadId),
    ).toHaveLength(1);
    const before = await fixture.service.listCardMessages({
      ...fixture.request,
      threadId,
      anchorKey: `attempt:${attemptId}`,
      snapshot: pending.snapshot,
    } as never);
    expect(before.messages.map((message) => message.id)).not.toContain(
      pendingId,
    );
    await client.query(
      `INSERT INTO inbox_reply_evidence_fixture VALUES ($1,$2,$3,'EXACT',$4,'00000000-0000-4000-8000-000000000056','00000000-0000-4000-8000-000000000057')`,
      [workspaceId, pendingId, channelId, attemptId],
    );
    await expect(
      fixture.service.listCardMessages({
        ...fixture.request,
        threadId,
        snapshot: pending.snapshot,
      } as never),
    ).rejects.toThrow('Inbox history changed; reload history');
    const fresh = await fixture.service.listCards(fixture.request as never);
    expect(
      fresh.cards.filter((card) => card.threadId === threadId),
    ).toHaveLength(1);
    const after = await fixture.service.listCardMessages({
      ...fixture.request,
      threadId,
      anchorKey: `attempt:${attemptId}`,
      snapshot: fresh.snapshot,
    } as never);
    expect(after.messages.map((message) => message.id)).toContain(pendingId);
  });

  it('keeps unproven THREAD replies neutral until their own proof is promoted, then recovers one exact group', async () => {
    const fixture = serviceFixture(new Set(), true);
    const threadId = '00000000-0000-4000-8000-000000000005';
    const attemptId = '00000000-0000-4000-8000-000000000401';
    const workspaceId = fixture.request.workspace.id;
    const channelId = '00000000-0000-4000-8000-000000000052';
    const campaignId = '00000000-0000-4000-8000-000000000056';
    const enrollmentId = '00000000-0000-4000-8000-000000000057';
    await client.query(
      `INSERT INTO inbox_attempt_fixture ("attemptId","workspaceId","messageChannelId","projectedMessageId","attemptState") VALUES ($1,$2,$3,NULL,'ACCEPTED')`,
      [attemptId, workspaceId, channelId],
    );
    await client.query(
      `INSERT INTO inbox_reply_evidence_fixture VALUES ($1,$2,$3,'THREAD',NULL,$4,$5)`,
      [
        workspaceId,
        '00000000-0000-4000-8000-000000000101',
        channelId,
        campaignId,
        enrollmentId,
      ],
    );
    const old = await fixture.service.listCards(fixture.request as never);
    expect(
      old.cards
        .filter((card) => card.threadId === threadId)
        .map((card) => card.anchorKey),
    ).toEqual([`thread:${threadId}`]);
    await client.query(
      `INSERT INTO inbox_reply_evidence_fixture VALUES ($1,$2,$3,'EXACT',$4,$5,$6)`,
      [
        workspaceId,
        '00000000-0000-4000-8000-000000000102',
        channelId,
        attemptId,
        campaignId,
        enrollmentId,
      ],
    );
    await expect(
      fixture.service.listCardMessages({
        ...fixture.request,
        threadId,
        snapshot: old.snapshot,
      } as never),
    ).rejects.toThrow('Inbox history changed; reload history');
    const neutral = await fixture.service.listCards(fixture.request as never);
    expect(
      neutral.cards
        .filter((card) => card.threadId === threadId)
        .map((card) => card.anchorKey),
    ).toEqual([`thread:${threadId}`, `attempt:${attemptId}`]);
    const unproven = await fixture.service.locateMessage({
      ...fixture.request,
      snapshot: neutral.snapshot,
      messageId: '00000000-0000-4000-8000-000000000101',
    } as never);
    expect(unproven?.card.anchorKey).toBe(`thread:${threadId}`);
    await client.query(
      `UPDATE inbox_reply_evidence_fixture SET classification='EXACT', "matchedAttemptId"=$1 WHERE "inboundMessageId"=$2`,
      [attemptId, '00000000-0000-4000-8000-000000000101'],
    );
    await expect(
      fixture.service.listCardMessages({
        ...fixture.request,
        threadId,
        snapshot: neutral.snapshot,
      } as never),
    ).rejects.toThrow('Inbox history changed; reload history');
    const fresh = await fixture.service.listCards(fixture.request as never);
    expect(
      fresh.cards
        .filter((card) => card.threadId === threadId)
        .map((card) => card.anchorKey),
    ).toEqual([`attempt:${attemptId}`]);
    const promoted = await fixture.service.locateMessage({
      ...fixture.request,
      snapshot: fresh.snapshot,
      messageId: '00000000-0000-4000-8000-000000000101',
    } as never);
    expect(promoted?.card.anchorKey).toBe(`attempt:${attemptId}`);
  });

  it('coalesces a previously recorded THREAD reply with its uniquely proven accepted send without duplicating either reply', async () => {
    const fixture = serviceFixture(new Set(), true);
    const threadId = '00000000-0000-4000-8000-000000000005';
    const workspaceId = fixture.request.workspace.id;
    const channelId = '00000000-0000-4000-8000-000000000052';
    const attemptId = '00000000-0000-4000-8000-000000000401';
    const campaignId = '00000000-0000-4000-8000-000000000056';
    const enrollmentId = '00000000-0000-4000-8000-000000000057';
    await client.query(
      `UPDATE inbox_email_fixture SET direction='OUTGOING' WHERE id=$1`,
      [threadId],
    );
    await client.query(
      `UPDATE inbox_association_fixture SET direction='OUTGOING' WHERE "messageId"=$1`,
      [threadId],
    );
    await client.query(
      `INSERT INTO inbox_attempt_fixture ("attemptId","workspaceId","messageChannelId","projectedMessageId","attemptState","campaignId","enrollmentId") VALUES ($1,$2,$3,$4,'ACCEPTED',$5,$6)`,
      [attemptId, workspaceId, channelId, threadId, campaignId, enrollmentId],
    );
    for (const [inboundId, classification, matchedAttemptId] of [
      ['00000000-0000-4000-8000-000000000101', 'THREAD', null],
      ['00000000-0000-4000-8000-000000000102', 'EXACT', attemptId],
    ]) {
      await client.query(
        `INSERT INTO inbox_reply_evidence_fixture VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          workspaceId,
          inboundId,
          channelId,
          classification,
          matchedAttemptId,
          campaignId,
          enrollmentId,
        ],
      );
    }
    const result = await fixture.service.listCards(fixture.request as never);
    expect(
      result.cards
        .filter((card) => card.threadId === threadId)
        .map((card) => card.anchorKey),
    ).toEqual([`attempt:${attemptId}`]);
    const page = await fixture.service.listCardMessages({
      ...fixture.request,
      threadId,
      anchorKey: `attempt:${attemptId}`,
      snapshot: result.snapshot,
    } as never);
    expect(page.messages.map((message) => message.id)).toEqual([
      '00000000-0000-4000-8000-000000000101',
      '00000000-0000-4000-8000-000000000102',
    ]);
    // Another accepted attempt in the same cohort makes the old THREAD proof
    // ambiguous again; it must not be silently assigned to the first send.
    await client.query(
      `INSERT INTO inbox_attempt_fixture ("attemptId","workspaceId","messageChannelId","projectedMessageId","attemptState","campaignId","enrollmentId") VALUES ($1,$2,$3,NULL,'ACCEPTED',$4,$5)`,
      [
        '00000000-0000-4000-8000-000000000402',
        workspaceId,
        channelId,
        campaignId,
        enrollmentId,
      ],
    );
    await expect(
      fixture.service.listCardMessages({
        ...fixture.request,
        threadId,
        anchorKey: `attempt:${attemptId}`,
        snapshot: result.snapshot,
      } as never),
    ).rejects.toThrow('Inbox history changed; reload history');
    const ambiguous = await fixture.service.listCards(fixture.request as never);
    expect(
      ambiguous.cards
        .filter((card) => card.threadId === threadId)
        .map((card) => card.anchorKey),
    ).toEqual([`attempt:${attemptId}`, `thread:${threadId}`]);
    await client.query(
      `DELETE FROM inbox_attempt_fixture WHERE "attemptId"=$1`,
      ['00000000-0000-4000-8000-000000000402'],
    );
    await client.query(
      `UPDATE inbox_attempt_fixture SET "providerAcceptedAt"='2026-09-02T00:00:00.000002Z' WHERE "attemptId"=$1`,
      [attemptId],
    );
    const earlierReply = await fixture.service.listCards(
      fixture.request as never,
    );
    expect(
      earlierReply.cards
        .filter((card) => card.threadId === threadId)
        .map((card) => card.anchorKey),
    ).toEqual([`attempt:${attemptId}`, `thread:${threadId}`]);
  });

  it('ignores unrelated legacy null timestamps in response-only cards but fails closed on the proven reply', async () => {
    const fixture = serviceFixture(new Set(), true);
    const channelId = '00000000-0000-4000-8000-000000000052';
    const replyId = '00000000-0000-4000-8000-000000000101';
    const threadId = '00000000-0000-4000-8000-000000000005';
    await client.query(
      `INSERT INTO inbox_reply_evidence_fixture VALUES ($1,$2,$3,'THREAD',NULL,'00000000-0000-4000-8000-000000000056','00000000-0000-4000-8000-000000000057')`,
      [fixture.request.workspace.id, replyId, channelId],
    );
    await client.query(
      `UPDATE inbox_email_fixture SET "receivedAt"=NULL WHERE id=$1`,
      ['00000000-0000-4000-8000-000000000001'],
    );
    await client.query(
      `UPDATE inbox_email_fixture SET "createdAt"=NULL WHERE id=$1`,
      ['00000000-0000-4000-8000-000000000002'],
    );
    const response = await fixture.service.listCards(fixture.request as never);
    expect(response.cards.map((card) => card.anchorKey)).toEqual([
      `thread:${threadId}`,
    ]);
    await client.query(
      `UPDATE inbox_email_fixture SET "receivedAt"=NULL WHERE id=$1`,
      [replyId],
    );
    await expect(
      fixture.service.listCards(fixture.request as never),
    ).rejects.toThrow('Inbox history ordering is unavailable');
  });

  it('keeps an EXACT group key while an unreadable parent transitions from PENDING to its send root', async () => {
    const fixture = serviceFixture(new Set(), true);
    const workspaceId = fixture.request.workspace.id;
    const threadId = '00000000-0000-4000-8000-000000000005';
    const channelId = '00000000-0000-4000-8000-000000000052';
    const attemptId = '00000000-0000-4000-8000-000000000401';
    await client.query(
      `UPDATE inbox_email_fixture SET direction='OUTGOING', readable=FALSE WHERE id=$1`,
      [threadId],
    );
    await client.query(
      `UPDATE inbox_association_fixture SET direction='OUTGOING' WHERE "messageId"=$1`,
      [threadId],
    );
    await client.query(
      `INSERT INTO inbox_attempt_fixture ("attemptId","workspaceId","messageChannelId","projectedMessageId","attemptState") VALUES ($1,$2,$3,$4,'ACCEPTED')`,
      [attemptId, workspaceId, channelId, threadId],
    );
    await client.query(
      `INSERT INTO inbox_reply_evidence_fixture VALUES ($1,$2,$3,'EXACT',$4,'00000000-0000-4000-8000-000000000056','00000000-0000-4000-8000-000000000057')`,
      [
        workspaceId,
        '00000000-0000-4000-8000-000000000101',
        channelId,
        attemptId,
      ],
    );
    const pending = await fixture.service.listCards(fixture.request as never);
    const card = pending.cards.find((item) => item.threadId === threadId)!;
    expect(card).toMatchObject({
      anchorKey: `attempt:${attemptId}`,
      rootMessageId: '00000000-0000-4000-8000-000000000101',
      historyBasis: 'PENDING',
    });
    await client.query(
      `UPDATE inbox_email_fixture SET readable=TRUE WHERE id=$1`,
      [threadId],
    );
    await expect(
      fixture.service.listCardMessages({
        ...fixture.request,
        threadId,
        snapshot: pending.snapshot,
      } as never),
    ).rejects.toThrow('Inbox history changed; reload history');
    const fresh = await fixture.service.listCards(fixture.request as never);
    expect(fresh.cards.filter((item) => item.threadId === threadId)).toEqual([
      expect.objectContaining({
        anchorKey: card.anchorKey,
        rootMessageId: threadId,
        historyBasis: 'EARLIEST_AUTHORIZED_RETAINED',
      }),
    ]);
  });

  it('keeps recorded replies inside one legacy thread card while response focus is disabled', async () => {
    const fixture = serviceFixture(new Set(), true, false);
    const threadId = '00000000-0000-4000-8000-000000000005';
    await client.query(
      `INSERT INTO inbox_reply_evidence_fixture VALUES ($1,$2,$3,'THREAD',NULL,'00000000-0000-4000-8000-000000000056','00000000-0000-4000-8000-000000000057')`,
      [
        fixture.request.workspace.id,
        '00000000-0000-4000-8000-000000000101',
        '00000000-0000-4000-8000-000000000052',
      ],
    );
    const head = await fixture.service.listCards(fixture.request as never);
    expect(head.cards.map((card) => card.anchorKey)).toEqual(
      [3, 4, 5].map(
        (i) => `legacy:00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      ),
    );
    for (const messageId of [
      '00000000-0000-4000-8000-000000000101',
      '00000000-0000-4000-8000-000000000102',
    ]) {
      const located = await fixture.service.locateMessage({
        ...fixture.request,
        snapshot: head.snapshot,
        messageId,
      } as never);
      expect(located?.card.anchorKey).toBe(`legacy:${threadId}`);
    }
    const page = await fixture.service.listCardMessages({
      ...fixture.request,
      threadId,
      anchorKey: `legacy:${threadId}`,
      snapshot: head.snapshot,
    } as never);
    expect(page.olderCursor).not.toBeNull();
    const older = await fixture.service.listCardMessages({
      ...fixture.request,
      threadId,
      anchorKey: `legacy:${threadId}`,
      snapshot: head.snapshot,
      cursor: page.olderCursor,
    } as never);
    expect(older.messages.length).toBeGreaterThan(0);
  });

  it('uses a deterministic neutral THREAD group alongside unchanged explicit legacy thread identity', async () => {
    const fixture = serviceFixture(new Set(), true);
    const threadId = '00000000-0000-4000-8000-000000000005';
    await client.query(
      `INSERT INTO inbox_reply_evidence_fixture VALUES ($1,$2,$3,'THREAD',NULL,'00000000-0000-4000-8000-000000000056','00000000-0000-4000-8000-000000000057')`,
      [
        fixture.request.workspace.id,
        '00000000-0000-4000-8000-000000000101',
        '00000000-0000-4000-8000-000000000052',
      ],
    );
    const head = await fixture.service.listCards(fixture.request as never);
    expect(
      head.cards.find((card) => card.threadId === threadId)?.anchorKey,
    ).toBe(`thread:${threadId}`);
    const unproven = await fixture.service.locateMessage({
      ...fixture.request,
      snapshot: head.snapshot,
      messageId: '00000000-0000-4000-8000-000000000102',
    } as never);
    expect(unproven).toBeNull();
    const located = await fixture.service.locateMessage({
      ...fixture.request,
      snapshot: head.snapshot,
      messageId: '00000000-0000-4000-8000-000000000101',
    } as never);
    expect(located?.card.anchorKey).toBe(`thread:${threadId}`);
    const legacyId = '00000000-0000-4000-8000-000000000004';
    const legacy = await fixture.service.readCard({
      ...fixture.request,
      contactId: encodeMyahInboxContactId({
        workspaceId: fixture.request.workspace.id,
        identity: { kind: 'email-thread', recordId: legacyId },
      }),
      threadId: legacyId,
    } as never);
    expect(legacy.card?.anchorKey).toBe(`legacy:${legacyId}`);
  });

  it('executes authorized projection and hydration in one statement after a schema preflight', async () => {
    const fixture = serviceFixture();
    const head = await fixture.service.listCards(fixture.request as never);
    expect(head.cards.map((card) => card.threadId)).toEqual(
      [3, 4, 5].map(
        (i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      ),
    );
    expect(fixture.statements()).toBe(2);
    expect(head.cards[2].campaignLabel).toBe('Readable campaign');
    const page = await fixture.service.listCardMessages({
      ...fixture.request,
      threadId: head.cards[2].threadId,
      snapshot: head.snapshot,
    } as never);
    expect(page.messages).toHaveLength(20);
    expect(page.messages[0].receivedAt).toBe('2026-09-02T00:00:00.000181Z');
    expect(page.olderCursor).not.toBeNull();
    expect(
      decodeMyahInboxEmailCardCursor(
        page.olderCursor!,
        {
          workspaceId: fixture.request.workspace.id,
          userWorkspaceId: fixture.request.authContext.userWorkspaceId,
          contactId: fixture.request.contactId,
        },
        'older',
      ).anchorKey,
    ).toBe(`legacy:${head.cards[2].threadId}`);
    expect(page.root.participants).toEqual([
      { role: 'FROM', handle: 'creator@example.test', displayName: null },
    ]);
    expect(fixture.statements()).toBe(4);
  });

  it.each([
    'message.subject',
    'message.text',
    'messageParticipant.handle',
    'messageThread.myahCampaignId',
    'campaign.id',
    'campaign.name',
  ])(
    'redacts optional %s denial without changing root identity',
    async (field) => {
      const fixture = serviceFixture(new Set([field]));
      const head = await fixture.service.listCards(fixture.request as never);
      expect(head.cards).toHaveLength(3);
      const page = await fixture.service.listCardMessages({
        ...fixture.request,
        threadId: head.cards[2].threadId,
        snapshot: head.snapshot,
      } as never);
      if (field === 'message.subject')
        expect(page.root.subject).toBe(
          FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED,
        );
      if (field === 'message.text')
        expect(page.root.text).toBe(
          FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED,
        );
      if (field === 'messageParticipant.handle')
        expect(page.root.participants).toEqual([]);
      if (
        field.startsWith('campaign.') ||
        field === 'messageThread.myahCampaignId'
      )
        expect(head.cards[2].campaignLabel).toBeNull();
      expect(page.root.id).toBe(head.cards[2].rootMessageId);
    },
  );

  it.each([
    'message.receivedAt',
    'message.createdAt',
    'message.isDraft',
    'messageThread.creatorId',
    'workspaceMember.id',
    'creator.id',
  ])('fails mandatory %s serialization before SQL', async (field) => {
    const fixture = serviceFixture(new Set([field]));
    await expect(
      fixture.service.listCards(fixture.request as never),
    ).rejects.toBeInstanceOf(PermissionsException);
    expect(fixture.statements()).toBe(0);
  });

  it('revalidates optional fields and exact contact targets without relying on fingerprint changes', async () => {
    const denied = new Set<string>();
    const fixture = serviceFixture(denied);
    const head = await fixture.service.listCards(fixture.request as never);
    denied.add('message.subject');
    denied.add('campaign.name');
    const current = await fixture.service.readCard({
      ...fixture.request,
      threadId: head.cards[0].threadId,
    } as never);
    expect(current.card).toEqual({
      ...head.cards[0],
      subject: FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED,
      campaignLabel: null,
    });
    const otherContact = encodeMyahInboxContactId({
      workspaceId: fixture.request.workspace.id,
      identity: { kind: 'email-thread', recordId: head.cards[1].threadId },
    });
    await expect(
      fixture.service.readCard({
        ...fixture.request,
        contactId: otherContact,
        threadId: head.cards[0].threadId,
      } as never),
    ).resolves.toMatchObject({ card: null });
    const otherHead = await fixture.service.listCards({
      ...fixture.request,
      contactId: otherContact,
    } as never);
    await expect(
      fixture.service.locateMessage({
        ...fixture.request,
        contactId: otherContact,
        snapshot: otherHead.snapshot,
        messageId: head.cards[0].rootMessageId,
      } as never),
    ).resolves.toBeNull();
  });

  it('does not disguise a SQL failure as empty authorized history', async () => {
    const fixture = serviceFixture();
    await client.query('DROP TABLE pg_temp.inbox_participant_fixture');
    await expect(
      fixture.service.listCards(fixture.request as never),
    ).rejects.toThrow('does not exist');
  });

  it('re-authorizes root membership, visibility, draft exclusion, and current member inside the read', async () => {
    const fixture = serviceFixture();
    await client.query(
      `UPDATE inbox_email_fixture SET "isDraft" = TRUE WHERE id = '00000000-0000-4000-8000-000000000005'`,
    );
    let head = await fixture.service.listCards(fixture.request as never);
    expect(head.cards[2].rootMessageId).toBe(
      '00000000-0000-4000-8000-000000000101',
    );
    await client.query(
      `UPDATE inbox_email_fixture SET readable = FALSE WHERE id = '00000000-0000-4000-8000-000000000101'`,
    );
    head = await fixture.service.listCards(fixture.request as never);
    expect(head.cards[2].rootMessageId).toBe(
      '00000000-0000-4000-8000-000000000102',
    );
    await client.query(
      `UPDATE inbox_channel_fixture SET visibility = 'PRIVATE'`,
    );
    head = await fixture.service.listCards(fixture.request as never);
    expect(head.cards).toEqual([]);
    await client.query(
      `UPDATE inbox_context_fixture SET readable = FALSE WHERE id = '00000000-0000-4000-8000-000000000051'`,
    );
    await expect(
      fixture.service.listCards(fixture.request as never),
    ).rejects.toThrow('Inbox member or contact is not readable');
  });

  it('replays scoped message cursors with exact boundaries and rejects another snapshot or native card', async () => {
    const fixture = serviceFixture();
    const head = await fixture.service.listCards(fixture.request as never);
    const input = {
      ...fixture.request,
      threadId: head.cards[2].threadId,
      snapshot: head.snapshot,
    };
    const tail = await fixture.service.listCardMessages(input as never);
    const older = await fixture.service.listCardMessages({
      ...input,
      cursor: tail.olderCursor,
    } as never);
    expect(older.messages).toHaveLength(20);
    expect(older.messages[19].receivedAt).toBe('2026-09-02T00:00:00.000180Z');
    await expect(
      fixture.service.listCardMessages({
        ...input,
        threadId: head.cards[1].threadId,
        cursor: tail.olderCursor,
      } as never),
    ).rejects.toThrow('Invalid Inbox history cursor');
    const fresh = await fixture.service.listCards(fixture.request as never);
    await expect(
      fixture.service.listCardMessages({
        ...input,
        snapshot: fresh.snapshot,
        cursor: tail.olderCursor,
      } as never),
    ).rejects.toThrow('Invalid Inbox history cursor');
  });

  const read = async (options: Record<string, unknown> = {}) => {
    const {
      buildMyahInboxEmailReadQuery,
    } = require('../myah-inbox-email-read-query.util');
    const query = buildMyahInboxEmailReadQuery(
      {
        sql: `authorized_email AS (SELECT id, "messageThreadId", "receivedAt", "createdAt", visibility, direction, NULL::uuid AS "workspaceId", NULL::uuid AS "messageChannelId", "headerMessageId", NULL::text AS "messageExternalId" FROM inbox_email_fixture),
        accepted_outreach AS (SELECT "projectedMessageId", "attemptId", "campaignId", "enrollmentId", "messageChannelId", "providerAcceptedAt" FROM inbox_attempt_fixture WHERE "attemptState"='ACCEPTED'),
        reply_evidence AS (SELECT evidence."inboundMessageId", inbound."messageThreadId", evidence.classification,
          evidence."matchedAttemptId", evidence."campaignId", evidence."enrollmentId", evidence."messageChannelId", attempt."projectedMessageId"
          FROM inbox_reply_evidence_fixture evidence
          JOIN authorized_email inbound ON inbound.id=evidence."inboundMessageId" AND inbound.direction='INCOMING'
          LEFT JOIN inbox_attempt_fixture attempt ON attempt."attemptId"=evidence."matchedAttemptId"),
        readable_member AS (SELECT 1), readable_contact AS (SELECT 1),
        readable_subject AS (SELECT id, subject FROM inbox_email_fixture),
        readable_text AS (SELECT id, text FROM inbox_email_fixture),
        readable_participants AS (SELECT NULL::uuid AS id, NULL::uuid AS "messageId", NULL::text AS role, NULL::text AS handle, NULL::text AS "displayName" WHERE FALSE),
        readable_campaign_relation AS (SELECT NULL::uuid AS id, NULL::uuid AS "myahCampaignId" WHERE FALSE),
        readable_campaign AS (SELECT NULL::uuid AS id WHERE FALSE),
        readable_campaign_name AS (SELECT NULL::uuid AS id, NULL::text AS name WHERE FALSE)`,
        parameters: [],
      },
      { mode: 'cards', ...options },
    );
    const result = await client.query(
      query.sql
        .replace(
          /core\."myahCampaignReplyEvidence"/g,
          'pg_temp.inbox_reply_evidence_fixture',
        )
        .replace(
          /core\."outboundEmailAttempt"/g,
          'pg_temp.inbox_attempt_fixture',
        )
        .replace(
          /core\."actionExecutionReceipt"/g,
          'pg_temp.inbox_receipt_fixture',
        )
        .replace(
          /core\."actionApprovalBindingEvidenceLink"/g,
          'pg_temp.inbox_binding_link_fixture',
        )
        .replace(
          /core\."actionApprovalBinding"/g,
          'pg_temp.inbox_binding_fixture',
        ),
      query.parameters,
    );
    return result.rows[0] as unknown as {
      snapshotAt: string;
      fingerprint: string;
    };
  };

  it('pins the root separately from a bounded 20-message tail and locates a middle reply', async () => {
    const threadId = '00000000-0000-4000-8000-000000000005';
    await expect(read({ mode: 'messages', threadId })).resolves.toMatchObject({
      page: {
        threadId,
        root: { id: threadId, receivedAt: '2026-09-01T00:00:00.000005Z' },
        messages: Array.from({ length: 20 }, (_, i) => ({
          id: `00000000-0000-4000-8000-${String(281 + i).padStart(12, '0')}`,
        })),
        hasOlder: true,
        hasNewer: false,
      },
    });
    await expect(
      read({
        mode: 'location',
        messageId: '00000000-0000-4000-8000-000000000200',
      }),
    ).resolves.toMatchObject({
      page: {
        messages: Array.from({ length: 20 }, (_, i) => ({
          id: `00000000-0000-4000-8000-${String(181 + i).padStart(12, '0')}`,
        })),
        hasOlder: true,
        hasNewer: true,
      },
    });
  });

  it('keeps the old older-card frontier independent from a fresh backdated discovery sweep', async () => {
    const initial = await read();
    await client.query(`INSERT INTO inbox_email_fixture (id, "messageThreadId", "receivedAt", "createdAt", subject, text, visibility, direction) VALUES (
      '00000000-0000-4000-8000-000000000999', '00000000-0000-4000-8000-000000000999',
      '2026-01-01T00:00:00Z', clock_timestamp(), 'import', 'body', 'FULL', 'INCOMING')`);
    const boundary = {
      timestamp: '2026-09-01T00:00:00.000003Z',
      id: 'legacy:00000000-0000-4000-8000-000000000003',
      threadId: '00000000-0000-4000-8000-000000000003',
    };
    await expect(
      read({
        cutoff: initial.snapshotAt,
        fingerprint: initial.fingerprint,
        boundary,
      }),
    ).resolves.toMatchObject({
      cards: [1, 2].map((i) => ({
        threadId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      })),
      hasOlderCards: false,
    });
    await expect(read({ boundary })).resolves.toMatchObject({
      cards: [999, 1, 2].map((i) => ({
        threadId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      })),
      hasOlderCards: false,
    });
  });

  it('fills older and newer gaps with exact microsecond boundaries and never repeats the root', async () => {
    const threadId = '00000000-0000-4000-8000-000000000005';
    const boundary = {
      timestamp: '2026-09-02T00:00:00.000100Z',
      id: '00000000-0000-4000-8000-000000000200',
    };
    for (const [direction, first] of [
      ['older', 180],
      ['newer', 201],
    ] as const) {
      await expect(
        read({ mode: 'messages', threadId, direction, boundary }),
      ).resolves.toMatchObject({
        page: {
          messages: Array.from({ length: 20 }, (_, i) => ({
            id: `00000000-0000-4000-8000-${String(first + i).padStart(12, '0')}`,
          })),
          hasOlder: true,
          hasNewer: true,
        },
      });
    }
    await expect(
      read({ mode: 'location', messageId: threadId }),
    ).resolves.toMatchObject({
      page: { root: { id: threadId }, hasOlder: true, hasNewer: false },
    });
    await expect(
      read({
        mode: 'location',
        messageId: '00000000-0000-4000-8000-000000000999',
      }),
    ).resolves.toMatchObject({ card: null, page: null });
  });

  it('returns a truthful empty envelope and fails closed on unorderable retained metadata', async () => {
    await client.query(
      'UPDATE inbox_email_fixture SET "receivedAt" = NULL WHERE id = \'00000000-0000-4000-8000-000000000001\'',
    );
    await expect(read()).resolves.toMatchObject({
      orderingUnavailable: true,
      cards: [],
    });
    await client.query('DELETE FROM inbox_email_fixture');
    await expect(read()).resolves.toMatchObject({
      authorized: true,
      orderingUnavailable: false,
      cards: [],
      latestThreadId: null,
      hasOlderCards: false,
    });
  });

  it('invalidates a revoked older boundary rather than replaying stale group membership', async () => {
    const fixture = serviceFixture();
    const head = await fixture.service.listCards(fixture.request as never);
    const located = await fixture.service.locateMessage({
      ...fixture.request,
      snapshot: head.snapshot,
      messageId: '00000000-0000-4000-8000-000000000121',
    } as never);
    const olderCursor = located!.page.olderCursor!;
    await client.query(
      `UPDATE inbox_email_fixture SET "deletedAt" = now() WHERE "receivedAt" >= '2026-09-02T00:00:00Z' AND "receivedAt" < '2026-09-02T00:00:00.000002Z'`,
    );
    await expect(
      fixture.service.listCardMessages({
        ...fixture.request,
        snapshot: head.snapshot,
        threadId: located!.card.threadId,
        cursor: olderCursor,
      } as never),
    ).rejects.toThrow('Inbox history changed; reload history');
    const fresh = await fixture.service.listCards(fixture.request as never);
    await expect(
      fixture.service.listCardMessages({
        ...fixture.request,
        snapshot: fresh.snapshot,
        threadId: located!.card.threadId,
      } as never),
    ).resolves.toMatchObject({ threadId: located!.card.threadId });
  });

  it('retains a bounded route back from an empty older segment', async () => {
    await expect(
      read({
        mode: 'messages',
        threadId: '00000000-0000-4000-8000-000000000005',
        direction: 'older',
        boundary: {
          timestamp: '2026-09-02T00:00:00.000001Z',
          id: '00000000-0000-4000-8000-000000000101',
        },
      }),
    ).resolves.toMatchObject({
      page: { messages: [], hasOlder: false, hasNewer: true },
    });
  });

  it('rejects a boundary whose authorized tuple is gone instead of silently skipping history', async () => {
    await expect(
      read({
        mode: 'messages',
        threadId: '00000000-0000-4000-8000-000000000005',
        boundary: {
          timestamp: '2026-09-02T00:00:00.000100Z',
          id: '00000000-0000-4000-8000-000000000999',
        },
      }),
    ).resolves.toMatchObject({ cursorValid: false, page: null });
  });

  it('marks a newly retained earlier current root incompatible with a frozen start', async () => {
    const original = await read({ cutoff: '2026-09-08T00:00:00.123456Z' });
    await client.query(`INSERT INTO inbox_email_fixture (id, "messageThreadId", "receivedAt", "createdAt", subject, text, visibility, direction) VALUES (
      '00000000-0000-4000-8000-000000000999', '00000000-0000-4000-8000-000000000005',
      '2026-01-01T00:00:00Z', '2026-09-09T00:00:00Z', 'backfill', 'body', 'FULL', 'INCOMING')`);
    await expect(
      read({
        mode: 'messages',
        threadId: '00000000-0000-4000-8000-000000000005',
        cutoff: original.snapshotAt,
        fingerprint: original.fingerprint,
      }),
    ).resolves.toMatchObject({ rootChanged: true, page: null });
  });

  it('pages three native roots, not messages, in six-digit start order', async () => {
    await expect(read()).resolves.toMatchObject({
      cards: [3, 4, 5].map((i) => ({
        threadId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        startTimestamp: `2026-09-01T00:00:00.00000${i}Z`,
      })),
      hasOlderCards: true,
    });
  });
});
