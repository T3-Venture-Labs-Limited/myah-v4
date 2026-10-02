import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { v5, validate as isUuid } from 'uuid';

import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

export type CanonicalEmailInboundSource = {
  workspaceId: string;
  messageId: string;
  threadId: string;
  channelId: string;
  connectedAccountId: string;
  generationId: string; // independently verified READY per-ID generation, never Inbox mode
  providerMessageId: string;
  providerThreadId: string;
  from: string;
  to: string;
  providerOccurredAt: Date;
};

/** Importer transaction seam. This only creates a neutral hold, NEVER an
 * eligible proposal. A later authenticated action must check role, control,
 * binding and original READY generation before promoting the same receipt. */
@Injectable()
export class CampaignEmailInboundHeldWorkService {
  async recordInTransaction(
    source: CanonicalEmailInboundSource,
    manager: WorkspaceEntityManager,
  ): Promise<'SKIPPED' | 'HELD'> {
    const runner = manager.queryRunner;
    if (!runner?.isTransactionActive || runner.isReleased)
      throw new Error(
        'Campaign Email work requires the canonical import transaction',
      );
    if (
      ![
        source.workspaceId,
        source.messageId,
        source.threadId,
        source.channelId,
        source.connectedAccountId,
        source.generationId,
      ].every(isUuid) ||
      ![
        source.providerMessageId,
        source.providerThreadId,
        source.from,
        source.to,
      ].every(
        (value) => typeof value === 'string' && value.trim().length > 0,
      ) ||
      source.to !== source.to.trim().toLowerCase() ||
      source.providerThreadId !== source.providerThreadId.trim() ||
      !(source.providerOccurredAt instanceof Date) ||
      !Number.isFinite(source.providerOccurredAt.getTime())
    )
      return 'SKIPPED';
    // Older workspaces are not upgraded by import. The actual command receipt and
    // contract are checked by admission; this defensive gate leaves ordinary mail safe.
    const [shape]: Array<{ present: number }> = await runner.query(
      `SELECT count(*)::integer AS present FROM information_schema.columns WHERE table_schema = 'core'
       AND table_name = 'campaignPartnershipWorkItem' AND column_name = ANY($1::text[])
       AND to_regclass('core."UQ_CAMPAIGN_EMAIL_WORK_PROVIDER_ITEM"') IS NOT NULL
       AND to_regclass('core."campaignEmailWorkCollision"') IS NOT NULL`,
      [
        [
          'canonicalMessageId',
          'messageThreadId',
          'providerMessageId',
          'accountIncarnationId',
          'providerThreadId',
          'creatorSender',
          'accountRecipient',
          'baselineGenerationId',
          'providerOccurredAt',
          'resolvedCampaignId',
          'resolvedCreatorId',
        ],
      ],
    );
    if (shape?.present !== 11) return 'SKIPPED';
    const [ready]: Array<{
      id: string;
      accountIncarnationId: string;
      completedAt: Date;
    }> = await runner.query(
      `SELECT g."id", g."accountIncarnationId", g."completedAt"
       FROM core."campaignEmailBaselineGeneration" g
       JOIN core."connectedAccount" a ON a."id" = g."connectedAccountId" AND a."workspaceId" = g."workspaceId"
       JOIN core."messageChannel" ch ON ch."id" = g."messageChannelId" AND ch."workspaceId" = g."workspaceId"
       WHERE g."id" = $1 AND g."workspaceId" = $2 AND g."messageChannelId" = $3
         AND g."connectedAccountId" = $4 AND g."accountIncarnationId" = a."campaignEmailIncarnationId"
         AND ch."connectedAccountId" = a."id" AND g."provider" = 'google' AND a."provider" = 'google'
         AND g."status" = 'READY' AND g."isCurrent" = true
       FOR SHARE OF g, a, ch`,
      [
        source.generationId,
        source.workspaceId,
        source.channelId,
        source.connectedAccountId,
      ],
    );
    if (
      !ready ||
      !isUuid(ready.accountIncarnationId) ||
      !(ready.completedAt instanceof Date) ||
      source.providerOccurredAt <= ready.completedAt
    )
      return 'SKIPPED';

    await runner.query("SELECT set_config('search_path', $1, true)", [
      getWorkspaceSchemaName(source.workspaceId),
    ]);
    const canonicals: Array<{
      id: string;
      messageThreadId: string;
      receivedAt: Date | null;
      createdAt: Date;
      isDraft: boolean;
      direction: string;
      creatorId: string | null;
    }> = await runner.query(
      `SELECT m."id", m."messageThreadId", m."receivedAt", m."createdAt", m."isDraft",
         a."direction", t."creatorId"
       FROM "message" m
       JOIN "messageThread" t ON t."id" = m."messageThreadId" AND t."deletedAt" IS NULL
       JOIN "messageChannelMessageAssociation" a ON a."messageId" = m."id"
         AND a."messageChannelId" = $3 AND a."messageExternalId" = $4
         AND a."messageThreadExternalId" = $7 AND a."deletedAt" IS NULL
       WHERE m."id" = $1 AND m."messageThreadId" = $2 AND m."deletedAt" IS NULL
         AND EXISTS (SELECT 1 FROM "messageParticipant" p
           WHERE p."messageId" = m."id" AND p."role" = 'FROM' AND p."handle" = $5 AND p."deletedAt" IS NULL)
         AND EXISTS (SELECT 1 FROM "messageParticipant" p
           WHERE p."messageId" = m."id" AND p."role" = 'TO' AND p."handle" = $6 AND p."deletedAt" IS NULL)
       FOR SHARE OF m, t, a`,
      [
        source.messageId,
        source.threadId,
        source.channelId,
        source.providerMessageId,
        source.from,
        source.to,
        source.providerThreadId,
      ],
    );
    const canonical = canonicals[0];
    if (
      canonicals.length !== 1 ||
      canonical.id !== source.messageId ||
      canonical.direction !== 'INCOMING' ||
      canonical.isDraft ||
      canonical.messageThreadId !== source.threadId ||
      !(canonical.receivedAt instanceof Date) ||
      !(canonical.createdAt instanceof Date) ||
      canonical.receivedAt <= ready.completedAt ||
      canonical.createdAt <= ready.completedAt ||
      source.providerOccurredAt > canonical.createdAt ||
      canonical.receivedAt > canonical.createdAt
    )
      return 'SKIPPED';
    const matched: Array<{ id: string }> = await runner.query(
      `SELECT "id" FROM "campaignEmailConversationBinding"
       WHERE "messageThreadId" = $1 AND "messageChannelId" = $2 AND "connectedAccountId" = $3
         AND "providerThreadId" = $4 AND "creatorSender" = $5 AND "accountRecipient" = $6
         AND "creatorId" = $7 AND ("messageId" IS NULL OR "messageId" = $8)
         AND "revokedAt" IS NULL AND "deletedAt" IS NULL FOR SHARE`,
      [
        source.threadId,
        source.channelId,
        source.connectedAccountId,
        source.providerThreadId,
        source.from,
        source.to,
        canonical.creatorId,
        source.messageId,
      ],
    );
    const reason =
      matched.length === 0
        ? 'NO_EXACT_BINDING'
        : matched.length > 1
          ? 'CONFLICTING_CAMPAIGNS'
          : 'AWAITING_OPERATOR_ACCESS';
    // Work's legacy triggerKey format requires a UUID. Derive it from the full
    // provider identity, not the canonical Message UUID shared by other channels.
    const triggerKey = `email-message:${v5(
      JSON.stringify([
        source.workspaceId,
        source.channelId,
        ready.accountIncarnationId,
        source.providerMessageId,
      ]),
      v5.URL,
    )}`;
    const values = [
      source.workspaceId,
      triggerKey,
      source.messageId,
      source.threadId,
      source.channelId,
      source.connectedAccountId,
      ready.accountIncarnationId,
      source.providerMessageId,
      source.providerThreadId,
      source.from,
      source.to,
      source.generationId,
      reason,
      source.providerOccurredAt,
    ];
    const inserted: Array<{ id: string }> = await runner.query(
      `INSERT INTO core."campaignPartnershipWorkItem"
       ("workspaceId", "triggerKey", "purpose", "state", "reason", "canonicalMessageId",
        "messageThreadId", "messageChannelId", "connectedAccountId", "accountIncarnationId",
        "providerMessageId", "providerThreadId", "creatorSender", "accountRecipient",
        "baselineGenerationId", "resolvedThreadExternalId", "normalizedRecipient", "providerOccurredAt")
       VALUES ($1, $2, 'REPLY_AMBIGUITY', 'HELD', $13, $3, $4, $5, $6, $7, $8, $9,
         $10, $11, $12, $9, $11, $14) ON CONFLICT DO NOTHING RETURNING "id"`,
      values,
    );
    if (inserted.length === 1) return 'HELD';
    // A replay reuses only the exact original coordinates. Colliding legacy
    // trigger or provider IDs never overwrite an already resolved receipt.
    const existing: Array<{
      id: string;
      state: string;
      reason: string | null;
      canonicalMessageId: string;
      providerMessageId: string;
      messageChannelId: string;
      connectedAccountId: string;
      messageThreadId: string;
      accountIncarnationId: string;
      providerThreadId: string;
      creatorSender: string;
      accountRecipient: string;
      baselineGenerationId: string;
      providerOccurredAt: Date;
    }> = await runner.query(
      `SELECT "id", "state", "reason", "canonicalMessageId", "providerMessageId", "messageChannelId", "connectedAccountId",
          "messageThreadId", "accountIncarnationId", "providerThreadId", "creatorSender", "accountRecipient",
          "baselineGenerationId", "providerOccurredAt"
       FROM core."campaignPartnershipWorkItem" WHERE "workspaceId" = $1 AND "triggerKey" = $2
         AND "purpose" = 'REPLY_AMBIGUITY' FOR UPDATE`,
      [source.workspaceId, triggerKey],
    );
    if (existing.length !== 1) return 'SKIPPED';
    const sameSource =
      existing[0].canonicalMessageId === source.messageId &&
      existing[0].providerMessageId === source.providerMessageId &&
      existing[0].messageChannelId === source.channelId &&
      existing[0].connectedAccountId === source.connectedAccountId &&
      existing[0].messageThreadId === source.threadId &&
      existing[0].providerThreadId === source.providerThreadId &&
      existing[0].creatorSender === source.from &&
      existing[0].accountRecipient === source.to &&
      existing[0].accountIncarnationId === ready.accountIncarnationId &&
      existing[0].baselineGenerationId === source.generationId &&
      existing[0].providerOccurredAt?.getTime() ===
        source.providerOccurredAt.getTime();
    if (sameSource) return 'HELD';
    // A distinct canonical source on the SAME provider route is never an
    // idempotent replay. Under the original work row lock, quarantine mutable
    // work before recording the second immutable source in this transaction.
    // Completed/actioned work must remain untouched but gets visible attention.
    if (
      existing[0].providerMessageId !== source.providerMessageId ||
      existing[0].messageChannelId !== source.channelId ||
      existing[0].accountIncarnationId !== ready.accountIncarnationId ||
      existing[0].connectedAccountId !== source.connectedAccountId
    )
      return 'SKIPPED';
    if (
      [
        'HELD',
        'PENDING',
        'PROCESSING',
        'AWAITING_REVIEW',
        'READY_ACTION',
      ].includes(existing[0].state) &&
      !(
        existing[0].state === 'HELD' &&
        existing[0].reason === 'PROVIDER_ID_COLLISION'
      )
    ) {
      // TypeORM Postgres raw UPDATE ... RETURNING resolves [rows, rowCount].
      const [quarantined]: [Array<{ id: string }>, number] = await runner.query(
        `UPDATE core."campaignPartnershipWorkItem" SET "state" = 'HELD',
           "reason" = 'PROVIDER_ID_COLLISION', "nextDueAt" = NULL,
           "contextGeneration" = "contextGeneration" + 1, "updatedAt" = now()
         WHERE "id" = $1 AND "workspaceId" = $2 AND "state" IN
           ('HELD', 'PENDING', 'PROCESSING', 'AWAITING_REVIEW', 'READY_ACTION')
           AND "providerMessageId" = $3 RETURNING "id"`,
        [existing[0].id, source.workspaceId, source.providerMessageId],
      );
      if (
        !Array.isArray(quarantined) ||
        quarantined.length !== 1 ||
        quarantined[0].id !== existing[0].id
      )
        throw new Error('Campaign Email collision quarantine failed');
    }
    // 0007 includes the full second snapshot in its replay key. A changed
    // timestamp or participant on the SAME canonical message is also evidence,
    // not a harmless replay of the original provider identity.
    const sourceFingerprint = createHash('sha256')
      .update(
        JSON.stringify([
          source.messageId,
          source.threadId,
          source.channelId,
          source.connectedAccountId,
          ready.accountIncarnationId,
          source.providerMessageId,
          source.providerThreadId,
          source.from,
          source.to,
          source.generationId,
          source.providerOccurredAt.toISOString(),
        ]),
      )
      .digest('hex');
    const collision = [
      source.workspaceId,
      existing[0].id,
      source.messageId,
      source.threadId,
      source.channelId,
      source.connectedAccountId,
      ready.accountIncarnationId,
      source.providerMessageId,
      source.providerThreadId,
      source.from,
      source.to,
      source.generationId,
      source.providerOccurredAt,
      sourceFingerprint,
    ];
    const insertedCollision: Array<{ id: string }> = await runner.query(
      `INSERT INTO core."campaignEmailWorkCollision"
       ("workspaceId", "originalWorkId", "canonicalMessageId", "messageThreadId",
        "messageChannelId", "connectedAccountId", "accountIncarnationId", "providerMessageId",
        "providerThreadId", "creatorSender", "accountRecipient", "baselineGenerationId", "providerOccurredAt", "sourceFingerprint")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT DO NOTHING RETURNING "id"`,
      collision,
    );
    if (!insertedCollision.length) {
      const retained: Array<{
        canonicalMessageId: string;
        providerMessageId: string;
        messageThreadId: string;
        connectedAccountId: string;
        providerThreadId: string;
        creatorSender: string;
        accountRecipient: string;
        baselineGenerationId: string;
        providerOccurredAt: Date;
        sourceFingerprint: string;
        originalWorkId: string;
      }> = await runner.query(
        `SELECT * FROM core."campaignEmailWorkCollision" WHERE "workspaceId"=$1
          AND "canonicalMessageId"=$2 AND "messageChannelId"=$3
          AND "accountIncarnationId"=$4 AND "providerMessageId"=$5
          AND "sourceFingerprint"=$6 FOR SHARE`,
        [
          source.workspaceId,
          source.messageId,
          source.channelId,
          ready.accountIncarnationId,
          source.providerMessageId,
          sourceFingerprint,
        ],
      );
      if (
        retained.length !== 1 ||
        retained[0].originalWorkId !== existing[0].id ||
        retained[0].messageThreadId !== source.threadId ||
        retained[0].connectedAccountId !== source.connectedAccountId ||
        retained[0].providerThreadId !== source.providerThreadId ||
        retained[0].creatorSender !== source.from ||
        retained[0].accountRecipient !== source.to ||
        retained[0].baselineGenerationId !== source.generationId ||
        retained[0].sourceFingerprint !== sourceFingerprint ||
        retained[0].providerOccurredAt?.getTime() !==
          source.providerOccurredAt.getTime()
      )
        throw new Error('Campaign Email collision identity conflict');
    }
    return 'HELD';
  }
}
