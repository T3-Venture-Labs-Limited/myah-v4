import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { type EntityManager } from 'typeorm';

import {
  ConnectedAccountProvider,
  MessageFolderImportPolicy,
} from 'twenty-shared/types';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { type MessageChannelEntity } from 'src/engine/metadata-modules/message-channel/entities/message-channel.entity';
import { type MessageFolderEntity } from 'src/engine/metadata-modules/message-folder/entities/message-folder.entity';
import { type GetMessageListsResponse } from 'src/modules/messaging/message-import-manager/types/get-message-lists-response.type';

// This is deliberately Gmail-only. The other connectors cannot acquire READY
// from a normal mailbox sync until their own folder/UID enumeration is proven.
@Injectable()
export class MessagingEmailBaselineService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  private async manager(): Promise<EntityManager> {
    const dataSource =
      await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();
    if (!dataSource?.coreDataSource?.isInitialized)
      throw new Error('Core data source unavailable');
    // Baseline receipts and account incarnation live in core, not in a
    // permissioned workspace object repository.
    return dataSource.coreDataSource.manager;
  }

  private transactionQuery(tx: EntityManager) {
    const runner = tx.queryRunner;
    if (!runner?.isTransactionActive || runner.isReleased)
      throw new Error('Email baseline requires an active transaction');
    return runner.query.bind(runner);
  }

  private async hasSchema(manager: EntityManager): Promise<boolean> {
    const [row]: Array<{ name: string | null }> = await manager.query(
      `SELECT to_regclass('core."campaignEmailBaselineGeneration"') AS name`,
    );
    return !!row?.name;
  }

  private async hasIncarnationColumn(manager: EntityManager): Promise<boolean> {
    const [row]: Array<{ available: boolean }> = await manager.query(
      `SELECT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'core."connectedAccount"'::regclass
        AND attname = 'campaignEmailIncarnationId' AND NOT attisdropped) AS "available"`,
    );
    return !!row?.available;
  }

  async snapshotIncarnation(
    channel: MessageChannelEntity,
    workspaceId: string,
  ): Promise<string | null> {
    const manager = await this.manager();
    if (
      !(await this.hasSchema(manager)) ||
      !(await this.hasIncarnationColumn(manager))
    )
      return null;
    const [account]: Array<{ campaignEmailIncarnationId: string }> =
      await manager.query(
        `SELECT "campaignEmailIncarnationId" FROM core."connectedAccount"
       WHERE "id" = $1 AND "workspaceId" = $2`,
        [channel.connectedAccountId, workspaceId],
      );
    return account?.campaignEmailIncarnationId ?? null;
  }

  private scope(
    channel: MessageChannelEntity,
    folders: Pick<MessageFolderEntity, 'externalId' | 'isSynced'>[],
  ): string {
    const selected =
      channel.messageFolderImportPolicy ===
      MessageFolderImportPolicy.SELECTED_FOLDERS;
    return createHash('sha256')
      .update(
        JSON.stringify({
          policy: channel.messageFolderImportPolicy,
          folders: selected
            ? folders
                .filter((folder) => folder.isSynced)
                .map((folder) => folder.externalId)
                .sort()
            : [],
        }),
      )
      .digest('hex');
  }

  async needsInitialScan(
    channel: MessageChannelEntity,
    folders: Pick<MessageFolderEntity, 'externalId' | 'isSynced'>[],
    workspaceId: string,
  ): Promise<boolean> {
    if (channel.connectedAccount.provider !== ConnectedAccountProvider.GOOGLE)
      return false;
    const manager = await this.manager();
    if (!(await this.hasSchema(manager))) return false;
    if (!(await this.hasIncarnationColumn(manager))) return true;
    const [row]: Array<{
      scopeFingerprint: string;
      status: string;
      accountIncarnationId: string;
    }> = await manager.query(
      `SELECT "scopeFingerprint", "status", "accountIncarnationId" FROM core."campaignEmailBaselineGeneration"
       WHERE "workspaceId" = $1 AND "messageChannelId" = $2 AND "connectedAccountId" = $3 AND "isCurrent" = true`,
      [workspaceId, channel.id, channel.connectedAccountId],
    );
    return (
      row?.status !== 'READY' ||
      row.scopeFingerprint !== this.scope(channel, folders) ||
      row.accountIncarnationId !==
        (await this.snapshotIncarnation(channel, workspaceId))
    );
  }

  async recordEnumeration(
    channel: MessageChannelEntity,
    folders: Pick<MessageFolderEntity, 'externalId' | 'isSynced'>[],
    workspaceId: string,
    lists: GetMessageListsResponse,
    scannedIncarnationId?: string | null,
  ): Promise<string | null> {
    if (
      channel.connectedAccount.provider !== ConnectedAccountProvider.GOOGLE ||
      lists.length !== 1
    )
      return null;
    const cursor = lists[0].nextSyncCursor;
    // Empty Gmail list has no message-derived history cursor. It MUST NOT
    // certify an empty mailbox (nor a selected-folder policy with no folders).
    if (
      !cursor ||
      !scannedIncarnationId ||
      lists[0].initialFrontierVerified !== true ||
      !lists[0].messageExternalIds.length ||
      lists[0].previousSyncCursor
    )
      return null;
    const manager = await this.manager();
    if (!(await this.hasSchema(manager))) return null;
    return manager.transaction(async (tx) => {
      // FOR SHARE conflicts with the reconnect/reset account UPDATE. A scan
      // whose credential incarnation changed during the remote walk is inert.
      const [account]: Array<{ campaignEmailIncarnationId: string }> =
        await tx.query(
          `SELECT "campaignEmailIncarnationId" FROM core."connectedAccount"
         WHERE "id" = $1 AND "workspaceId" = $2 FOR SHARE`,
          [channel.connectedAccountId, workspaceId],
        );
      if (account?.campaignEmailIncarnationId !== scannedIncarnationId)
        return null;
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `campaign-email-baseline:${workspaceId}:${channel.id}`,
      ]);
      const [current]: Array<{
        id: string;
        status: string;
        scopeFingerprint: string;
        connectedAccountId: string;
        accountIncarnationId: string;
      }> = await tx.query(
        `SELECT "id", "status", "scopeFingerprint", "connectedAccountId", "accountIncarnationId" FROM core."campaignEmailBaselineGeneration"
         WHERE "workspaceId" = $1 AND "messageChannelId" = $2 AND "isCurrent" = true FOR UPDATE`,
        [workspaceId, channel.id],
      );
      if (
        current?.status === 'READY' &&
        current.scopeFingerprint === this.scope(channel, folders) &&
        current.connectedAccountId === channel.connectedAccountId &&
        current.accountIncarnationId === scannedIncarnationId
      )
        return null;
      if (current)
        await tx.query(
          `UPDATE core."campaignEmailBaselineGeneration" SET "status" = 'INVALID', "isCurrent" = false WHERE "id" = $1`,
          [current.id],
        );
      const [created]: Array<{ id: string }> = await tx.query(
        `INSERT INTO core."campaignEmailBaselineGeneration"
         ("workspaceId", "messageChannelId", "connectedAccountId", "accountIncarnationId", "provider", "scopeFingerprint", "status", "enumeratedAt", "finalCursors")
         VALUES ($1, $2, $3, $6, 'google', $4, 'ENUMERATED', now(), jsonb_build_object('gmailHistoryId', $5::text)) RETURNING "id"`,
        [
          workspaceId,
          channel.id,
          channel.connectedAccountId,
          this.scope(channel, folders),
          cursor,
          scannedIncarnationId,
        ],
      );
      await tx.query(
        `INSERT INTO core."campaignEmailBaselineItem" ("generationId", "providerMessageId")
         SELECT $1::uuid, unnest($2::text[]) ON CONFLICT DO NOTHING`,
        [created.id, [...new Set(lists[0].messageExternalIds)]],
      );
      return created.id;
    });
  }

  async recordAlreadyImported(
    workspaceId: string,
    channel: MessageChannelEntity,
    generationId: string | null,
    ids: string[],
  ): Promise<void> {
    if (!generationId || !ids.length) return;
    const manager = await this.manager();
    await manager.transaction((tx) =>
      this.recordDispositionsInTransaction(tx, {
        generationId,
        workspaceId,
        messageChannelId: channel.id,
        connectedAccountId: channel.connectedAccountId,
        listedIds: ids,
        importedIds: ids,
        excludedIds: [],
      }),
    );
  }

  async recordDispositionsInTransaction(
    tx: EntityManager,
    input: {
      generationId: string;
      workspaceId: string;
      messageChannelId: string;
      connectedAccountId: string;
      listedIds: string[];
      importedIds: string[];
      excludedIds: string[];
    },
  ): Promise<void> {
    const query = this.transactionQuery(tx);
    const [generation]: Array<{ id: string }> = await query(
      `SELECT "id" FROM core."campaignEmailBaselineGeneration" WHERE "id" = $1 AND "workspaceId" = $2
       AND "messageChannelId" = $3 AND "connectedAccountId" = $4 AND "isCurrent" = true AND "status" = 'ENUMERATED' FOR UPDATE`,
      [
        input.generationId,
        input.workspaceId,
        input.messageChannelId,
        input.connectedAccountId,
      ],
    );
    if (!generation) return; // A superseded list cannot change sealed evidence.
    const imported = new Set(input.importedIds);
    const excluded = new Set(input.excludedIds);
    for (const id of new Set(input.listedIds)) {
      const disposition = imported.has(id)
        ? 'IMPORTED'
        : excluded.has(id)
          ? 'EXCLUDED'
          : 'FAILED';
      const reason =
        disposition === 'EXCLUDED'
          ? 'IMPORT_FILTER'
          : disposition === 'FAILED'
            ? 'FETCH_MISSING_OR_FAILED'
            : null;
      await query(
        `UPDATE core."campaignEmailBaselineItem" SET "disposition" = $3, "reason" = $4, "updatedAt" = now()
         WHERE "generationId" = $1 AND "providerMessageId" = $2 AND "disposition" = 'LISTED'`,
        [generation.id, id, disposition, reason],
      );
    }
  }

  async finalize(
    workspaceId: string,
    channel: MessageChannelEntity,
    generationId: string | null,
  ): Promise<boolean> {
    if (!generationId) return false;
    const manager = await this.manager();
    if (!(await this.hasIncarnationColumn(manager))) return false;
    return manager.transaction(async (tx) => {
      const [account]: Array<{ campaignEmailIncarnationId: string }> =
        await tx.query(
          `SELECT "campaignEmailIncarnationId" FROM core."connectedAccount"
         WHERE "id" = $1 AND "workspaceId" = $2 FOR SHARE`,
          [channel.connectedAccountId, workspaceId],
        );
      if (!account) return false;
      // TypeORM's PostgreSQL raw UPDATE result is [returnedRows, rowCount],
      // including [[], 0] when unresolved items prevent READY.
      const [rows]: [Array<{ id: string }>, number] = await tx.query(
        `UPDATE core."campaignEmailBaselineGeneration" g SET "status" = 'READY', "completedAt" = now()
         WHERE g."id" = $1 AND g."workspaceId" = $2 AND g."messageChannelId" = $3
           AND g."connectedAccountId" = $4 AND g."accountIncarnationId" = $5
           AND g."isCurrent" = true AND g."status" = 'ENUMERATED'
           AND NOT EXISTS (SELECT 1 FROM core."campaignEmailBaselineItem" i WHERE i."generationId" = g."id"
             AND i."disposition" IN ('LISTED', 'FAILED')) RETURNING g."id"`,
        [
          generationId,
          workspaceId,
          channel.id,
          channel.connectedAccountId,
          account.campaignEmailIncarnationId,
        ],
      );
      return rows.length > 0;
    });
  }

  async verifyLiveInTransaction(
    tx: EntityManager,
    workspaceId: string,
    channel: MessageChannelEntity,
    generationId: string,
    candidateIds: string[],
  ): Promise<Set<string>> {
    if (
      channel.connectedAccount.provider !== ConnectedAccountProvider.GOOGLE ||
      !candidateIds.length
    )
      return new Set();
    const query = this.transactionQuery(tx);
    const [account]: Array<{ campaignEmailIncarnationId: string }> =
      await query(
        `SELECT "campaignEmailIncarnationId" FROM core."connectedAccount"
       WHERE "id" = $1 AND "workspaceId" = $2 FOR SHARE`,
        [channel.connectedAccountId, workspaceId],
      );
    if (!account) return new Set();
    const [ready]: Array<{
      id: string;
      completedAt: Date;
      scopeFingerprint: string;
    }> = await query(
      `SELECT "id", "completedAt", "scopeFingerprint" FROM core."campaignEmailBaselineGeneration"
       WHERE "id" = $1 AND "workspaceId" = $2 AND "messageChannelId" = $3 AND "connectedAccountId" = $4
         AND "accountIncarnationId" = $5 AND "isCurrent" = true AND "status" = 'READY' FOR SHARE`,
      [
        generationId,
        workspaceId,
        channel.id,
        channel.connectedAccountId,
        account.campaignEmailIncarnationId,
      ],
    );
    if (!ready) return new Set();
    const [currentChannel]: Array<{
      connectedAccountId: string;
      messageFolderImportPolicy: MessageFolderImportPolicy;
    }> = await query(
      `SELECT "connectedAccountId", "messageFolderImportPolicy" FROM core."messageChannel"
       WHERE "id" = $1 AND "workspaceId" = $2 FOR SHARE`,
      [channel.id, workspaceId],
    );
    if (
      !currentChannel ||
      currentChannel.connectedAccountId !== channel.connectedAccountId
    )
      return new Set();
    const folders: Array<Pick<MessageFolderEntity, 'externalId' | 'isSynced'>> =
      currentChannel.messageFolderImportPolicy ===
      MessageFolderImportPolicy.SELECTED_FOLDERS
        ? await query(
            `SELECT "externalId", "isSynced" FROM core."messageFolder"
            WHERE "messageChannelId" = $1 AND "workspaceId" = $2 FOR SHARE`,
            [channel.id, workspaceId],
          )
        : [];
    if (
      ready.scopeFingerprint !==
      this.scope(
        {
          ...channel,
          messageFolderImportPolicy: currentChannel.messageFolderImportPolicy,
        },
        folders,
      )
    )
      return new Set();
    const historical: Array<{ providerMessageId: string }> = await query(
      `SELECT "providerMessageId" FROM core."campaignEmailBaselineItem"
       WHERE "generationId" = $1 AND "providerMessageId" = ANY($2::text[])`,
      [ready.id, candidateIds],
    );
    const old = new Set(historical.map((row) => row.providerMessageId));
    return new Set(candidateIds.filter((id) => !old.has(id)));
  }

  async classifyNewIds(
    workspaceId: string,
    channel: MessageChannelEntity,
    candidates: string[],
  ): Promise<{
    generationId: string;
    completedAt: Date;
    ids: Set<string>;
  } | null> {
    if (
      channel.connectedAccount.provider !== ConnectedAccountProvider.GOOGLE ||
      !candidates.length
    )
      return null;
    const manager = await this.manager();
    if (!(await this.hasSchema(manager))) return null;
    if (!(await this.hasIncarnationColumn(manager))) return null;
    const [ready]: Array<{
      id: string;
      completedAt: Date;
      scopeFingerprint: string;
    }> = await manager.query(
      `SELECT g."id", g."completedAt", g."scopeFingerprint" FROM core."campaignEmailBaselineGeneration" g
       JOIN core."connectedAccount" a ON a."id" = g."connectedAccountId" AND a."workspaceId" = g."workspaceId"
       WHERE g."workspaceId" = $1 AND g."messageChannelId" = $2 AND g."connectedAccountId" = $3
         AND g."accountIncarnationId" = a."campaignEmailIncarnationId"
         AND g."isCurrent" = true AND g."status" = 'READY'`,
      [workspaceId, channel.id, channel.connectedAccountId],
    );
    if (
      !ready ||
      ready.scopeFingerprint !==
        this.scope(channel, channel.messageFolders ?? [])
    )
      return null;
    const historical: Array<{ providerMessageId: string }> =
      await manager.query(
        `SELECT "providerMessageId" FROM core."campaignEmailBaselineItem"
       WHERE "generationId" = $1 AND "providerMessageId" = ANY($2::text[])`,
        [ready.id, candidates],
      );
    const old = new Set(historical.map((row) => row.providerMessageId));
    return {
      generationId: ready.id,
      completedAt: ready.completedAt,
      ids: new Set(candidates.filter((id) => !old.has(id))),
    };
  }
}
