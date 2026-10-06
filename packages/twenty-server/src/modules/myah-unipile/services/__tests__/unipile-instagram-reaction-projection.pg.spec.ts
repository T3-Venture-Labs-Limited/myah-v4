import { ConflictException } from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';

import { MyahInboxContactTriageSchemaService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-triage-schema.service';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { UnipileInstagramAccountBindingStatus } from 'src/modules/myah-unipile/entities/unipile-instagram-account-binding.entity';
import {
  UnipileInstagramProjectionService,
  type UnipileInstagramReactionProjectionInput,
} from 'src/modules/myah-unipile/services/unipile-instagram-projection.service';

const postgresUrl = process.env.MYAH_INBOX_TEST_POSTGRES_URL;
const describePostgres = postgresUrl ? describe : describe.skip;
const workspace = { id: '20202020-1c25-4d02-bf25-6aeccf7ea4f0' };
const schema = getWorkspaceSchemaName(workspace.id);
const conversationId = '00000000-0000-4000-8000-000000000101';
const outboundId = '00000000-0000-4000-8000-000000000102';
const inboundId = '00000000-0000-4000-8000-000000000103';
const binding = {
  id: '00000000-0000-4000-8000-000000000104',
  workspaceId: workspace.id,
  workspaceInstagramAccountRecordId: '00000000-0000-4000-8000-000000000105',
  unipileAccountId: 'account-1',
  instagramUserId: 'self-ig',
  status: UnipileInstagramAccountBindingStatus.ACTIVE,
  deactivatedAt: null,
};
const chat = {
  chatId: 'chat-1',
  accountId: binding.unipileAccountId,
  accountType: 'INSTAGRAM' as const,
  type: 'ONE_TO_ONE' as const,
  attendeeProviderId: 'creator-ig',
  name: null,
  timestamp: null,
};
const message = {
  messageId: 'outbound-1',
  accountId: binding.unipileAccountId,
  chatId: chat.chatId,
  senderId: binding.instagramUserId,
  isSender: 1 as const,
  text: 'Hello',
  timestamp: '2026-09-04T12:00:00.000Z',
  seen: false,
  delivered: true,
  hidden: false,
  deleted: false,
  isEvent: false,
  hasAttachments: false,
  attachmentCount: 0,
};
const reaction = (
  overrides: Partial<UnipileInstagramReactionProjectionInput> = {},
): UnipileInstagramReactionProjectionInput => ({
  workspace,
  binding,
  chat,
  message,
  actorProviderId: chat.attendeeProviderId,
  emoji: '👍',
  occurredAt: new Date('2026-09-04T12:01:00.000Z'),
  version: 'a'.repeat(64),
  ...overrides,
});

describePostgres('Instagram reaction projection (dedicated PostgreSQL)', () => {
  let pool: Pool;
  let activeBinding = true;
  let service: UnipileInstagramProjectionService;
  const creatorMessageTrigger = {
    notifyInbound: jest.fn().mockResolvedValue(undefined),
  };
  const receiptService = {
    isTriageSchemaProvisioned: jest.fn().mockResolvedValue(true),
    recordInTransaction: jest.fn().mockResolvedValue(undefined),
    lockMigrationMarkerForSourcePersistenceInTransaction: jest
      .fn()
      .mockResolvedValue(true),
  };
  const rows = async () => {
    // pi-lens-ignore: sql-injection — schema derives from the fixed test-only workspace UUID.
    const { rows } = await pool.query<{
      messageRecordId: string;
      emoji: string;
      version: string;
      viewedVersion: string | null;
    }>(
      `SELECT "messageRecordId", "emoji", "version", "viewedVersion" FROM "workspace_1wgvd1injqtife6y4rvfbu3n4"."myahInboxInstagramReaction" ORDER BY "messageRecordId"`,
    );
    return rows;
  };

  beforeAll(async () => {
    const endpoint = new URL(postgresUrl!);
    if (
      endpoint.hostname !== '127.0.0.1' ||
      endpoint.port !== '15432' ||
      endpoint.pathname !== '/default' ||
      endpoint.search ||
      endpoint.hash ||
      !['postgres:', 'postgresql:'].includes(endpoint.protocol)
    ) {
      throw new Error('Reaction projection test database is not allowlisted');
    }
    // Jest's globally faked nextTick stalls pg-pool when it reuses an idle client.
    jest.useRealTimers();
    pool = new Pool({
      connectionString: postgresUrl,
      max: 3,
      statement_timeout: 5000,
      connectionTimeoutMillis: 3000,
    });
    const { rows: database } = await pool.query<{ name: string }>(
      'SELECT current_database() AS name',
    );
    if (database[0]?.name !== 'default')
      throw new Error('Unexpected test database');
    await pool.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    // pi-lens-ignore: sql-injection — schema derives from the fixed test-only workspace UUID.
    expect(schema).toBe('workspace_1wgvd1injqtife6y4rvfbu3n4');
    await pool.query(`CREATE SCHEMA "workspace_1wgvd1injqtife6y4rvfbu3n4";
      CREATE TABLE "workspace_1wgvd1injqtife6y4rvfbu3n4"."myahSocialConversation" (
        id uuid PRIMARY KEY, "creatorId" uuid, "instagramAccountId" uuid, provider text,
        "providerConversationId" text, "recipientIgsid" text, "deletedAt" timestamptz
      );
      CREATE TABLE "workspace_1wgvd1injqtife6y4rvfbu3n4"."myahSocialMessage" (
        id uuid PRIMARY KEY, "conversationId" uuid, provider text,
        "providerMessageId" text, "deletedAt" timestamptz,
        "createdAt" timestamptz DEFAULT now(), "text" text, "direction" text,
        "sentVia" text, "providerCreatedAt" timestamptz, "deliveryState" text,
        "deliveryStateUpdatedAt" timestamptz, "hasAttachments" boolean,
        "attachmentCount" integer, "createdBySource" text, "createdByWorkspaceMemberId" uuid,
        "createdByName" text, "createdByContext" jsonb, "updatedBySource" text,
        "updatedByWorkspaceMemberId" uuid, "updatedByName" text, "updatedByContext" jsonb
      );`);
    await new MyahInboxContactTriageSchemaService().ensureReactionTable(
      { query: (sql: string) => pool.query(sql) } as never,
      workspace.id,
    );
    // pi-lens-ignore: sql-injection — schema derives from the fixed test-only workspace UUID.
    await pool.query(
      `INSERT INTO "workspace_1wgvd1injqtife6y4rvfbu3n4"."myahSocialConversation"
      (id, "instagramAccountId", provider, "providerConversationId", "recipientIgsid")
      VALUES ($1, $2, 'UNIPILE', $3, $4)`,
      [
        conversationId,
        binding.workspaceInstagramAccountRecordId,
        chat.chatId,
        chat.attendeeProviderId,
      ],
    );
    // pi-lens-ignore: sql-injection — schema derives from the fixed test-only workspace UUID.
    await pool.query(
      `INSERT INTO "workspace_1wgvd1injqtife6y4rvfbu3n4"."myahSocialMessage"
      (id, "conversationId", provider, "providerMessageId") VALUES
      ($1, $3, 'UNIPILE', 'outbound-1'), ($2, $3, 'UNIPILE', 'inbound-1')`,
      [outboundId, inboundId, conversationId],
    );
    const dataSource = {
      manager: { internalContext: { workspaceId: workspace.id } },
      query: async (
        sql: string,
        parameters: unknown[],
        queryRunner?: PoolClient,
      ) => (await (queryRunner ?? pool).query(sql, parameters)).rows,
      transaction: async <T>(
        callback: (manager: { queryRunner: PoolClient }) => Promise<T>,
      ): Promise<T> => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const result = await callback({ queryRunner: client });
          await client.query('COMMIT');
          return result;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      },
    };
    service = new UnipileInstagramProjectionService(
      {
        executeInWorkspaceContext: async (callback: () => Promise<unknown>) =>
          callback(),
        getGlobalWorkspaceDataSource: async () => dataSource,
      } as never,
      {
        withLock: async (
          _scope: unknown,
          callback: (manager: unknown) => Promise<unknown>,
        ) =>
          callback({
            getRepository: () => ({
              findOne: async () => (activeBinding ? binding : null),
            }),
          }),
      } as never,
      {
        ensureSourceContactInTransaction: jest
          .fn()
          .mockResolvedValue(undefined),
      } as never,
      receiptService as never,
      { get: () => creatorMessageTrigger } as never,
    );
  }, 15000);

  afterAll(async () => {
    if (!pool) return;
    try {
      // pi-lens-ignore: sql-injection — this schema belongs solely to this disposable test fixture.
      await pool.query(
        `DROP SCHEMA IF EXISTS "workspace_1wgvd1injqtife6y4rvfbu3n4" CASCADE`,
      );
    } finally {
      await pool.end();
      jest.useFakeTimers();
    }
  });

  it('stores one reaction and skips its companion notice without a new message or reply trigger', async () => {
    expect(await service.applyVerifiedReaction(reaction())).toBe(true);
    const before = await pool.query(
      'SELECT count(*)::int AS count FROM "workspace_1wgvd1injqtife6y4rvfbu3n4"."myahSocialMessage"',
    );
    await expect(
      service.upsertVerifiedMessage({
        workspace,
        binding,
        chat,
        conversationRecordId: conversationId,
        message: {
          ...message,
          messageId: 'companion-notice',
          senderId: chat.attendeeProviderId,
          isSender: 0,
          isEvent: true,
          hidden: false,
          text: 'Reacted 👍 to your message',
        },
        triageMode: 'LIVE',
        sourceGenerationId: 'webhook:synthetic-notice',
      }),
    ).resolves.toEqual({ skipped: 'PROVIDER_NOTICE' });
    expect(await rows()).toEqual([
      expect.objectContaining({ messageRecordId: outboundId, emoji: '👍' }),
    ]);
    const after = await pool.query(
      'SELECT count(*)::int AS count FROM "workspace_1wgvd1injqtife6y4rvfbu3n4"."myahSocialMessage"',
    );
    expect(after.rows).toEqual(before.rows);
    expect(receiptService.recordInTransaction).not.toHaveBeenCalled();
    expect(creatorMessageTrigger.notifyInbound).not.toHaveBeenCalled();
    await pool.query(
      'DELETE FROM "workspace_1wgvd1injqtife6y4rvfbu3n4"."myahInboxInstagramReaction"',
    );
  });

  it('a later receipt replaces the emoji even when its hash sorts earlier', async () => {
    await service.applyVerifiedReaction(reaction({ version: 'f'.repeat(64) }));
    expect(
      await service.applyVerifiedReaction(
        reaction({
          emoji: '❤',
          version: '0'.repeat(64),
          occurredAt: new Date('2026-09-04T12:02:00.000Z'),
        }),
      ),
    ).toBe(true);
    expect(await rows()).toEqual([
      expect.objectContaining({ emoji: '❤', version: '0'.repeat(64) }),
    ]);
    await pool.query(
      'DELETE FROM "workspace_1wgvd1injqtife6y4rvfbu3n4"."myahInboxInstagramReaction"',
    );
  });

  it('attaches only to existing inbound/outbound parents and refuses untrusted actors or hidden parents', async () => {
    expect(await service.applyVerifiedReaction(reaction())).toBe(true);
    expect(
      await service.applyVerifiedReaction(
        reaction({
          message: {
            ...message,
            messageId: 'inbound-1',
            senderId: chat.attendeeProviderId,
            isSender: 0,
          },
          version: 'b'.repeat(64),
        }),
      ),
    ).toBe(true);
    expect(
      await service.applyVerifiedReaction(
        reaction({ message: { ...message, messageId: 'missing' } }),
      ),
    ).toBe(false);
    for (const invalid of [
      reaction({ actorProviderId: binding.instagramUserId }),
      reaction({ message: { ...message, hidden: true } }),
      reaction({
        binding: {
          ...binding,
          workspaceId: '00000000-0000-4000-8000-000000000099',
        },
      }),
    ]) {
      await expect(
        service.applyVerifiedReaction(invalid),
      ).rejects.toBeInstanceOf(ConflictException);
    }
    expect(await rows()).toEqual([
      expect.objectContaining({ messageRecordId: outboundId, emoji: '👍' }),
      expect.objectContaining({ messageRecordId: inboundId, emoji: '👍' }),
    ]);
  });

  it('keeps one current version under duplicate, older and concurrent deliveries without re-alerting for replay', async () => {
    // pi-lens-ignore: sql-injection — schema derives from the fixed test-only workspace UUID.
    await pool.query(
      `UPDATE "workspace_1wgvd1injqtife6y4rvfbu3n4"."myahInboxInstagramReaction" SET "viewedVersion" = "version"`,
    );
    const older = reaction({
      occurredAt: new Date('2026-09-04T12:00:00.000Z'),
      version: '0'.repeat(64),
    });
    const newer = reaction({
      occurredAt: new Date('2026-09-04T12:02:00.000Z'),
      version: 'c'.repeat(64),
      emoji: '❤️',
    });
    expect(await service.applyVerifiedReaction(reaction())).toBe(false);
    expect(await service.applyVerifiedReaction(older)).toBe(false);
    expect((await rows())[0].viewedVersion).toBe('a'.repeat(64));
    const result = await Promise.all([
      service.applyVerifiedReaction(older),
      service.applyVerifiedReaction(newer),
    ]);
    expect(result).toContain(true);
    expect((await rows())[0]).toMatchObject({
      emoji: '❤️',
      version: 'c'.repeat(64),
      viewedVersion: 'a'.repeat(64),
    });
    expect(await service.applyVerifiedReaction(older)).toBe(false);
    expect(await service.applyVerifiedReaction(newer)).toBe(false);
    expect(await rows()).toHaveLength(2);
  });

  it('does not mutate after account deactivation or a deleted local parent', async () => {
    activeBinding = false;
    await expect(
      service.applyVerifiedReaction(reaction({ version: 'd'.repeat(64) })),
    ).rejects.toBeInstanceOf(ConflictException);
    activeBinding = true;
    // pi-lens-ignore: sql-injection — schema derives from the fixed test-only workspace UUID.
    await pool.query(
      `UPDATE "workspace_1wgvd1injqtife6y4rvfbu3n4"."myahSocialMessage" SET "deletedAt" = now() WHERE id = $1`,
      [outboundId],
    );
    expect(
      await service.applyVerifiedReaction(
        reaction({ version: 'd'.repeat(64) }),
      ),
    ).toBe(false);
    expect((await rows())[0].version).toBe('c'.repeat(64));
  });
});
