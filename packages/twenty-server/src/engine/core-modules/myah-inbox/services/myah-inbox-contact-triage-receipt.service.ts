import { Injectable } from '@nestjs/common';

import { isISO8601 } from 'class-validator';

import { buildSystemAuthContext } from 'src/engine/core-modules/auth/utils/build-system-auth-context.util';
import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import {
  MyahInboxContactTriageService,
  type MyahInboxTriageReceipt,
} from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-triage.service';
import {
  type MyahInboxInboundEvidence,
  type MyahInboxReceiptDrainScope,
} from 'src/engine/core-modules/myah-inbox/types/myah-inbox-contact-triage.types';
import {
  buildMyahInboxSourceKey,
  MYAH_INBOX_SOURCE_ADVISORY_LOCK_SQL,
} from 'src/engine/core-modules/myah-inbox/utils/myah-inbox-source-lock.util';
import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

export const MYAH_INBOX_TRIAGE_RECEIPT_RECOVERY_JOB_NAME =
  'MyahInboxTriageReceiptRecoveryJob';
export const MYAH_INBOX_TRIAGE_RECEIPT_BATCH_SIZE = 100;
@Injectable()
export class MyahInboxContactTriageReceiptService {
  constructor(
    private readonly globalWorkspaceOrmManager?: GlobalWorkspaceOrmManager,
    @InjectMessageQueue(MessageQueue.messagingQueue)
    private readonly messageQueueService?: MessageQueueService,
    private readonly myahInboxContactTriageService?: MyahInboxContactTriageService,
  ) {}

  async lockMigrationMarkerForSourcePersistenceInTransaction(
    manager: WorkspaceEntityManager,
  ): Promise<void> {
    const query = manager.queryRunner?.query.bind(manager.queryRunner);
    if (!query) {
      throw new Error(
        'Triage receipt recording requires an active transaction manager',
      );
    }
    await query("SELECT set_config('search_path', $1, true)", [
      getWorkspaceSchemaName(manager.internalContext.workspaceId),
    ]);
    const [marker] = (await query(
      'SELECT status FROM "myahInboxTriageMigration" WHERE id=true',
    )) as Array<{ status: 'MIGRATING' | 'READY' }>;

    // A producer that observes MIGRATING must own the marker's write lock
    // before any source lock. Otherwise a queued baseline FOR UPDATE can
    // deadlock with the producer's later marker-version update. READY is
    // monotonic, so its lighter key-share lock is sufficient.
    if (marker?.status === 'READY') {
      await query(
        'SELECT id FROM "myahInboxTriageMigration" WHERE id=true FOR KEY SHARE',
      );
    } else {
      await query(
        'SELECT id FROM "myahInboxTriageMigration" WHERE id=true FOR UPDATE',
      );
    }
  }

  async recordInTransaction(
    input: MyahInboxInboundEvidence,
    manager: WorkspaceEntityManager,
  ): Promise<void> {
    if (input.direction === 'UNKNOWN') return;
    await this.lockMigrationMarkerForSourcePersistenceInTransaction(manager);
    const query = manager.queryRunner?.query.bind(manager.queryRunner);
    if (!query) {
      throw new Error(
        'Triage receipt recording requires an active transaction manager',
      );
    }
    // This conflicts with the catch-up fence's FOR UPDATE lock. While catch-up
    // is active, touching the marker makes a final recheck that raced this
    // receipt retry; after READY, the receipt instead linearizes as recovery
    // work after the completed fence.
    await query(
      `UPDATE "myahInboxTriageMigration"
       SET version=version+1, "updatedAt"=now()
       WHERE id=true AND status <> 'READY'`,
    );
    if (input.firstPersistence) {
      await query(
        `INSERT INTO "myahInboxTriageTransitionReceipt" (
          channel, "persistedMessageId", "sourceRecordId", "sourceGenerationId", mode,
          direction, "providerOccurredAt", "originalCreatedAt", "normalizedOccurredAt", "orderKey", status
        ) VALUES (
          $1::text, $2::uuid, $3::uuid, $4::text, $5::text, $6::text,
          date_trunc('milliseconds', $7::timestamptz), $8::timestamptz,
          LEAST(COALESCE(date_trunc('milliseconds', $7::timestamptz), date_trunc('milliseconds', $8::timestamptz)), date_trunc('milliseconds', $8::timestamptz)),
          to_char(date_trunc('milliseconds', $8::timestamptz) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') || '|' || $1::text || '|' || $2::uuid::text,
          'PENDING'
        ) ON CONFLICT (channel, "persistedMessageId") DO NOTHING`,
        [
          input.channel,
          input.persistedMessageId,
          input.sourceRecordId,
          input.sourceGenerationId,
          input.mode,
          input.direction,
          sanitizeProviderOccurredAt(input.providerOccurredAt),
          input.originalCreatedAt,
        ],
      );
    }
    if (input.channel === 'EMAIL') {
      // Preserve every channel that made this receipt visible. The source
      // message and its association can be cleaned up while its transition
      // remains reflected by a Creator-wide tuple.
      await query(
        `INSERT INTO "myahInboxTriageEmailChannelProvenance" (
           "persistedMessageId", "messageChannelIds"
         )
         SELECT $1::uuid,
                COALESCE(
                  array_agg(DISTINCT association."messageChannelId")
                    FILTER (WHERE association."deletedAt" IS NULL),
                  ARRAY[]::uuid[]
                )
         FROM "messageChannelMessageAssociation" association
         WHERE association."messageId"=$1::uuid
         ON CONFLICT ("persistedMessageId") DO UPDATE
           SET "messageChannelIds" = ARRAY(
             SELECT DISTINCT channel_id
             FROM unnest(
               "myahInboxTriageEmailChannelProvenance"."messageChannelIds"
               || EXCLUDED."messageChannelIds"
             ) AS channel_id
             ORDER BY channel_id
           )`,
        [input.persistedMessageId],
      );
    }
  }

  async drain(scope: MyahInboxReceiptDrainScope): Promise<number> {
    const globalWorkspaceOrmManager = this.globalWorkspaceOrmManager;
    if (!globalWorkspaceOrmManager) {
      throw new Error('Triage receipt draining requires workspace ORM access');
    }

    return globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const dataSource =
          await globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();
        const drainBatch = async (manager: WorkspaceEntityManager) => {
          const query = (statement: string, parameters?: unknown[]) =>
            dataSource.query(statement, parameters, manager.queryRunner, {
              shouldBypassPermissionChecks: true,
            });
          await query("SELECT set_config('search_path', $1, true)", [
            getWorkspaceSchemaName(scope.workspaceId),
          ]);
          const [migration] = (await query(
            'SELECT status, "baselineFenceSequence" FROM "myahInboxTriageMigration" WHERE id=true FOR UPDATE',
          )) as {
            status: 'MIGRATING' | 'READY';
            baselineFenceSequence: string | null;
          }[];
          if (
            !migration ||
            migration.baselineFenceSequence === null ||
            (scope.purpose === 'CATCH_UP'
              ? migration.status !== 'MIGRATING'
              : migration.status !== 'READY')
          ) {
            return 0;
          }

          const receipts = (await query(
            `SELECT sequence, channel, "persistedMessageId", "sourceRecordId", "sourceGenerationId",
                    mode, direction,
                    to_char(date_trunc('milliseconds', "providerOccurredAt") AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "providerOccurredAt",
                    to_char(date_trunc('milliseconds', "originalCreatedAt") AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "originalCreatedAt",
                    to_char(date_trunc('milliseconds', "normalizedOccurredAt") AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "normalizedOccurredAt",
                    "orderKey"
             FROM "myahInboxTriageTransitionReceipt"
             WHERE status='PENDING' AND sequence <= $1::bigint
             ORDER BY "normalizedOccurredAt", "orderKey", sequence
             LIMIT $2::int
             FOR UPDATE SKIP LOCKED`,
            [scope.throughSequence, MYAH_INBOX_TRIAGE_RECEIPT_BATCH_SIZE],
          )) as MyahInboxTriageReceipt[];
          if (receipts.length === 0) return 0;
          if (!this.myahInboxContactTriageService) {
            throw new Error(
              'Triage receipt draining requires the triage service',
            );
          }

          // Acquire the complete batch source set before any source row or
          // triage row. Applying receipts may retain locks until commit, so
          // per-receipt acquisition would invert when another transaction owns
          // a later source and waits on an earlier tuple.
          const sources = [
            ...new Map(
              receipts.map((receipt) => {
                const sourceType =
                  receipt.channel === 'EMAIL'
                    ? ('EMAIL_THREAD' as const)
                    : ('INSTAGRAM_CONVERSATION' as const);
                const sourceKey = buildMyahInboxSourceKey(
                  sourceType,
                  receipt.sourceRecordId,
                );

                return [
                  sourceKey,
                  { sourceKey, sourceType, id: receipt.sourceRecordId },
                ];
              }),
            ).values(),
          ].sort((left, right) =>
            left.sourceKey.localeCompare(right.sourceKey),
          );
          for (const source of sources) {
            await query(MYAH_INBOX_SOURCE_ADVISORY_LOCK_SQL, [
              source.sourceKey,
            ]);
          }
          const identityKeys: string[] = [];
          for (const source of sources) {
            const sourceRows = (
              source.sourceType === 'EMAIL_THREAD'
                ? await query(
                    'SELECT id, "creatorId" FROM "messageThread" WHERE id=$1 FOR UPDATE',
                    [source.id],
                  )
                : await query(
                    'SELECT id, "creatorId" FROM "_myahSocialConversation" WHERE id=$1 FOR UPDATE',
                    [source.id],
                  )
            ) as Array<{ id: string; creatorId: string | null }>;
            identityKeys.push(
              source.sourceType === 'EMAIL_THREAD'
                ? `email-thread:${source.id}`
                : `instagram-conversation:${source.id}`,
            );
            if (sourceRows[0]?.creatorId) {
              identityKeys.push(`creator:${sourceRows[0].creatorId}`);
            }
          }
          // Source sets can be disjoint while still converging on the same
          // Creators. Lock the complete identity union once, lexically, before
          // applying any receipt and retaining tuple locks to commit.
          await this.myahInboxContactTriageService.lockIdentityKeysInTransaction(
            { identityKeys, manager },
          );

          for (const receipt of receipts) {
            await this.myahInboxContactTriageService.applyReceiptInTransaction(
              receipt,
              manager,
            );
            await query(
              `UPDATE "myahInboxTriageTransitionReceipt"
               SET status='COMPLETE', "completedAt"=now()
               WHERE sequence=$1::bigint AND status='PENDING'`,
              [receipt.sequence],
            );
          }

          return receipts.length;
        };

        if (typeof dataSource.transaction !== 'function') {
          return drainBatch(dataSource.manager as WorkspaceEntityManager);
        }

        return dataSource.transaction((manager) =>
          drainBatch(manager as WorkspaceEntityManager),
        );
      },
      buildSystemAuthContext({ workspace: { id: scope.workspaceId } as never }),
    );
  }

  async enqueueRecovery(workspaceId: string): Promise<void> {
    if (!this.messageQueueService) {
      throw new Error('Triage receipt recovery requires a message queue');
    }

    await this.messageQueueService.add(
      MYAH_INBOX_TRIAGE_RECEIPT_RECOVERY_JOB_NAME,
      {
        workspaceId,
      },
    );
  }
}

const sanitizeProviderOccurredAt = (value: string | null): string | null => {
  if (
    value === null ||
    value.includes('\0') ||
    !isISO8601(value, { strict: true, strictSeparator: true }) ||
    !/^(?!0000)\d{4}-/.test(value) ||
    !/([zZ]|[+-]\d{2}:\d{2})$/.test(value)
  ) {
    return null;
  }

  return value;
};
