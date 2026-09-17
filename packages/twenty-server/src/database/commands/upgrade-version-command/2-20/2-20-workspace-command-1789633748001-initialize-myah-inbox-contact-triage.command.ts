import { Injectable } from '@nestjs/common';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { MyahInboxContactTriageSchemaService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-triage-schema.service';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { escapeIdentifier } from 'src/engine/workspace-manager/workspace-migration/utils/remove-sql-injection.util';

export let afterMyahInboxContactTriageCaptureInstalledForTest:
  | ((workspaceId: string) => Promise<void>)
  | undefined;

export const setAfterMyahInboxContactTriageCaptureInstalledForTest = (
  hook: typeof afterMyahInboxContactTriageCaptureInstalledForTest,
): void => {
  afterMyahInboxContactTriageCaptureInstalledForTest = hook;
};

export let afterMyahInboxContactTriageBaselineMarkerLockedForTest:
  | ((workspaceId: string) => Promise<void>)
  | undefined;

export const setAfterMyahInboxContactTriageBaselineMarkerLockedForTest = (
  hook: typeof afterMyahInboxContactTriageBaselineMarkerLockedForTest,
): void => {
  afterMyahInboxContactTriageBaselineMarkerLockedForTest = hook;
};

export let afterMyahInboxContactTriageBaselineSourceLocksAcquiredForTest:
  | ((workspaceId: string) => Promise<void>)
  | undefined;

export const setAfterMyahInboxContactTriageBaselineSourceLocksAcquiredForTest =
  (
    hook: typeof afterMyahInboxContactTriageBaselineSourceLocksAcquiredForTest,
  ): void => {
    afterMyahInboxContactTriageBaselineSourceLocksAcquiredForTest = hook;
  };

@RegisteredWorkspaceCommand('2.20.0', 1789633748001)
@Injectable()
export class InitializeMyahInboxContactTriageWorkspaceCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    workspaceIteratorService: WorkspaceIteratorService,
    private readonly schemaService: MyahInboxContactTriageSchemaService,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace(args: RunOnWorkspaceArgs): Promise<void> {
    if (!args.dataSource) {
      throw new Error(
        'Contact triage initialization requires a workspace data source',
      );
    }
    if (args.options.dryRun) return;

    const schema = escapeIdentifier(getWorkspaceSchemaName(args.workspaceId));
    this.logger.log(
      `contact-triage initialization start workspace=${args.workspaceId}`,
    );

    // Phase one must commit before a baseline is chosen: producers either see
    // both receipt dependencies or their enclosing message transaction retries.
    const capture = args.dataSource.createQueryRunner();
    await capture.connect();
    await capture.startTransaction();
    try {
      await this.schemaService.ensureWorkspaceTables(capture, args.workspaceId);
      // Schema is a UUID-derived escaped identifier; PostgreSQL cannot bind relation names.
      // pi-lens-ignore: sql-injection, no-sql-in-code
      await capture.query(
        `INSERT INTO ${schema}."myahInboxTriageMigration" (id, status)
         VALUES (true, 'MIGRATING')
         ON CONFLICT (id) DO NOTHING`,
      );
      // SAFETY: schema is derived only from the workspace UUID then quoted with
      // escapeIdentifier; PostgreSQL cannot parameterize relation identifiers.
      // Schema is a UUID-derived escaped identifier; PostgreSQL cannot bind relation names.
      // pi-lens-ignore: sql-injection, no-sql-in-code
      const [captureMarker] = (await capture.query(
        `SELECT status, "baselineStartedAt"
         FROM ${schema}."myahInboxTriageMigration"
         WHERE id=true FOR UPDATE`,
      )) as Array<{ status: string; baselineStartedAt: string | null }>;
      if (captureMarker?.baselineStartedAt) {
        await capture.commitTransaction();
        this.logger.log(
          `contact-triage initialization already complete workspace=${args.workspaceId} status=${captureMarker.status}`,
        );
        return;
      }
      await capture.commitTransaction();
      this.logger.log(
        `contact-triage capture installed workspace=${args.workspaceId}`,
      );
      await afterMyahInboxContactTriageCaptureInstalledForTest?.(
        args.workspaceId,
      );
    } catch (error) {
      await capture.rollbackTransaction();
      throw error;
    } finally {
      await capture.release();
    }

    // Phase two is intentionally a separate commit. The fence includes receipts
    // that arrived after capture installation and before this baseline.
    const baseline = args.dataSource.createQueryRunner();
    await baseline.connect();
    await baseline.startTransaction();
    try {
      // SAFETY: schema is derived only from the workspace UUID then quoted with
      // escapeIdentifier; PostgreSQL cannot parameterize relation identifiers.
      // Schema is a UUID-derived escaped identifier; PostgreSQL cannot bind relation names.
      // pi-lens-ignore: sql-injection, no-sql-in-code
      const [baselineMarker] = (await baseline.query(
        `SELECT status, "baselineStartedAt"
         FROM ${schema}."myahInboxTriageMigration"
         WHERE id=true FOR UPDATE`,
      )) as Array<{ status: string; baselineStartedAt: string | null }>;
      if (baselineMarker?.baselineStartedAt) {
        await baseline.commitTransaction();
        this.logger.log(
          `contact-triage initialization already complete workspace=${args.workspaceId} status=${baselineMarker.status}`,
        );
        return;
      }
      await afterMyahInboxContactTriageBaselineMarkerLockedForTest?.(
        args.workspaceId,
      );
      // Lock every live source in a fixed global order while the marker lock is
      // held. Link/unlink takes its advisory source lock before changing the
      // relation, then its source row lock; this marker-to-row order cannot
      // invert that protocol because identity changes never take the marker.
      // SAFETY: schema is derived only from the workspace UUID then quoted with
      // escapeIdentifier; PostgreSQL cannot parameterize relation identifiers.
      // Schema is a UUID-derived escaped identifier; PostgreSQL cannot bind relation names.
      // pi-lens-ignore: sql-injection, no-sql-in-code
      await baseline.query(
        `SELECT id FROM ${schema}."messageThread"
         WHERE "deletedAt" IS NULL
         ORDER BY id FOR UPDATE`,
      );
      // Instagram is an optional public app. Valid Email-only workspaces lack
      // these relations, so baseline SQL must omit the entire app branch.
      const [instagramRelations] = (await baseline.query(
        'SELECT to_regclass($1) IS NOT NULL AS "conversationExists", to_regclass($2) IS NOT NULL AS "messageExists"',
        [
          `${schema}."_myahSocialConversation"`,
          `${schema}."_myahSocialMessage"`,
        ],
      )) as Array<{ conversationExists: boolean; messageExists: boolean }>;
      const hasInstagramRelations =
        instagramRelations?.conversationExists === true &&
        instagramRelations?.messageExists === true;
      if (hasInstagramRelations) {
        // Schema is a UUID-derived escaped identifier; PostgreSQL cannot bind relation names.
        // pi-lens-ignore: sql-injection, no-sql-in-code
        await baseline.query(
          `SELECT id FROM ${schema}."_myahSocialConversation"
           WHERE "deletedAt" IS NULL
           ORDER BY id FOR UPDATE`,
        );
      }
      await afterMyahInboxContactTriageBaselineSourceLocksAcquiredForTest?.(
        args.workspaceId,
      );
      // Retain the channel provenance of legacy Email receipts before their
      // messages are eventually cleaned up. Canonical contact state outlives
      // message retention, so later capability checks cannot derive this from
      // only the live association rows.
      // Schema is a UUID-derived escaped identifier; PostgreSQL cannot bind relation names.
      // pi-lens-ignore: sql-injection, no-sql-in-code
      await baseline.query(`
        INSERT INTO ${schema}."myahInboxTriageEmailChannelProvenance" (
          "persistedMessageId", "messageChannelIds"
        )
        SELECT message.id,
               array_agg(DISTINCT association."messageChannelId")
                 FILTER (WHERE association."deletedAt" IS NULL)
        FROM ${schema}."message" message
        INNER JOIN ${schema}."messageChannelMessageAssociation" association
          ON association."messageId"=message.id
         AND association."deletedAt" IS NULL
        WHERE message."deletedAt" IS NULL
        GROUP BY message.id
        ON CONFLICT ("persistedMessageId") DO NOTHING
      `);
      // Receipts emitted after capture installation are replayed by catch-up;
      // these CTEs establish the legacy tuple and inbound ordering baseline.
      // While baselineStartedAt is null, every canonical tuple is provisional:
      // operator mutations are unavailable until READY and receipt draining is
      // gated on the committed fence. Replace provisional tuples completely so
      // a crash/retry cannot preserve producer-created state over legacy data.
      const instagramSourceRows = hasInstagramRelations
        ? `
          UNION ALL
          SELECT CASE WHEN conversation."creatorId" IS NULL THEN 'instagram-conversation:' || conversation.id ELSE 'creator:' || conversation."creatorId" END,
                 conversation.id, 'INSTAGRAM', NULL::uuid, NULL::text, NULL::timestamptz, conversation."updatedAt",
                 latest.direction::text
          FROM ${schema}."_myahSocialConversation" conversation
          LEFT JOIN LATERAL (
            SELECT message.direction,
                   LEAST(
                     COALESCE(
                       date_trunc('milliseconds', message."providerCreatedAt"),
                       date_trunc('milliseconds', message."createdAt")
                     ),
                     date_trunc('milliseconds', message."createdAt")
                   ) AS normalized_occurred_at,
                   to_char(date_trunc('milliseconds', message."createdAt") AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') || '|INSTAGRAM|' || message.id AS order_key
            FROM ${schema}."_myahSocialMessage" message
            WHERE message."conversationId"=conversation.id
              AND message."deletedAt" IS NULL
              AND message.direction IN ('INBOUND', 'OUTBOUND')
            ORDER BY normalized_occurred_at DESC, order_key DESC
            LIMIT 1
          ) latest ON true
          WHERE conversation."deletedAt" IS NULL`
        : '';
      const instagramInboundRows = hasInstagramRelations
        ? `
          UNION ALL
          SELECT CASE WHEN conversation."creatorId" IS NULL THEN 'instagram-conversation:' || conversation.id ELSE 'creator:' || conversation."creatorId" END,
                 LEAST(
                   COALESCE(
                     date_trunc('milliseconds', message."providerCreatedAt"),
                     date_trunc('milliseconds', message."createdAt")
                   ),
                   date_trunc('milliseconds', message."createdAt")
                 ),
                 to_char(date_trunc('milliseconds', message."createdAt") AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') || '|INSTAGRAM|' || message.id
          FROM ${schema}."_myahSocialMessage" message
          JOIN ${schema}."_myahSocialConversation" conversation ON conversation.id=message."conversationId"
          WHERE message."deletedAt" IS NULL AND conversation."deletedAt" IS NULL AND message.direction='INBOUND'`
        : '';
      // Schema is a UUID-derived escaped identifier; PostgreSQL cannot bind relation names.
      // pi-lens-ignore: sql-injection, no-sql-in-code
      await baseline.query(`
        WITH source_rows AS (
          SELECT CASE WHEN thread."creatorId" IS NULL THEN 'email-thread:' || thread.id ELSE 'creator:' || thread."creatorId" END AS identity_key,
                 thread.id AS source_id, 'EMAIL'::text AS channel, thread."inboxOwnerId", thread."inboxState"::text AS inbox_state,
                 thread."snoozedUntil", thread."updatedAt", NULL::text AS latest_direction
          FROM ${schema}."messageThread" thread WHERE thread."deletedAt" IS NULL${instagramSourceRows}
        ), identities AS (
          SELECT DISTINCT identity_key FROM source_rows
        ), email_ranked AS (
          SELECT *, row_number() OVER (PARTITION BY identity_key ORDER BY "updatedAt" DESC, source_id DESC) AS rank
          FROM source_rows WHERE channel='EMAIL'
        ), triage_values AS (
          SELECT identities.identity_key,
                 (SELECT "inboxOwnerId" FROM email_ranked WHERE identity_key=identities.identity_key AND rank=1) AS owner_id,
                 CASE
                   WHEN EXISTS (
                     SELECT 1 FROM source_rows row
                     WHERE row.identity_key=identities.identity_key
                       AND (
                         row.inbox_state='NEEDS_REPLY'
                         OR (row.inbox_state='SNOOZED' AND row."snoozedUntil" <= now())
                         OR row.latest_direction='INBOUND'
                       )
                   ) THEN 'NEEDS_REPLY'
                   WHEN EXISTS (SELECT 1 FROM email_ranked row WHERE row.identity_key=identities.identity_key AND rank=1) THEN (SELECT inbox_state FROM email_ranked row WHERE row.identity_key=identities.identity_key AND rank=1)
                   WHEN EXISTS (SELECT 1 FROM source_rows row WHERE row.identity_key=identities.identity_key AND row.latest_direction='OUTBOUND') THEN 'WAITING_ON_CREATOR'
                   ELSE 'CLOSED'
                 END AS inbox_state,
                 (SELECT "snoozedUntil" FROM email_ranked WHERE identity_key=identities.identity_key AND rank=1) AS snoozed_until
          FROM identities
        ), identity_insert AS (
          INSERT INTO ${schema}."myahInboxContactIdentity" ("contactIdentityKey")
          SELECT identity_key FROM identities ON CONFLICT ("contactIdentityKey") DO NOTHING
          RETURNING "contactIdentityKey", generation
        ), identity_rows AS (
          SELECT "contactIdentityKey", generation FROM identity_insert
          UNION ALL
          SELECT identity."contactIdentityKey", identity.generation
          FROM ${schema}."myahInboxContactIdentity" identity
          JOIN identities ON identities.identity_key=identity."contactIdentityKey"
        )
        INSERT INTO ${schema}."myahInboxContactTriage" (
          "contactIdentityKey", "identityGeneration", "inboxOwnerId", "inboxState", "snoozedUntil", revision, "hasStateDecision", "stateDecisionAt", "triageChangedAt"
        )
        SELECT values.identity_key, identity.generation, values.owner_id, values.inbox_state,
               CASE WHEN values.inbox_state='SNOOZED' THEN values.snoozed_until ELSE NULL END,
               1,
               EXISTS (SELECT 1 FROM email_ranked WHERE identity_key=values.identity_key),
               now(), now()
        FROM triage_values values JOIN identity_rows identity ON identity."contactIdentityKey"=values.identity_key
        WHERE values.inbox_state <> 'SNOOZED' OR values.snoozed_until IS NOT NULL
        ON CONFLICT ("contactIdentityKey") DO UPDATE
          SET "identityGeneration"=EXCLUDED."identityGeneration",
              "inboxOwnerId"=EXCLUDED."inboxOwnerId",
              "inboxState"=EXCLUDED."inboxState",
              "snoozedUntil"=EXCLUDED."snoozedUntil",
              revision=EXCLUDED.revision,
              "hasStateDecision"=EXCLUDED."hasStateDecision",
              "stateDecisionAt"=EXCLUDED."stateDecisionAt",
              "lastInboundOccurredAt"=NULL,
              "lastInboundOrderKey"=NULL,
              "triageChangedAt"=EXCLUDED."triageChangedAt";
      `);
      // Schema is a UUID-derived escaped identifier; PostgreSQL cannot bind relation names.
      // pi-lens-ignore: sql-injection, no-sql-in-code
      await baseline.query(`
        WITH inbound AS (
          SELECT CASE WHEN thread."creatorId" IS NULL THEN 'email-thread:' || thread.id ELSE 'creator:' || thread."creatorId" END AS identity_key,
                 LEAST(
                   COALESCE(
                     date_trunc('milliseconds', message."receivedAt"),
                     date_trunc('milliseconds', message."createdAt")
                   ),
                   date_trunc('milliseconds', message."createdAt")
                 ) AS occurred_at,
                 to_char(date_trunc('milliseconds', message."createdAt") AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') || '|EMAIL|' || message.id AS order_key
          FROM ${schema}."message" message
          JOIN ${schema}."messageThread" thread ON thread.id=message."messageThreadId"
          WHERE message."deletedAt" IS NULL
            AND thread."deletedAt" IS NULL
            AND EXISTS (
              SELECT 1
              FROM ${schema}."messageChannelMessageAssociation" association
              WHERE association."messageId"=message.id
                AND association."deletedAt" IS NULL
                AND association.direction='INCOMING'
            )
          ${instagramInboundRows}
        ), newest AS (
          SELECT DISTINCT ON (identity_key) identity_key, occurred_at, order_key
          FROM inbound ORDER BY identity_key, occurred_at DESC, order_key DESC
        )
        UPDATE ${schema}."myahInboxContactTriage" triage
        SET "lastInboundOccurredAt"=newest.occurred_at, "lastInboundOrderKey"=newest.order_key
        FROM newest WHERE triage."contactIdentityKey"=newest.identity_key
          AND triage."lastInboundOccurredAt" IS NULL
      `);
      // Schema is a UUID-derived escaped identifier; PostgreSQL cannot bind relation names.
      // pi-lens-ignore: sql-injection, no-sql-in-code
      await baseline.query(
        `UPDATE ${schema}."myahInboxTriageMigration"
         SET "baselineStartedAt"=COALESCE("baselineStartedAt", now()),
             "baselineFenceSequence"=(
               SELECT COALESCE(max(sequence), 0) FROM ${schema}."myahInboxTriageTransitionReceipt"
             ),
             "updatedAt"=now(), version=version+1
         WHERE id=true`,
      );
      await baseline.commitTransaction();
      this.logger.log(
        `contact-triage baseline fenced workspace=${args.workspaceId}`,
      );
    } catch (error) {
      await baseline.rollbackTransaction();
      throw error;
    } finally {
      await baseline.release();
    }
  }
}
