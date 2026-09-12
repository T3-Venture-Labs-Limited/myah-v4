import { type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

const OCCURRENCE_HOLDS = `'WORKSPACE_NOT_ACTIVE', 'ATTACHMENTS_UNAVAILABLE', 'MATERIAL_STALE', 'SENDER_POOL_STALE', 'SENDER_NOT_READY', 'CAPACITY_CONFIGURATION_INVALID', 'THREAD_EVIDENCE_MISSING', 'THREAD_EVIDENCE_AMBIGUOUS', 'THREAD_SENDER_CHANGED', 'DEFINITELY_UNACCEPTED_REVIEW', 'PROJECTION_RECONCILIATION_REQUIRED', 'DISPATCH_CONTRACT_CONFLICT'`;
const OCCURRENCE_TERMINALS = `'PROVIDER_ACCEPTED', 'CREATOR_MISSING', 'CREATOR_DELETED', 'CAMPAIGN_CREATOR_MISSING', 'CAMPAIGN_CREATOR_DELETED', 'INVALID_STAGE', 'NON_EMAIL_CONTACT_METHOD', 'INVALID_EMAIL', 'DUPLICATE_CREATOR_EMAIL', 'SUPPRESSED_EMAIL', 'CAMPAIGN_PAUSED', 'CAMPAIGN_COMPLETED', 'AUTHORIZATION_REVOKED', 'ENROLLMENT_REPLIED', 'SUPERSEDED_BY_WORKFLOW_VERSION'`;
const ENROLLMENT_TERMINALS = `'REPLY_RECEIVED', 'CREATOR_MISSING', 'CREATOR_DELETED', 'CAMPAIGN_CREATOR_MISSING', 'CAMPAIGN_CREATOR_DELETED', 'INVALID_STAGE', 'NON_EMAIL_CONTACT_METHOD', 'INVALID_EMAIL', 'DUPLICATE_CREATOR_EMAIL', 'SUPPRESSED_EMAIL', 'SEQUENCE_COMPLETED', 'NO_USABLE_AUTHORED_MESSAGE'`;

@RegisteredInstanceCommand('2.20.0', 1789066100000)
export class AddCampaignDispatchEvidenceFastInstanceCommand implements FastInstanceCommand {
  async up(queryRunner: QueryRunner): Promise<void> {
    const unsafe = await queryRunner.query(
      `SELECT 'ACCEPTED_SEQUENCE' AS kind, "attemptId"::text AS id
         FROM core."outboundEmailAttempt"
        WHERE source = 'CAMPAIGN_SEQUENCE' AND "attemptState" = 'ACCEPTED'
       UNION ALL
       SELECT 'CAMPAIGN_NONACCEPTED_PROJECTION', "attemptId"::text
         FROM core."outboundEmailAttempt"
        WHERE source = 'CAMPAIGN_SEQUENCE' AND "attemptState" <> 'ACCEPTED'
          AND "projectedMessageId" IS NOT NULL
       UNION ALL
       SELECT 'OCCURRENCE_REASON', id::text FROM core."campaignOccurrence"
        WHERE ("holdReason" IS NOT NULL AND "holdReason" NOT IN (${OCCURRENCE_HOLDS}))
           OR ("terminalReason" IS NOT NULL AND "terminalReason" NOT IN (${OCCURRENCE_TERMINALS}))
       UNION ALL
       SELECT 'ENROLLMENT_REASON', id::text FROM core."campaignEnrollment"
        WHERE ("holdReason" IS NOT NULL AND "holdReason" NOT IN (${OCCURRENCE_HOLDS}))
           OR ("terminalReason" IS NOT NULL AND "terminalReason" NOT IN (${ENROLLMENT_TERMINALS}))
       ORDER BY kind, id
       LIMIT 25`,
    );

    if (!Array.isArray(unsafe) || unsafe.length > 0) {
      throw new Error(
        'Campaign dispatch evidence preflight refused unsafe existing rows',
      );
    }

    await queryRunner.query(`ALTER TABLE core."campaignOccurrence" DROP CONSTRAINT "CHK_CO_TERMINAL_SHAPE"`);
    await queryRunner.query(`ALTER TABLE core."campaignEnrollment" DROP CONSTRAINT "CHK_CEN_TERMINAL_SHAPE"`);
    await queryRunner.query(`ALTER TABLE core."campaignOccurrence" ADD CONSTRAINT "CHK_CO_TERMINAL_SHAPE" CHECK (((state IN ('PENDING','IN_FLIGHT','UNKNOWN')) AND "holdReason" IS NULL AND "terminalReason" IS NULL AND "terminalAt" IS NULL) OR (state='HELD' AND "holdReason" IN (${OCCURRENCE_HOLDS}) AND "terminalReason" IS NULL AND "terminalAt" IS NULL) OR (state IN ('SUCCEEDED','SKIPPED','CANCELLED') AND "holdReason" IS NULL AND "terminalReason" IN (${OCCURRENCE_TERMINALS}) AND "terminalAt" IS NOT NULL))`);
    await queryRunner.query(`ALTER TABLE core."campaignEnrollment" ADD CONSTRAINT "CHK_CEN_TERMINAL_SHAPE" CHECK ((state='ACTIVE' AND ("holdReason" IS NULL OR "holdReason" IN (${OCCURRENCE_HOLDS})) AND "terminalReason" IS NULL AND "terminalAt" IS NULL) OR (state IN ('REPLIED','EXCLUDED','FINISHED') AND "holdReason" IS NULL AND "terminalReason" IN (${ENROLLMENT_TERMINALS}) AND "terminalAt" IS NOT NULL AND (state <> 'FINISHED' OR "nextAuthoredMessageIndex"="authoredMessageCount")))`);

    for (const [name, type] of [
      ['providerHeaderMessageId', 'text'],
      ['providerMessageExternalId', 'text'],
      ['reconciledProviderHeaderMessageId', 'text'],
      ['providerThreadExternalId', 'text'],
      ['resolvedThreadExternalId', 'text'],
      ['providerDeliveredRecipients', 'jsonb'],
      ['projectedMessageThreadId', 'uuid'],
    ] as const) {
      await queryRunner.query(
        `ALTER TABLE core."outboundEmailAttempt" ADD "${name}" ${type}`,
      );
    }

    await queryRunner.query(`ALTER TABLE core."outboundEmailAttempt" ADD CONSTRAINT "UQ_OEA_EXACT_CAMPAIGN_ATTEMPT" UNIQUE ("workspaceId", "campaignId", "enrollmentId", "occurrenceId", "authorizationId", "workflowVersionId", "messageId", "attemptId", "renderDigest")`);
    await queryRunner.query(`ALTER TABLE core."outboundEmailAttempt" ADD CONSTRAINT "CHK_OEA_CAMPAIGN_ACCEPTED_EVIDENCE" CHECK (COALESCE(source <> 'CAMPAIGN_SEQUENCE' OR ("attemptState" = 'ACCEPTED' AND "capacityState" = 'CONSUMED' AND "providerAcceptedAt" IS NOT NULL AND "providerAcceptedAt" <> 'infinity'::timestamptz AND "providerAcceptedAt" <> '-infinity'::timestamptz AND NULLIF(btrim("providerMessageId"),'') IS NOT NULL AND "finalEvidenceDigest" ~ '^[0-9a-f]{64}$' AND "safeOutcomeReason" IS NULL AND "retryable" IS FALSE AND (NULLIF(btrim("providerHeaderMessageId"),'') IS NOT NULL OR NULLIF(btrim("providerMessageExternalId"),'') IS NOT NULL) AND ("providerThreadExternalId" IS NULL OR NULLIF(btrim("providerThreadExternalId"),'') IS NOT NULL) AND NULLIF(btrim("resolvedThreadExternalId"),'') IS NOT NULL AND ("reconciledProviderHeaderMessageId" IS NULL OR NULLIF(btrim("reconciledProviderHeaderMessageId"),'') IS NOT NULL) AND ("providerDeliveredRecipients" IS NULL OR (jsonb_typeof("providerDeliveredRecipients")='object' AND "providerDeliveredRecipients" ?& ARRAY['to','cc','bcc'] AND "providerDeliveredRecipients" - 'to' - 'cc' - 'bcc' = '{}'::jsonb AND jsonb_typeof("providerDeliveredRecipients"->'to')='array' AND jsonb_typeof("providerDeliveredRecipients"->'cc')='array' AND jsonb_typeof("providerDeliveredRecipients"->'bcc')='array' AND NOT jsonb_path_exists("providerDeliveredRecipients", '$.*[*] ? (@.type() != "string" || @ == "" || !(@ like_regex "^[^A-Z\\s](?:.*[^\\s])?$"))'))) AND (("projectedMessageId" IS NULL AND "projectedMessageThreadId" IS NULL) OR ("projectedMessageId" IS NOT NULL AND "projectedMessageThreadId" IS NOT NULL))) OR ("attemptState" <> 'ACCEPTED' AND "providerHeaderMessageId" IS NULL AND "providerMessageExternalId" IS NULL AND "reconciledProviderHeaderMessageId" IS NULL AND "providerThreadExternalId" IS NULL AND "resolvedThreadExternalId" IS NULL AND "providerDeliveredRecipients" IS NULL AND "projectedMessageId" IS NULL AND "projectedMessageThreadId" IS NULL), FALSE))`);
    await queryRunner.query(`ALTER TABLE core."outboundEmailAttempt" ADD CONSTRAINT "CHK_OEA_LEGACY_NEW_EVIDENCE_NULL" CHECK (COALESCE(source = 'CAMPAIGN_SEQUENCE' OR ("providerHeaderMessageId" IS NULL AND "providerMessageExternalId" IS NULL AND "reconciledProviderHeaderMessageId" IS NULL AND "providerThreadExternalId" IS NULL AND "resolvedThreadExternalId" IS NULL AND "providerDeliveredRecipients" IS NULL AND "projectedMessageThreadId" IS NULL), FALSE))`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_OEA_CAMPAIGN_MICROSOFT_EXTERNAL" ON core."outboundEmailAttempt" ("workspaceId", "connectedAccountId", "messageChannelId", "providerMessageExternalId") WHERE source='CAMPAIGN_SEQUENCE' AND provider='microsoft' AND "providerMessageExternalId" IS NOT NULL`);
    await queryRunner.query(`CREATE TABLE core."campaignOutboundRender" ("attemptId" uuid NOT NULL, "workspaceId" uuid NOT NULL, "campaignId" uuid NOT NULL, "enrollmentId" uuid NOT NULL, "occurrenceId" uuid NOT NULL, "authorizationId" uuid NOT NULL, "workflowVersionId" uuid NOT NULL, "messageId" uuid NOT NULL, "renderDigest" text NOT NULL, "signatureDigest" text, "rendererRevision" text NOT NULL, subject text NOT NULL, html text NOT NULL, text text NOT NULL, "bodyWithSignature" text NOT NULL, "toRecipient" text NOT NULL, "inReplyTo" text, "threadExternalId" text, "references" jsonb NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now(), CONSTRAINT "PK_CAMPAIGN_OUTBOUND_RENDER" PRIMARY KEY ("attemptId"), CONSTRAINT "CHK_COR_RENDER_DIGEST" CHECK ("renderDigest" ~ '^[0-9a-f]{64}$'), CONSTRAINT "CHK_COR_SIGNATURE_DIGEST" CHECK ("signatureDigest" IS NULL OR "signatureDigest" ~ '^[0-9a-f]{64}$'), CONSTRAINT "CHK_COR_NONEMPTY_MATERIAL" CHECK (btrim("rendererRevision") <> '' AND btrim(subject) <> '' AND btrim(html) <> '' AND btrim("toRecipient") <> ''), CONSTRAINT "CHK_COR_RECIPIENT_NORMALIZED" CHECK ("toRecipient"=lower(btrim("toRecipient"))), CONSTRAINT "CHK_COR_THREAD_MATERIAL" CHECK (("inReplyTo" IS NULL OR btrim("inReplyTo") <> '') AND ("threadExternalId" IS NULL OR btrim("threadExternalId") <> '')), CONSTRAINT "CHK_COR_REFERENCES" CHECK (jsonb_typeof("references")='array' AND NOT jsonb_path_exists("references", '$[*] ? (@.type() != "string" || @ == "")')))`);
    await queryRunner.query(`ALTER TABLE core."campaignOutboundRender" ADD CONSTRAINT "FK_COR_EXACT_ATTEMPT" FOREIGN KEY ("workspaceId", "campaignId", "enrollmentId", "occurrenceId", "authorizationId", "workflowVersionId", "messageId", "attemptId", "renderDigest") REFERENCES core."outboundEmailAttempt"("workspaceId", "campaignId", "enrollmentId", "occurrenceId", "authorizationId", "workflowVersionId", "messageId", "attemptId", "renderDigest") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    await queryRunner.query(`CREATE FUNCTION core.campaign_outbound_render_immutable_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'campaign outbound render is immutable'; END; $$`);
    await queryRunner.query(`CREATE TRIGGER "TRG_COR_IMMUTABLE_UPDATE" BEFORE UPDATE ON core."campaignOutboundRender" FOR EACH ROW EXECUTE FUNCTION core.campaign_outbound_render_immutable_guard()`);
    await queryRunner.query(`CREATE INDEX "IDX_CO_DUE_PENDING" ON core."campaignOccurrence" ("dueAt", "workspaceId", "campaignId", id) WHERE state='PENDING'`);
    await queryRunner.query(`CREATE INDEX "IDX_CO_UNRESOLVED" ON core."campaignOccurrence" (state, "updatedAt", id) WHERE state IN ('IN_FLIGHT','UNKNOWN','HELD')`);
    await queryRunner.query(`DROP INDEX core."IDX_OUTBOUND_EMAIL_ATTEMPT_RECONCILIATION"`);
    await queryRunner.query(`CREATE INDEX "IDX_OUTBOUND_EMAIL_ATTEMPT_RECONCILIATION" ON core."outboundEmailAttempt" ("attemptState", "unknownAfter", "updatedAt", "attemptId") WHERE "attemptState" IN ('RESERVED','PROCESSING','UNKNOWN','ACCEPTED')`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX core."IDX_OUTBOUND_EMAIL_ATTEMPT_RECONCILIATION"`);
    await queryRunner.query(`CREATE INDEX "IDX_OUTBOUND_EMAIL_ATTEMPT_RECONCILIATION" ON core."outboundEmailAttempt" ("attemptState", "unknownAfter") WHERE "attemptState" IN ('PROCESSING','UNKNOWN')`);
    await queryRunner.query(`DROP INDEX core."IDX_CO_UNRESOLVED"`);
    await queryRunner.query(`DROP INDEX core."IDX_CO_DUE_PENDING"`);
    await queryRunner.query(`DROP TRIGGER "TRG_COR_IMMUTABLE_UPDATE" ON core."campaignOutboundRender"`);
    await queryRunner.query(`DROP FUNCTION core.campaign_outbound_render_immutable_guard()`);
    await queryRunner.query(`DROP TABLE core."campaignOutboundRender"`);
    await queryRunner.query(`DROP INDEX core."UQ_OEA_CAMPAIGN_MICROSOFT_EXTERNAL"`);
    await queryRunner.query(`ALTER TABLE core."outboundEmailAttempt" DROP CONSTRAINT "CHK_OEA_LEGACY_NEW_EVIDENCE_NULL"`);
    await queryRunner.query(`ALTER TABLE core."outboundEmailAttempt" DROP CONSTRAINT "CHK_OEA_CAMPAIGN_ACCEPTED_EVIDENCE"`);
    await queryRunner.query(`ALTER TABLE core."outboundEmailAttempt" DROP CONSTRAINT "UQ_OEA_EXACT_CAMPAIGN_ATTEMPT"`);
    for (const name of ['projectedMessageThreadId','providerDeliveredRecipients','resolvedThreadExternalId','providerThreadExternalId','reconciledProviderHeaderMessageId','providerMessageExternalId','providerHeaderMessageId']) await queryRunner.query(`ALTER TABLE core."outboundEmailAttempt" DROP COLUMN "${name}"`);
    await queryRunner.query(`ALTER TABLE core."campaignEnrollment" DROP CONSTRAINT "CHK_CEN_TERMINAL_SHAPE"`);
    await queryRunner.query(`ALTER TABLE core."campaignOccurrence" DROP CONSTRAINT "CHK_CO_TERMINAL_SHAPE"`);
    await queryRunner.query(`ALTER TABLE core."campaignEnrollment" ADD CONSTRAINT "CHK_CEN_TERMINAL_SHAPE" CHECK ((state='ACTIVE' AND ("holdReason" IS NULL OR btrim("holdReason") <> '') AND "terminalReason" IS NULL AND "terminalAt" IS NULL) OR (state IN ('REPLIED','EXCLUDED','FINISHED') AND "holdReason" IS NULL AND "terminalReason" IS NOT NULL AND btrim("terminalReason") <> '' AND "terminalAt" IS NOT NULL AND (state <> 'FINISHED' OR "nextAuthoredMessageIndex"="authoredMessageCount")))`);
    await queryRunner.query(`ALTER TABLE core."campaignOccurrence" ADD CONSTRAINT "CHK_CO_TERMINAL_SHAPE" CHECK ((state IN ('PENDING','IN_FLIGHT','UNKNOWN') AND "holdReason" IS NULL AND "terminalReason" IS NULL AND "terminalAt" IS NULL) OR (state='HELD' AND "holdReason" IS NOT NULL AND btrim("holdReason") <> '' AND "terminalReason" IS NULL AND "terminalAt" IS NULL) OR (state IN ('SUCCEEDED','SKIPPED','CANCELLED') AND "holdReason" IS NULL AND "terminalReason" IS NOT NULL AND btrim("terminalReason") <> '' AND "terminalAt" IS NOT NULL))`);
  }
}
