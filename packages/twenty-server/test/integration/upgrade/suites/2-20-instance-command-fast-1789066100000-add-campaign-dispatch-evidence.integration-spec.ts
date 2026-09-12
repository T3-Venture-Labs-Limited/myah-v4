import { randomUUID } from 'node:crypto';

import { type QueryRunner } from 'typeorm';

import { AddCampaignDispatchEvidenceFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1789066100000-add-campaign-dispatch-evidence';
import { MailboxCapacityService } from 'src/modules/campaign-execution/services/mailbox-capacity.service';
import { OutboundEmailAttemptService } from 'src/modules/campaign-execution/services/outbound-email-attempt.service';

describe('2.20 fast command 1789066100000 (postgres)', () => {
  let runner: QueryRunner;

  beforeAll(async () => {
    runner = global.testDataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    await runner.query(`CREATE SCHEMA IF NOT EXISTS core`);
    await runner.query(`CREATE TABLE core."campaignOccurrence" (
      id uuid PRIMARY KEY, "workspaceId" uuid NOT NULL, "campaignId" uuid NOT NULL,
      "enrollmentId" uuid NOT NULL, "workflowVersionId" uuid NOT NULL, "messageId" uuid NOT NULL,
      state text NOT NULL, "dueAt" timestamptz NOT NULL, "holdReason" text,
      "terminalReason" text, "terminalAt" timestamptz, "updatedAt" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "CHK_CO_TERMINAL_SHAPE" CHECK (true)
    )`);
    await runner.query(`CREATE TABLE core."campaignEnrollment" (
      id uuid PRIMARY KEY, state text NOT NULL, "authoredMessageCount" integer NOT NULL,
      "nextAuthoredMessageIndex" integer NOT NULL, "holdReason" text, "terminalReason" text,
      "terminalAt" timestamptz, CONSTRAINT "CHK_CEN_TERMINAL_SHAPE" CHECK (true)
    )`);
    await runner.query(`CREATE TABLE core."outboundEmailAttempt" (
      "attemptId" uuid PRIMARY KEY, "workspaceId" uuid NOT NULL, source text NOT NULL,
      "attemptState" text NOT NULL, "capacityState" text NOT NULL,
      "connectedAccountId" uuid NOT NULL, "messageChannelId" uuid NOT NULL, provider text NOT NULL,
      "providerMessageId" text, "providerAcceptedAt" timestamptz, "projectedMessageId" uuid,
      "finalEvidenceDigest" text, "safeOutcomeReason" text, retryable boolean,
      "campaignId" uuid, "enrollmentId" uuid, "occurrenceId" uuid, "authorizationId" uuid,
      "workflowVersionId" uuid, "messageId" uuid, "renderDigest" text,
      "unknownAfter" timestamptz NOT NULL, "updatedAt" timestamptz NOT NULL DEFAULT now()
    )`);
    await runner.query(`CREATE INDEX "IDX_OUTBOUND_EMAIL_ATTEMPT_RECONCILIATION"
      ON core."outboundEmailAttempt" ("attemptState", "unknownAfter")
      WHERE "attemptState" IN ('PROCESSING','UNKNOWN')`);
  });

  afterAll(async () => {
    if (runner?.isTransactionActive) await runner.rollbackTransaction();
    if (runner && !runner.isReleased) await runner.release();
  });

  it('atomically authors evidence and rejects render updates', async () => {
    await new AddCampaignDispatchEvidenceFastInstanceCommand().up(runner);
    const names = await runner.query(
      `SELECT conname FROM pg_constraint WHERE conname IN
        ('CHK_OEA_CAMPAIGN_ACCEPTED_EVIDENCE','FK_COR_EXACT_ATTEMPT','CHK_CO_TERMINAL_SHAPE')
        ORDER BY conname`,
    );
    expect(names.map(({ conname }: { conname: string }) => conname)).toEqual([
      'CHK_CO_TERMINAL_SHAPE',
      'CHK_OEA_CAMPAIGN_ACCEPTED_EVIDENCE',
      'FK_COR_EXACT_ATTEMPT',
    ]);

    const ids = Array.from({ length: 8 }, () => randomUUID());
    const renderDigest = 'a'.repeat(64);
    await runner.query(
      `INSERT INTO core."outboundEmailAttempt"
        ("attemptId","workspaceId",source,"attemptState","capacityState","connectedAccountId","messageChannelId",provider,
         "campaignId","enrollmentId","occurrenceId","authorizationId","workflowVersionId","messageId","renderDigest","unknownAfter")
       VALUES ($1,$2,'CAMPAIGN_SEQUENCE','RESERVED','RESERVED',$3,$4,'google',$5,$6,$7,$8,$9,$10,$11,now()+interval '1 minute')`,
      [
        ids[0],
        ids[1],
        ids[2],
        ids[3],
        ids[4],
        ids[5],
        ids[6],
        ids[7],
        ids[2],
        ids[3],
        renderDigest,
      ],
    );
    await runner.query(`
      ALTER TABLE core."outboundEmailAttempt"
        ADD COLUMN "normalizedSenderHandle" text,
        ADD COLUMN "normalizedRecipient" text,
        ADD COLUMN "localDate" text,
        ADD COLUMN "selectionConstraintKind" text,
        ADD COLUMN "priorAcceptedEvidenceId" uuid,
        ADD COLUMN "senderPoolFingerprint" text,
        ADD COLUMN "claimedAt" text,
        ADD COLUMN "slotAt" text,
        ADD COLUMN "attemptNumber" integer,
        ADD COLUMN "testPreparationProofId" uuid,
        ADD COLUMN "requesterUserWorkspaceId" uuid,
        ADD COLUMN "previewDigest" text,
        ADD COLUMN "testTransportDigest" text,
        ADD COLUMN "directReservationCapabilityId" uuid,
        ADD COLUMN "createdAt" text NOT NULL DEFAULT (now()::text),
        ALTER COLUMN "unknownAfter" TYPE text USING "unknownAfter"::text
    `);
    await runner.query(
      `UPDATE core."outboundEmailAttempt"
          SET "normalizedSenderHandle"='sender@example.com',
              "normalizedRecipient"='creator@example.com',
              "localDate"=current_date, "selectionConstraintKind"='ROTATE',
              "senderPoolFingerprint"=$2, "claimedAt"=now(), "slotAt"=now(),
              "unknownAfter"=now() + interval '60 seconds', "attemptNumber"=1
        WHERE "attemptId"=$1`,
      [ids[0], 'c'.repeat(64)],
    );
    await runner.query(`
      CREATE TABLE core."mailboxCapacityDay" (
        "workspaceId" uuid NOT NULL,
        "connectedAccountId" uuid NOT NULL,
        "localDate" text NOT NULL,
        "acceptedCount" integer NOT NULL DEFAULT 0,
        "reservedCount" integer NOT NULL DEFAULT 0,
        PRIMARY KEY ("workspaceId", "connectedAccountId", "localDate")
      )
    `);
    await runner.query(
      `INSERT INTO core."mailboxCapacityDay"
        ("workspaceId", "connectedAccountId", "localDate", "reservedCount")
       SELECT "workspaceId", "connectedAccountId", "localDate", 1
         FROM core."outboundEmailAttempt" WHERE "attemptId"=$1`,
      [ids[0]],
    );
    await runner.query(
      `UPDATE core."outboundEmailAttempt"
          SET "attemptState"='BLOCKED', "capacityState"='RELEASED',
              "safeOutcomeReason"='DISPATCH_CONTRACT_CONFLICT', retryable=false
        WHERE "attemptId"=$1 AND "attemptState"='RESERVED' AND "capacityState"='RESERVED'`,
      [ids[0]],
    );
    await runner.query(
      `UPDATE core."mailboxCapacityDay"
          SET "reservedCount"="reservedCount"-1
        WHERE "reservedCount">0`,
    );
    const [releasedDay] = await runner.query(
      `SELECT "reservedCount" FROM core."mailboxCapacityDay"`,
    );

    expect(releasedDay.reservedCount).toBe(0);
    await runner.query(
      `UPDATE core."outboundEmailAttempt"
          SET "attemptState"='RESERVED', "capacityState"='RESERVED',
              "safeOutcomeReason"=NULL, retryable=NULL
        WHERE "attemptId"=$1`,
      [ids[0]],
    );
    await runner.query(
      `UPDATE core."outboundEmailAttempt"
          SET "attemptState"='ACCEPTED', "capacityState"='CONSUMED',
              "providerMessageId"='provider-1', "providerAcceptedAt"=now(),
              "providerHeaderMessageId"='<header@example.com>',
              "providerMessageExternalId"='external-1',
              "providerThreadExternalId"='thread-1',
              "resolvedThreadExternalId"='thread-1',
              "providerDeliveredRecipients"='{"to":["creator@example.com"],"cc":[],"bcc":[]}',
              "finalEvidenceDigest"=$2, "safeOutcomeReason"=NULL, retryable=false
        WHERE "attemptId"=$1`,
      [ids[0], 'b'.repeat(64)],
    );
    const [accepted] = await runner.query(
      `SELECT "attemptState", "capacityState", "providerHeaderMessageId",
              "providerMessageExternalId", "providerThreadExternalId",
              "resolvedThreadExternalId", "providerDeliveredRecipients",
              "providerAcceptedAt", "finalEvidenceDigest", "safeOutcomeReason", retryable
         FROM core."outboundEmailAttempt" WHERE "attemptId"=$1`,
      [ids[0]],
    );
    expect(accepted).toMatchObject({
      attemptState: 'ACCEPTED',
      capacityState: 'CONSUMED',
      providerHeaderMessageId: '<header@example.com>',
      providerMessageExternalId: 'external-1',
      providerThreadExternalId: 'thread-1',
      resolvedThreadExternalId: 'thread-1',
      providerDeliveredRecipients: {
        to: ['creator@example.com'],
        cc: [],
        bcc: [],
      },
      finalEvidenceDigest: 'b'.repeat(64),
      safeOutcomeReason: null,
      retryable: false,
    });
    const rejectsShape = async (name: string, sql: string) => {
      await runner.query(`SAVEPOINT "${name}"`);
      await expect(runner.query(sql, [ids[0]])).rejects.toThrow();
      await runner.query(`ROLLBACK TO SAVEPOINT "${name}"`);
    };
    await rejectsShape(
      'invalid_extra_recipient_key',
      `UPDATE core."outboundEmailAttempt" SET "providerDeliveredRecipients"='{"to":[],"cc":[],"bcc":[],"extra":[]}' WHERE "attemptId"=$1`,
    );
    await rejectsShape(
      'invalid_recipient_value',
      `UPDATE core."outboundEmailAttempt" SET "providerDeliveredRecipients"='{"to":[null],"cc":[],"bcc":[]}' WHERE "attemptId"=$1`,
    );
    await rejectsShape(
      'invalid_null_resolved_thread',
      `UPDATE core."outboundEmailAttempt" SET "resolvedThreadExternalId"=NULL WHERE "attemptId"=$1`,
    );
    await rejectsShape(
      'invalid_partial_projection',
      `UPDATE core."outboundEmailAttempt" SET "projectedMessageThreadId"='${ids[2]}' WHERE "attemptId"=$1`,
    );
    await rejectsShape(
      'invalid_infinite_acceptance',
      `UPDATE core."outboundEmailAttempt" SET "providerAcceptedAt"='infinity' WHERE "attemptId"=$1`,
    );
    await rejectsShape(
      'invalid_blank_final_digest',
      `UPDATE core."outboundEmailAttempt" SET "finalEvidenceDigest"='' WHERE "attemptId"=$1`,
    );

    await runner.query(
      `INSERT INTO core."campaignOutboundRender"
        ("attemptId","workspaceId","campaignId","enrollmentId","occurrenceId","authorizationId","workflowVersionId","messageId","renderDigest","rendererRevision",subject,html,text,"bodyWithSignature","toRecipient","references")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'v1','subject','<p>body</p>','body','body','creator@example.com','[]')`,
      [
        ids[0],
        ids[1],
        ids[4],
        ids[5],
        ids[6],
        ids[7],
        ids[2],
        ids[3],
        renderDigest,
      ],
    );
    await runner.query('SAVEPOINT immutable_render');
    await expect(
      runner.query(
        `UPDATE core."campaignOutboundRender" SET subject='changed' WHERE "attemptId"=$1`,
        [ids[0]],
      ),
    ).rejects.toThrow('campaign outbound render is immutable');
    await runner.query('ROLLBACK TO SAVEPOINT immutable_render');
  });

  it('uses the actual migrated writer for Campaign and every legacy source with exact replay', async () => {
    const capacityService = new MailboxCapacityService();
    const service = new OutboundEmailAttemptService(capacityService);
    const normalizeRows = (value: unknown): unknown => {
      const normalize = (row: Record<string, unknown>) => {
        const copy = { ...row };

        for (const key of ['observedAt', 'providerAcceptedAt', 'updatedAt']) {
          if (copy[key] != null)
            copy[key] = new Date(copy[key] as never).toISOString();
        }

        return copy;
      };

      if (Array.isArray(value)) return value.map(normalize);
      if (
        value !== null &&
        typeof value === 'object' &&
        Array.isArray((value as { records?: unknown }).records)
      ) {
        return {
          ...value,
          records: (
            value as { records: Record<string, unknown>[] }
          ).records.map(normalize),
        };
      }

      return value;
    };
    const manager = {
      queryRunner: {
        isTransactionActive: true,
        query: async (...args: Parameters<QueryRunner['query']>) =>
          normalizeRows(await runner.query(...args)),
      },
    };
    const workspaceId = randomUUID();
    const localDate = new Date().toISOString().slice(0, 10);
    const claimedAt = new Date();
    const slotAt = new Date(claimedAt);
    const unknownAfter = new Date(claimedAt.getTime() + 60_000);
    const digest = 'd'.repeat(64);
    const renderDigest = 'e'.repeat(64);
    const sources = [
      'CAMPAIGN_SEQUENCE',
      'CAMPAIGN_TEST',
      'INBOX',
      'AUTOMATED_REPLY',
    ] as const;

    for (const source of sources) {
      const attemptId = randomUUID();
      const connectedAccountId = randomUUID();
      const messageChannelId = randomUUID();
      const campaignId = randomUUID();
      const enrollmentId = randomUUID();
      const occurrenceId = randomUUID();
      const authorizationId = randomUUID();
      const workflowVersionId = randomUUID();
      const messageId = randomUUID();
      const proofId = randomUUID();
      const requesterId = randomUUID();
      const directCapabilityId = randomUUID();
      const submissionCapabilityId = randomUUID();
      const campaignSource = source === 'CAMPAIGN_SEQUENCE';
      const testSource = source === 'CAMPAIGN_TEST';
      const directSource = source === 'INBOX' || source === 'AUTOMATED_REPLY';

      await runner.query(
        `INSERT INTO core."outboundEmailAttempt" (
          "attemptId","workspaceId",source,"attemptState","capacityState",
          "connectedAccountId","messageChannelId",provider,"normalizedSenderHandle",
          "normalizedRecipient","localDate","selectionConstraintKind",
          "priorAcceptedEvidenceId","senderPoolFingerprint","claimedAt","slotAt",
          "unknownAfter","campaignId","enrollmentId","occurrenceId","authorizationId",
          "workflowVersionId","messageId","attemptNumber","renderDigest",
          "testPreparationProofId","requesterUserWorkspaceId","previewDigest",
          "testTransportDigest","directReservationCapabilityId","finalEvidenceDigest"
        ) VALUES (
          $1,$2,$3,'PROCESSING','RESERVED',$4,$5,'google','sender@example.com',
          'recipient@example.com',$6,$7,NULL,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
          $18,$19,$20,$21,$22,$23,$24,$25
        )`,
        [
          attemptId,
          workspaceId,
          source,
          connectedAccountId,
          messageChannelId,
          localDate,
          directSource ? 'EXPLICIT' : 'ROTATE',
          directSource ? null : digest,
          claimedAt.toISOString(),
          slotAt.toISOString(),
          unknownAfter.toISOString(),
          campaignSource || testSource ? campaignId : null,
          campaignSource ? enrollmentId : null,
          campaignSource ? occurrenceId : null,
          campaignSource ? authorizationId : null,
          campaignSource || testSource ? workflowVersionId : null,
          campaignSource || testSource ? messageId : null,
          campaignSource ? 1 : null,
          campaignSource || testSource ? renderDigest : null,
          testSource ? proofId : null,
          testSource ? requesterId : null,
          testSource ? digest : null,
          testSource ? renderDigest : null,
          directSource ? directCapabilityId : null,
          digest,
        ],
      );
      await runner.query(
        `INSERT INTO core."mailboxCapacityDay"
          ("workspaceId","connectedAccountId","localDate","reservedCount")
         VALUES ($1,$2,$3,1)`,
        [workspaceId, connectedAccountId, localDate],
      );
      const common = {
        attemptId,
        connectedAccountId,
        finalEvidenceDigest: digest,
        messageChannelId,
        normalizedRecipient: 'recipient@example.com',
        normalizedSenderHandle: 'sender@example.com',
        provider: 'google',
        source,
        workspaceId,
      };
      const reservationBinding = {
        claimedAt,
        localDate,
        priorAcceptedEvidenceId: null,
        selectionConstraintKind: directSource ? 'EXPLICIT' : 'ROTATE',
        ...(directSource
          ? { directReservationCapabilityId: directCapabilityId }
          : { senderPoolFingerprint: digest }),
        ...(campaignSource ? { attemptNumber: 1 } : {}),
        slotAt,
        unknownAfter,
      };
      const submission = campaignSource
        ? {
            ...common,
            authorizationId,
            campaignId,
            enrollmentId,
            messageId,
            occurrenceId,
            renderDigest,
            submissionCapability: {
              attemptId,
              kind: 'CAMPAIGN_SEQUENCE_SUBMISSION',
              renderContext: {
                authorizationId,
                campaignId,
                connectedAccountId,
                enrollmentId,
                messageChannelId,
                messageId,
                normalizedRecipient: common.normalizedRecipient,
                normalizedSenderHandle: common.normalizedSenderHandle,
                occurrenceId,
                provider: common.provider,
                workflowVersionId,
                workspaceId,
              },
              renderDigest,
              reservationBinding,
            },
            workflowVersionId,
          }
        : testSource
          ? {
              ...common,
              campaignId,
              messageId,
              previewDigest: digest,
              renderDigest,
              requesterUserWorkspaceId: requesterId,
              submissionCapability: {
                attemptId,
                campaignId,
                connectedAccountId,
                kind: 'CAMPAIGN_TEST_SUBMISSION',
                messageChannelId,
                messageId,
                normalizedRecipient: common.normalizedRecipient,
                normalizedSenderHandle: common.normalizedSenderHandle,
                previewDigest: digest,
                provider: common.provider,
                renderDigest,
                requesterUserWorkspaceId: requesterId,
                reservationBinding,
                testPreparationProofId: proofId,
                testSubmissionCapabilityId: submissionCapabilityId,
                testTransportDigest: renderDigest,
                workflowVersionId,
                workspaceId,
              },
              testPreparationProofId: proofId,
              testTransportDigest: renderDigest,
              workflowVersionId,
            }
          : {
              ...common,
              directReservationCapabilityId: directCapabilityId,
              submissionCapability: {
                attemptId,
                connectedAccountId,
                directReservationCapabilityId: directCapabilityId,
                directSubmissionCapabilityId: submissionCapabilityId,
                finalEvidenceDigest: digest,
                kind: 'DIRECT_SUBMISSION_CAPABILITY',
                messageChannelId,
                normalizedRecipient: common.normalizedRecipient,
                normalizedSenderHandle: common.normalizedSenderHandle,
                provider: common.provider,
                reservationBinding,
                workspaceId,
              },
            };
      const acceptedInput = {
        ...submission,
        projectedMessageId: null,
        projectedMessageThreadId: null,
        providerDeliveredRecipients: {
          to: ['recipient@example.com'],
          cc: [],
          bcc: [],
        },
        providerHeaderMessageId: '<accepted@example.com>',
        providerMessageExternalId: `external-${source.toLowerCase()}`,
        providerMessageId: `provider-${source.toLowerCase()}`,
        providerThreadExternalId: 'provider-thread',
        resolvedThreadExternalId: 'provider-thread',
      };
      const recorded = await service.recordAccepted(
        acceptedInput as never,
        manager as never,
      );

      expect(recorded).toMatchObject({ status: 'RECORDED' });
      await expect(
        service.recordAccepted(acceptedInput as never, manager as never),
      ).resolves.toMatchObject({ status: 'EXACT_REPLAY' });
      const [persisted] = await runner.query(
        `SELECT "projectedMessageId","projectedMessageThreadId",
                "providerHeaderMessageId","providerMessageExternalId",
                "providerThreadExternalId","resolvedThreadExternalId",
                "providerDeliveredRecipients"
           FROM core."outboundEmailAttempt" WHERE "attemptId"=$1`,
        [attemptId],
      );

      expect(persisted.projectedMessageId).toBeNull();
      expect(persisted.projectedMessageThreadId).toBeNull();
      if (campaignSource) {
        expect(persisted).toMatchObject({
          providerHeaderMessageId: '<accepted@example.com>',
          providerMessageExternalId: 'external-campaign_sequence',
          providerThreadExternalId: 'provider-thread',
          resolvedThreadExternalId: 'provider-thread',
        });
      } else {
        expect(persisted).toMatchObject({
          providerDeliveredRecipients: null,
          providerHeaderMessageId: null,
          providerMessageExternalId: null,
          providerThreadExternalId: null,
          resolvedThreadExternalId: null,
        });
      }
    }
  });
});
