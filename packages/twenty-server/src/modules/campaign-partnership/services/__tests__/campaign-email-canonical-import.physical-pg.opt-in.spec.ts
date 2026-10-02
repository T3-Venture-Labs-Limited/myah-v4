import { createHash, randomUUID } from 'node:crypto';

import { DataSource, type QueryRunner } from 'typeorm';

import { rawDataSource } from 'src/database/typeorm/raw/raw.datasource';
import { connectionSource } from 'src/database/typeorm/core/core.datasource';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { CampaignEmailInboundHeldWorkService } from 'src/modules/campaign-partnership/services/campaign-email-inbound-held-work.service';
import { MessagingEmailBaselineService } from 'src/modules/messaging/message-import-manager/services/messaging-email-baseline.service';
import { MessagingSaveMessagesAndEnqueueContactCreationService } from 'src/modules/messaging/message-import-manager/services/messaging-save-messages-and-enqueue-contact-creation.service';

// One-shot committed synthetic fixture, never integration Jest/global setup.
// The SQL-backed persistence adapter is deliberately NOT proof of the native
// MessagingMessageService repository, triage or authenticated Inbox boundary.
const enabled = process.env.MYAH334_COLLISION_CANONICAL_OPT_IN === '1';
const root =
  '/home/superdao/myah-v4/.worktrees/daryll/myah-392-manage-creator-partnerships-from-reply-through-fulfillment';
const envFile =
  '/home/superdao/.local/share/myah-scratch/myah334-frontier-20260928/collision-clean.env';
const dbName = 'myah334_collision_clean_20260928';
const marker = 'MYAH334_COLLISION_CLEAN_20260928_TASK_OWNED';

(enabled ? it : it.skip)(
  'commits one canonical importer HELD and exact duplicate replay without precommit queue',
  async () => {
    jest.useRealTimers();
    const raw =
      'url' in rawDataSource.options ? rawDataSource.options.url : undefined;
    const core =
      'url' in connectionSource.options
        ? connectionSource.options.url
        : undefined;
    if (
      !raw ||
      raw !== core ||
      raw !== process.env.PG_DATABASE_URL ||
      process.env.TWENTY_SERVER_INTEGRATION_ENV_FILE !== envFile ||
      process.env.NODE_ENV !== 'test' ||
      !process.argv.some((arg) => arg.includes('jest')) ||
      ![root, `${root}/packages/twenty-server`].includes(process.cwd())
    )
      throw new Error(
        'Refusing canonical fixture: compiled raw/core selector or Jest process mismatch',
      );
    const pg = new URL(raw);
    const redis = new URL(process.env.REDIS_URL ?? '');
    if (
      pg.protocol !== 'postgres:' ||
      pg.hostname !== '127.0.0.1' ||
      pg.port !== '32788' ||
      pg.pathname !== `/${dbName}` ||
      pg.search ||
      pg.hash ||
      redis.protocol !== 'redis:' ||
      redis.hostname !== '127.0.0.1' ||
      redis.port !== '32789' ||
      redis.pathname !== '/5' ||
      redis.search ||
      redis.hash ||
      (process.env.REDIS_QUEUE_URL &&
        process.env.REDIS_QUEUE_URL !== process.env.REDIS_URL)
    )
      throw new Error(
        'Refusing canonical fixture: exact PG/Redis resource mismatch',
      );
    const source = new DataSource({ type: 'postgres', url: raw });
    let runner: QueryRunner | undefined;
    try {
      await source.initialize();
      runner = source.createQueryRunner();
      await runner.connect();
      const [identity]: Array<{ db: string; marker: string; version: string }> =
        await runner.query(
          `SELECT current_database() db, shobj_description(oid,'pg_database') marker,
            current_setting('server_version_num') version
           FROM pg_database WHERE datname=current_database()`,
        );
      if (
        identity?.db !== dbName ||
        identity.marker !== marker ||
        !identity.version.startsWith('16')
      )
        throw new Error(
          'Refusing canonical fixture: server PG16 shared-object marker mismatch',
        );
      const [before]: Array<{
        receipts: string;
        work: string;
        collisions: string;
        workspace: string;
      }> = await runner.query(
        `SELECT (SELECT count(*)::text FROM core."upgradeMigration") receipts,
            (SELECT count(*)::text FROM core."campaignPartnershipWorkItem") work,
            (SELECT count(*)::text FROM core."campaignEmailWorkCollision") collisions,
            (SELECT count(*)::text FROM core."workspace") workspace`,
      );
      if (
        before.receipts !== '143' ||
        before.work !== '0' ||
        before.collisions !== '0' ||
        before.workspace !== '1'
      )
        throw new Error(
          'Refusing canonical fixture: fresh native fixture prerequisite changed',
        );
      const [selected]: Array<{
        workspaceId: string;
        channelId: string;
        accountId: string;
        incarnationId: string;
        recipient: string;
      }> = await runner.query(
        `SELECT a."workspaceId", ch."id" "channelId", a."id" "accountId",
           a."campaignEmailIncarnationId" "incarnationId", lower(a."handle") recipient
         FROM core."connectedAccount" a JOIN core."messageChannel" ch
           ON ch."connectedAccountId"=a."id" AND ch."workspaceId"=a."workspaceId"
         WHERE a."provider"='google' AND a."campaignEmailIncarnationId" IS NOT NULL
           AND ch."messageFolderImportPolicy"='ALL_FOLDERS' AND ch."type"='EMAIL'
         ORDER BY ch."id" LIMIT 1`,
      );
      if (!selected?.recipient || !selected.incarnationId)
        throw new Error(
          'Marked workspace lacks synthetic qualified Gmail channel',
        );
      await runner.startTransaction();
      const schema = getWorkspaceSchemaName(selected.workspaceId);
      await runner.query("SELECT set_config('search_path',$1,true)", [schema]);
      const scopeFingerprint = createHash('sha256')
        .update(JSON.stringify({ policy: 'ALL_FOLDERS', folders: [] }))
        .digest('hex');
      const [generation]: Array<{ id: string }> = await runner.query(
        `INSERT INTO core."campaignEmailBaselineGeneration"
          ("workspaceId","messageChannelId","connectedAccountId","accountIncarnationId",
           "provider","scopeFingerprint","status","isCurrent","startedAt","enumeratedAt",
           "completedAt","finalCursors")
         VALUES ($1,$2,$3,$4,'google',$5,'READY',true,
           now()-interval '3 hours',now()-interval '2 hours',now()-interval '1 hour',
           '{"synthetic-final":"cursor"}'::jsonb) RETURNING "id"`,
        [
          selected.workspaceId,
          selected.channelId,
          selected.accountId,
          selected.incarnationId,
          scopeFingerprint,
        ],
      );
      const [creator]: Array<{ id: string }> = await runner.query(
        `INSERT INTO "creator" ("name") VALUES ('MYAH334 synthetic importer fixture') RETURNING "id"`,
      );
      const [thread]: Array<{ id: string }> = await runner.query(
        `INSERT INTO "messageThread" ("creatorId") VALUES ($1) RETURNING "id"`,
        [creator.id],
      );
      const providerId = `myah334-canonical-${randomUUID()}`;
      const providerThread = `myah334-thread-${randomUUID()}`;
      const sender = 'myah334-canonical@example.test';
      const occurred = new Date(Date.now() - 20000);
      const message = {
        externalId: providerId,
        messageThreadExternalId: providerThread,
        direction: 'INCOMING',
        isDraft: false,
        providerOccurredAt: occurred,
        participants: [
          { role: 'FROM', handle: sender },
          { role: 'TO', handle: selected.recipient },
        ],
      };
      const channel = {
        id: selected.channelId,
        connectedAccountId: selected.accountId,
        connectedAccount: { provider: 'google' },
        messageFolderImportPolicy: 'ALL_FOLDERS',
        isContactAutoCreationEnabled: false,
        excludeNonProfessionalEmails: false,
        contactAutoCreationPolicy: 'NONE',
      };
      const account = {
        id: selected.accountId,
        handle: selected.recipient,
        handleAliases: [],
      };
      const queueCalls: unknown[] = [];
      let persistedMessageId: string | undefined;
      const sqlBackedCanonicalAdapter = {
        saveMessagesWithinTransaction: async () => {
          if (!persistedMessageId) {
            const [saved]: Array<{ id: string }> = await runner!.query(
              `INSERT INTO "message" ("messageThreadId","receivedAt")
               VALUES ($1,now()-interval '1 second') RETURNING "id"`,
              [thread.id],
            );
            persistedMessageId = saved.id;
            await runner!.query(
              `INSERT INTO "messageChannelMessageAssociation"
                ("messageId","messageThreadId","messageChannelId","messageExternalId",
                 "messageThreadExternalId","direction") VALUES ($1,$2,$3,$4,$5,'INCOMING')`,
              [
                saved.id,
                thread.id,
                selected.channelId,
                providerId,
                providerThread,
              ],
            );
          }
          return {
            messageExternalIdsAndIdsMap: new Map([
              [providerId, persistedMessageId],
            ]),
            messageExternalIdToMessageChannelMessageAssociationIdMap: new Map(),
            messageExternalIdToMessageThreadIdMap: new Map([
              [providerId, thread.id],
            ]),
            messageExternalIdToPersistenceInfoMap: new Map([
              [
                providerId,
                {
                  createdAt: new Date().toISOString(),
                  direction: 'INCOMING',
                  wasInserted: true,
                  messageThreadId: thread.id,
                },
              ],
            ]),
          };
        },
      };
      const importer =
        new MessagingSaveMessagesAndEnqueueContactCreationService(
          {
            add: async (...args: unknown[]) => {
              queueCalls.push(args);
            },
          } as never,
          sqlBackedCanonicalAdapter as never,
          {
            saveMessageParticipants: async () => {
              if (!persistedMessageId)
                throw new Error('Canonical Message not persisted');
              for (const participant of message.participants) {
                await runner!.query(
                  `INSERT INTO "messageParticipant" ("messageId","role","handle")
               SELECT $1,$2,$3 WHERE NOT EXISTS
                 (SELECT 1 FROM "messageParticipant" WHERE "messageId"=$1 AND "role"=$2 AND "handle"=$3)`,
                  [persistedMessageId, participant.role, participant.handle],
                );
              }
            },
          } as never,
          { saveMessageFolderAssociations: async () => undefined } as never,
          {} as never,
          {} as never,
          {
            lockMigrationMarkerForSourcePersistenceInTransaction: async () =>
              false,
          } as never,
          undefined,
          new MessagingEmailBaselineService({} as never),
          new CampaignEmailInboundHeldWorkService(),
        );
      const sourceInput = {
        mode: 'LIVE',
        generationId: randomUUID(),
        liveBaselineGenerationId: generation.id,
        liveMessageExternalIds: [providerId],
      };
      const first = await importer.saveMessagesAndEnqueueContactCreation(
        [message] as never,
        channel as never,
        account as never,
        selected.workspaceId,
        sourceInput as never,
        runner.manager as never,
      );
      expect(first?.messageExternalIdsAndIdsMap.get(providerId)).toBe(
        persistedMessageId,
      );
      const second = await importer.saveMessagesAndEnqueueContactCreation(
        [message] as never,
        channel as never,
        account as never,
        selected.workspaceId,
        sourceInput as never,
        runner.manager as never,
      );
      expect(second?.messageExternalIdsAndIdsMap.get(providerId)).toBe(
        persistedMessageId,
      );
      const [inside]: Array<{ total: string; state: string; reason: string }> =
        await runner.query(
          `SELECT (SELECT count(*)::text FROM core."campaignPartnershipWorkItem") total,
            "state", "reason" FROM core."campaignPartnershipWorkItem"
           WHERE "workspaceId"=$1 AND "providerMessageId"=$2`,
          [selected.workspaceId, providerId],
        );
      expect(inside).toMatchObject({
        total: '1',
        state: 'HELD',
        reason: 'NO_EXACT_BINDING',
      });
      expect(queueCalls).toHaveLength(0);
      await runner.commitTransaction();
      const [after]: Array<{ receipts: string; total: string; state: string }> =
        await runner.query(
          `SELECT (SELECT count(*)::text FROM core."upgradeMigration") receipts,
            (SELECT count(*)::text FROM core."campaignPartnershipWorkItem") total,
            "state" FROM core."campaignPartnershipWorkItem" WHERE "providerMessageId"=$1`,
          [providerId],
        );
      expect(after).toMatchObject({
        receipts: '143',
        total: '1',
        state: 'HELD',
      });
      expect(queueCalls).toHaveLength(0);
    } finally {
      if (runner?.isTransactionActive) await runner.rollbackTransaction();
      if (runner && !runner.isReleased) await runner.release();
      if (source.isInitialized) await source.destroy();
    }
  },
  30000,
);
