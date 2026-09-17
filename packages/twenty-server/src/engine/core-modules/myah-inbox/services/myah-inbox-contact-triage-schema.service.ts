import { Injectable } from '@nestjs/common';

import { type QueryRunner } from 'typeorm';

import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { escapeIdentifier } from 'src/engine/workspace-manager/workspace-migration/utils/remove-sql-injection.util';

@Injectable()
export class MyahInboxContactTriageSchemaService {
  async ensureWorkspaceTables(
    queryRunner: QueryRunner,
    workspaceId: string,
  ): Promise<void> {
    const workspaceSchemaName = getWorkspaceSchemaName(workspaceId);
    const schema = escapeIdentifier(workspaceSchemaName);
    const [existingMarker] = (await queryRunner.query(
      'SELECT to_regclass($1) IS NOT NULL AS "exists"',
      [`${schema}."myahInboxTriageMigration"`],
    )) as Array<{ exists: boolean }>;

    // Provisioning is transactional and creates the marker last. Its presence
    // therefore proves the whole private schema exists. Avoiding repeated
    // CREATE INDEX IF NOT EXISTS statements also avoids taking relation locks
    // before the migration marker and inverting the producer lock order.
    if (existingMarker?.exists) return;

    const statements = [
      `
        CREATE TABLE IF NOT EXISTS ${schema}."myahInboxContactIdentity" (
          "contactIdentityKey" text PRIMARY KEY, "generation" bigint NOT NULL DEFAULT 1 CHECK ("generation" >= 1),
          "isActive" boolean NOT NULL DEFAULT true, "updatedAt" timestamptz(3) NOT NULL DEFAULT now()
        );
      `,
      `
        CREATE TABLE IF NOT EXISTS ${schema}."myahInboxContactTriage" (
          "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(), "contactIdentityKey" text NOT NULL UNIQUE,
          "identityGeneration" bigint NOT NULL, "inboxOwnerId" uuid NULL,
          "inboxState" text NOT NULL CHECK ("inboxState" IN ('NEEDS_REPLY','WAITING_ON_CREATOR','SNOOZED','CLOSED')),
          "snoozedUntil" timestamptz(3) NULL, "revision" integer NOT NULL CHECK ("revision" >= 1),
          "hasStateDecision" boolean NOT NULL DEFAULT false,
          "stateDecisionAt" timestamptz(3) NOT NULL, "lastInboundOccurredAt" timestamptz(3) NULL,
          "lastInboundOrderKey" text NULL, "triageChangedAt" timestamptz(3) NOT NULL,
          CHECK (("inboxState" = 'SNOOZED') = ("snoozedUntil" IS NOT NULL)),
          FOREIGN KEY ("contactIdentityKey") REFERENCES ${schema}."myahInboxContactIdentity"("contactIdentityKey"),
          FOREIGN KEY ("inboxOwnerId") REFERENCES ${schema}."workspaceMember"("id") ON DELETE SET NULL
        );
      `,
      `
        CREATE TABLE IF NOT EXISTS ${schema}."myahInboxTriageTransitionReceipt" (
          "sequence" bigserial PRIMARY KEY, "channel" text NOT NULL CHECK ("channel" IN ('EMAIL','INSTAGRAM')),
          "persistedMessageId" uuid NOT NULL, "sourceRecordId" uuid NOT NULL, "sourceGenerationId" text NOT NULL,
          "mode" text NOT NULL CHECK ("mode" IN ('LIVE','BACKFILL')),
          "direction" text NOT NULL CHECK ("direction" IN ('INBOUND','OUTBOUND','UNKNOWN')),
          "providerOccurredAt" timestamptz(3) NULL, "originalCreatedAt" timestamptz(3) NOT NULL,
          "normalizedOccurredAt" timestamptz(3) NOT NULL, "orderKey" text NOT NULL,
          "status" text NOT NULL CHECK ("status" IN ('PENDING','COMPLETE')),
          "createdAt" timestamptz(3) NOT NULL DEFAULT now(), "completedAt" timestamptz(3) NULL,
          UNIQUE ("channel", "persistedMessageId")
        );
      `,
      // Receipt provenance is intentionally independent of live messages and
      // associations: tuple state can outlive their retention cleanup.
      `
        CREATE TABLE IF NOT EXISTS ${schema}."myahInboxTriageEmailChannelProvenance" (
          "persistedMessageId" uuid PRIMARY KEY,
          "messageChannelIds" uuid[] NOT NULL
        );
      `,
      `
        CREATE INDEX IF NOT EXISTS "myahInboxTriageTransitionReceipt_pending"
          ON ${schema}."myahInboxTriageTransitionReceipt" ("status", "sequence", "normalizedOccurredAt", "orderKey");
      `,
      `
        CREATE TABLE IF NOT EXISTS ${schema}."myahInboxTriageMigration" (
          "id" boolean PRIMARY KEY DEFAULT true CHECK ("id"),
          "status" text NOT NULL CHECK ("status" IN ('MIGRATING','READY')),
          "baselineFenceSequence" bigint NULL, "baselineStartedAt" timestamptz(3) NULL,
          "version" bigint NOT NULL DEFAULT 1, "updatedAt" timestamptz(3) NOT NULL DEFAULT now()
        );
      `,
    ];

    for (const statement of statements) {
      await queryRunner.query(statement);
    }
  }

  async initializeNewWorkspaceInTransaction(
    queryRunner: QueryRunner,
    workspaceId: string,
  ): Promise<void> {
    const schema = escapeIdentifier(getWorkspaceSchemaName(workspaceId));
    const statement = `
      INSERT INTO ${schema}."myahInboxTriageMigration" (
        "id", "status", "baselineFenceSequence", "baselineStartedAt"
      ) VALUES (true, 'READY', 0, now())
      ON CONFLICT ("id") DO NOTHING;
    `;

    await queryRunner.query(statement);
  }
}
