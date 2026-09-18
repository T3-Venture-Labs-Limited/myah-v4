import { createHash } from 'crypto';

import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';

import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

const EMAIL_CONTEXT_ACTIVATION_MARKER =
  'myah-inbox-email-reply-context-activation-v1';

type LegacyEmailDraftSource = {
  id: string;
  creatorId: string | null;
  campaignId: string | null;
  markdown: string;
  blocknote: string | null;
  revision: number | string;
};

type DestinationDraft = {
  id: string;
  markdown: string | null;
  blocknote: string | null;
  revision: number | string;
  proposalContextFingerprint: string | null;
  reviewedContextFingerprint: string | null;
};

export type EmailReplyContextPreflightResult = {
  mapped: number;
  unmapped: number;
  sourceChanged: number;
};

type EmailReplyContextPreflightOptions = { dryRun?: boolean };

class EmailReplyContextCutoverHold extends Error {
  constructor(readonly result: EmailReplyContextPreflightResult) {
    super('Email reply-context cutover hold');
  }
}

const initialResult = (): EmailReplyContextPreflightResult => ({
  mapped: 0,
  unmapped: 0,
  sourceChanged: 0,
});

const digestSource = (source: LegacyEmailDraftSource): string =>
  createHash('sha256')
    .update(
      JSON.stringify([
        source.id,
        source.creatorId,
        source.campaignId,
        source.markdown,
        source.blocknote,
        Number(source.revision),
      ]),
    )
    .digest('hex');

@Injectable()
export class EmailReplyContextActivationService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async isEmailContextActivationEnabled(workspaceId: string): Promise<boolean> {
    const rows = await this.dataSource.query<{ value: unknown }[]>(
      `SELECT value FROM core."keyValuePair"
       WHERE "workspaceId" = $1 AND "userId" IS NULL
         AND key = $2 AND type = 'CONFIG_VARIABLE' AND "deletedAt" IS NULL`,
      [workspaceId, EMAIL_CONTEXT_ACTIVATION_MARKER],
    );
    const value = rows[0]?.value;

    return (
      typeof value === 'object' &&
      value !== null &&
      (value as { status?: unknown }).status === 'ACTIVE'
    );
  }

  async assertEmailContextActivationEnabled(
    workspaceId: string,
  ): Promise<void> {
    if (await this.isEmailContextActivationEnabled(workspaceId)) {
      return;
    }

    // Workspaces created directly at the current schema version (every
    // workspace going forward) never replay the historical 2.20.0 upgrade
    // command that activates Email reply context, so they'd otherwise stay
    // permanently blocked. Activate on first use instead: this cutover is a
    // no-op-safe idempotent transaction that immediately succeeds when there
    // are no legacy drafts to migrate (the common case for a new workspace).
    if (await this.isWorkspaceSchemaProvisioned(workspaceId)) {
      await this.preflightEmailWorkspace(workspaceId);
    }

    if (!(await this.isEmailContextActivationEnabled(workspaceId))) {
      throw new ForbiddenException('Email reply context activation is pending');
    }
  }

  // Workspaces without a provisioned schema hold no legacy drafts to preserve.
  // Callers skip them so a cutover run never fails on an uninitialised tenant.
  async isWorkspaceSchemaProvisioned(workspaceId: string): Promise<boolean> {
    const queryRunner = this.dataSource.createQueryRunner();

    try {
      await queryRunner.connect();

      return await queryRunner.hasSchema(getWorkspaceSchemaName(workspaceId));
    } finally {
      await queryRunner.release();
    }
  }

  async preflightEmailWorkspace(
    workspaceId: string,
    options: EmailReplyContextPreflightOptions = {},
  ): Promise<EmailReplyContextPreflightResult> {
    // A failed retry must never retain an earlier success marker.
    if (!options.dryRun) await this.clearActivationMarker(workspaceId);

    try {
      return await this.dataSource.transaction(async (manager) => {
        const result = initialResult();
        const schemaName = getWorkspaceSchemaName(workspaceId);
        const sources = await manager.query<LegacyEmailDraftSource[]>(
          `SELECT id, "creatorId", "myahCampaignId" AS "campaignId",
                  "myahReplyDraftBodyMarkdown" AS markdown,
                  "myahReplyDraftBodyBlocknote" AS blocknote,
                  "myahReplyDraftRevision" AS revision
           FROM "${schemaName}"."messageThread"
           WHERE "deletedAt" IS NULL
             AND "myahReplyDraftBodyMarkdown" IS NOT NULL
             AND btrim("myahReplyDraftBodyMarkdown") <> ''
           ORDER BY id ASC`,
        );

        for (const candidate of sources) {
          // Serialize with both v1 recovery projection and v1/v2 target
          // reservation before locking and examining the legacy source.
          await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
            `myah-inbox-reply-projection:${workspaceId}:${candidate.id}`,
          ]);
          await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
            `myah-inbox-reply-target:${workspaceId}:EMAIL:${candidate.id}`,
          ]);
          await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
            `myah-inbox-reply:${workspaceId}:${candidate.id}`,
          ]);
          const [source] = await manager.query<LegacyEmailDraftSource[]>(
            `SELECT id, "creatorId", "myahCampaignId" AS "campaignId",
                    "myahReplyDraftBodyMarkdown" AS markdown,
                    "myahReplyDraftBodyBlocknote" AS blocknote,
                    "myahReplyDraftRevision" AS revision
             FROM "${schemaName}"."messageThread" WHERE id = $1 FOR UPDATE`,
            [candidate.id],
          );
          if (!source || digestSource(source) !== digestSource(candidate)) {
            result.unmapped++;
            result.sourceChanged++;
            continue;
          }

          const identity = await this.resolveSourceIdentity(
            manager,
            schemaName,
            source,
            workspaceId,
          );
          if (!identity) {
            result.unmapped++;
            continue;
          }
          if (
            await this.hasUnfinishedLegacyExecution(
              manager,
              workspaceId,
              source.id,
            )
          ) {
            result.unmapped++;
            continue;
          }

          const existing = await this.loadDestination(manager, {
            workspaceId,
            creatorId: source.creatorId as string,
            source,
            contextKind: identity.contextKind,
          });
          if (existing && !this.matchesDestination(existing, source)) {
            result.unmapped++;
            continue;
          }

          if (!options.dryRun && !existing) {
            await manager.query(
              `INSERT INTO core."myahInboxReplyContextDraft" (
                "workspaceId", "contactAnchorKind", "contactAnchorId", "channel",
                "deliveryTargetId", "contextKind", "campaignId", "bodyMarkdown",
                "bodyBlocknote", "revision", "proposalContextFingerprint",
                "reviewedContextFingerprint"
              ) VALUES ($1, 'CREATOR', $2, 'EMAIL', $3, $4, $5, $6, $7, $8, NULL, NULL)
              ON CONFLICT DO NOTHING`,
              [
                workspaceId,
                source.creatorId,
                source.id,
                identity.contextKind,
                source.campaignId,
                source.markdown,
                source.blocknote,
                Number(source.revision),
              ],
            );
          }

          const [reloaded] = await manager.query<LegacyEmailDraftSource[]>(
            `SELECT id, "creatorId", "myahCampaignId" AS "campaignId",
                    "myahReplyDraftBodyMarkdown" AS markdown,
                    "myahReplyDraftBodyBlocknote" AS blocknote,
                    "myahReplyDraftRevision" AS revision
             FROM "${schemaName}"."messageThread" WHERE id = $1 FOR UPDATE`,
            [source.id],
          );
          if (!reloaded || digestSource(reloaded) !== digestSource(source)) {
            result.unmapped++;
            result.sourceChanged++;
            throw new EmailReplyContextCutoverHold(result);
          }

          if (!options.dryRun) {
            const destination = await this.loadDestination(manager, {
              workspaceId,
              creatorId: source.creatorId as string,
              source,
              contextKind: identity.contextKind,
            });
            if (!destination || !this.matchesDestination(destination, source)) {
              result.unmapped++;
              throw new EmailReplyContextCutoverHold(result);
            }
          }
          result.mapped++;
        }

        if (
          !options.dryRun &&
          result.unmapped === 0 &&
          result.sourceChanged === 0
        ) {
          await this.writeActivationMarker(manager, workspaceId);
        }

        return result;
      });
    } catch (error) {
      if (error instanceof EmailReplyContextCutoverHold) return error.result;
      throw error;
    }
  }

  private async resolveSourceIdentity(
    manager: EntityManager,
    schemaName: string,
    source: LegacyEmailDraftSource,
    workspaceId: string,
  ): Promise<{ contextKind: 'CAMPAIGN' | 'GENERAL' } | null> {
    if (!source.creatorId || !Number.isSafeInteger(Number(source.revision))) {
      return null;
    }
    const creators = await manager.query<{ id: string }[]>(
      `SELECT id FROM "${schemaName}".creator
       WHERE id = $1 AND "deletedAt" IS NULL`,
      [source.creatorId],
    );
    if (creators.length !== 1) return null;

    if (!source.campaignId) {
      const proof = await manager.query<{ proven: boolean }[]>(
        `SELECT true AS proven FROM core."myahInboxEmailGeneralProvenance"
         WHERE "workspaceId" = $1 AND "deliveryTargetId" = $2
           AND "creatorId" = $3 AND "revokedAt" IS NULL`,
        [workspaceId, source.id, source.creatorId],
      );
      return proof[0]?.proven === true ? { contextKind: 'GENERAL' } : null;
    }

    const campaigns = await manager.query<{ id: string }[]>(
      `SELECT id FROM "${schemaName}".campaign
       WHERE id = $1 AND "deletedAt" IS NULL`,
      [source.campaignId],
    );
    if (campaigns.length !== 1) return null;

    const evidence = await manager.query<{ count: string }[]>(
      `SELECT count(*)::text AS count
       FROM "${schemaName}".message message
       JOIN "${schemaName}"."messageThread" thread
         ON thread.id = message."messageThreadId"
       WHERE thread."creatorId" = $1 AND thread."myahCampaignId" = $2
         AND thread."deletedAt" IS NULL AND message."deletedAt" IS NULL
         AND message."isDraft" = false AND message."receivedAt" IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM "${schemaName}"."messageChannelMessageAssociation" association
           JOIN core."messageChannel" channel
             ON channel.id = association."messageChannelId"
           WHERE association."messageId" = message.id
             AND association."deletedAt" IS NULL AND association.direction = 'OUTGOING'
             AND channel.type IN ('EMAIL', 'EMAIL_GROUP')
         )`,
      [source.creatorId, source.campaignId],
    );

    return Number(evidence[0]?.count ?? 0) > 0
      ? { contextKind: 'CAMPAIGN' }
      : null;
  }

  private async hasUnfinishedLegacyExecution(
    manager: EntityManager,
    workspaceId: string,
    deliveryTargetId: string,
  ): Promise<boolean> {
    const rows = await manager.query<{ exists: boolean }[]>(
      `SELECT EXISTS (
        SELECT 1
        FROM core."actionApprovalBinding" binding
        LEFT JOIN core."actionExecutionReceipt" receipt
          ON receipt."actionApprovalBindingId" = binding.id
        WHERE binding."workspaceId" = $1
          AND binding."actionName" = 'send_inbox_reply'
          AND binding."actionVersion" = 1
          AND binding."draftId" = $2
          AND (
            (binding.state = 'APPROVED' AND binding."expiresAt" > NOW()
              AND NOT EXISTS (
                SELECT 1 FROM core."actionExecutionReceipt" approved_receipt
                WHERE approved_receipt."actionApprovalBindingId" = binding.id
              ))
            OR (binding.state = 'CONSUMED' AND receipt.state IN (
              'PROCESSING', 'PROVIDER_ACCEPTED', 'UNKNOWN'
            ))
          )
      ) AS "exists"`,
      [workspaceId, deliveryTargetId],
    );

    return rows[0]?.exists === true;
  }

  private async loadDestination(
    manager: EntityManager,
    input: {
      workspaceId: string;
      creatorId: string;
      source: LegacyEmailDraftSource;
      contextKind: 'CAMPAIGN' | 'GENERAL';
    },
  ): Promise<DestinationDraft | undefined> {
    const rows = await manager.query<DestinationDraft[]>(
      `SELECT id, "bodyMarkdown" AS markdown, "bodyBlocknote" AS blocknote,
              revision, "proposalContextFingerprint", "reviewedContextFingerprint"
       FROM core."myahInboxReplyContextDraft"
       WHERE "workspaceId" = $1 AND "contactAnchorKind" = 'CREATOR'
         AND "contactAnchorId" = $2 AND channel = 'EMAIL'
         AND "deliveryTargetId" = $3 AND "contextKind" = $4
         AND "campaignId" IS NOT DISTINCT FROM $5::uuid FOR UPDATE`,
      [
        input.workspaceId,
        input.creatorId,
        input.source.id,
        input.contextKind,
        input.source.campaignId,
      ],
    );

    return rows[0];
  }

  private matchesDestination(
    destination: DestinationDraft,
    source: LegacyEmailDraftSource,
  ): boolean {
    return (
      destination.markdown === source.markdown &&
      destination.blocknote === source.blocknote &&
      Number(destination.revision) === Number(source.revision) &&
      destination.proposalContextFingerprint === null &&
      destination.reviewedContextFingerprint === null
    );
  }

  private async clearActivationMarker(workspaceId: string): Promise<void> {
    await this.dataSource.query(
      `DELETE FROM core."keyValuePair"
       WHERE "workspaceId" = $1 AND "userId" IS NULL AND key = $2`,
      [workspaceId, EMAIL_CONTEXT_ACTIVATION_MARKER],
    );
  }

  private async writeActivationMarker(
    manager: EntityManager,
    workspaceId: string,
  ): Promise<void> {
    await manager.query(
      `INSERT INTO core."keyValuePair" (
        "workspaceId", "userId", key, value, type
      ) VALUES ($1, NULL, $2, $3::jsonb, 'CONFIG_VARIABLE')
      ON CONFLICT (key, "workspaceId") WHERE "userId" IS NULL
      DO UPDATE SET value = EXCLUDED.value, type = EXCLUDED.type, "updatedAt" = NOW(), "deletedAt" = NULL`,
      [
        workspaceId,
        EMAIL_CONTEXT_ACTIVATION_MARKER,
        JSON.stringify({ status: 'ACTIVE' }),
      ],
    );
  }
}
