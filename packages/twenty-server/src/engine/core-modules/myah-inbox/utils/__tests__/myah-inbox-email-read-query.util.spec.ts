import { Client } from 'pg';
import { DataSource } from 'typeorm';
import {
  PermissionsException,
  PermissionsExceptionCode,
} from 'src/engine/metadata-modules/permissions/permissions.exception';
import { MyahInboxContactEmailQueryService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-email-query.service';
import { MessageVisibilityPolicyService } from 'src/modules/messaging/common/query-hooks/message/message-visibility-policy.service';
import { encodeMyahInboxContactId } from 'src/engine/core-modules/myah-inbox/utils/myah-inbox-contact-id.util';
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
      endpoint.port !== '15432' ||
      endpoint.pathname !== '/default' ||
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
    await client.query(`ALTER TABLE inbox_email_fixture ADD "deletedAt" timestamptz, ADD "isDraft" boolean DEFAULT FALSE, ADD readable boolean DEFAULT TRUE;
      CREATE TEMP TABLE inbox_thread_fixture ON COMMIT DROP AS SELECT DISTINCT "messageThreadId" AS id, '00000000-0000-4000-8000-000000000050'::uuid AS "creatorId", NULL::uuid AS "myahCampaignId", NULL::timestamptz AS "deletedAt", TRUE AS readable FROM inbox_email_fixture;
      CREATE TEMP TABLE inbox_context_fixture (id uuid, name text, "deletedAt" timestamptz, readable boolean DEFAULT TRUE) ON COMMIT DROP;
      INSERT INTO inbox_context_fixture (id, name) VALUES ('00000000-0000-4000-8000-000000000050','Contact'), ('00000000-0000-4000-8000-000000000051','Member');
      CREATE TEMP TABLE inbox_participant_fixture (id uuid, "messageId" uuid, role text, handle text, "displayName" text, "deletedAt" timestamptz, readable boolean DEFAULT TRUE) ON COMMIT DROP;
      CREATE TEMP TABLE inbox_channel_fixture (id uuid, "workspaceId" uuid, "connectedAccountId" uuid, type text, visibility text) ON COMMIT DROP;
      INSERT INTO inbox_channel_fixture VALUES ('00000000-0000-4000-8000-000000000052', '00000000-0000-4000-8000-000000000053', NULL, 'EMAIL', 'SHARE_EVERYTHING');
      INSERT INTO inbox_context_fixture (id, name) VALUES ('00000000-0000-4000-8000-000000000056','Readable campaign');
      UPDATE inbox_thread_fixture SET "myahCampaignId" = '00000000-0000-4000-8000-000000000056';
      INSERT INTO inbox_participant_fixture (id, "messageId", role, handle) SELECT id, id, 'FROM', 'creator@example.test' FROM inbox_email_fixture;
      CREATE TEMP TABLE inbox_account_fixture (id uuid, "workspaceId" uuid, "userWorkspaceId" uuid) ON COMMIT DROP;
      CREATE TEMP TABLE inbox_association_fixture ON COMMIT DROP AS SELECT id, id AS "messageId", '00000000-0000-4000-8000-000000000052'::uuid AS "messageChannelId", direction, NULL::timestamptz AS "deletedAt" FROM inbox_email_fixture;
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

  const serviceFixture = (denied = new Set<string>()) => {
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
          const fixtureSql = sql
            .replace(
              /"workspace_[^"]+"\."messageChannelMessageAssociation"/g,
              'pg_temp.inbox_association_fixture',
            )
            .replace(/core\."messageChannel"/g, 'pg_temp.inbox_channel_fixture')
            .replace(
              /core\."connectedAccount"/g,
              'pg_temp.inbox_account_fixture',
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
      ),
    };
  };

  it('executes the complete service authorization, projection and hydration envelope in one statement per read', async () => {
    const fixture = serviceFixture();
    const head = await fixture.service.listCards(fixture.request as never);
    expect(head.cards.map((card) => card.threadId)).toEqual(
      [3, 4, 5].map(
        (i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      ),
    );
    expect(fixture.statements()).toBe(1);
    expect(head.cards[2].campaignLabel).toBe('Readable campaign');
    const page = await fixture.service.listCardMessages({
      ...fixture.request,
      threadId: head.cards[2].threadId,
      snapshot: head.snapshot,
    } as never);
    expect(page.messages).toHaveLength(20);
    expect(page.messages[0].receivedAt).toBe('2026-09-02T00:00:00.000181Z');
    expect(page.olderCursor).not.toBeNull();
    expect(page.root.participants).toEqual([
      { role: 'FROM', handle: 'creator@example.test', displayName: null },
    ]);
    expect(fixture.statements()).toBe(2);
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
        sql: `authorized_email AS (SELECT id, "messageThreadId", "receivedAt", "createdAt", visibility, direction FROM inbox_email_fixture),
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
    const result = await client.query(query.sql, query.parameters);
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
      id: '00000000-0000-4000-8000-000000000003',
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

  it('encodes the authorized boundary when an older page becomes empty', async () => {
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
    const empty = await fixture.service.listCardMessages({
      ...fixture.request,
      snapshot: head.snapshot,
      threadId: located!.card.threadId,
      cursor: olderCursor,
    } as never);
    expect(empty.messages).toEqual([]);
    expect(empty.newerCursor).not.toBeNull();
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
