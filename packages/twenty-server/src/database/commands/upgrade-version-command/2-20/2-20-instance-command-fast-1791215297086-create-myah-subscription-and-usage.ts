import { type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.20.0', 1791215297086, { catchUpOnResume: true })
export class CreateMyahSubscriptionAndUsageFastInstanceCommand implements FastInstanceCommand {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS core."myahWorkspaceSubscription" (
      "workspaceId" uuid NOT NULL PRIMARY KEY REFERENCES core."workspace"("id") ON DELETE CASCADE,
      "stripeSubscriptionId" text UNIQUE,
      "stripeStatus" text,
      "cancelAtPeriodEnd" boolean NOT NULL DEFAULT false,
      "currentPeriodEnd" timestamptz,
      "usagePeriodStart" timestamptz,
      "usagePeriodEnd" timestamptz,
      "hadPaidSubscription" boolean NOT NULL DEFAULT false,
      "instagramDisconnectedForLapseAt" timestamptz,
      "updatedAt" timestamptz NOT NULL DEFAULT now()
    )`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS core."myahUsageEntry" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
      "workspaceId" uuid NOT NULL REFERENCES core."workspace"("id") ON DELETE CASCADE,
      "usagePeriodStart" timestamptz,
      "category" text NOT NULL,
      "costMicrousd" bigint NOT NULL CHECK ("costMicrousd" >= 0),
      "quantity" numeric NOT NULL DEFAULT 1,
      "sourceKey" text NOT NULL,
      "details" jsonb,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "UQ_MYAH_USAGE_ENTRY_SOURCE" UNIQUE ("workspaceId", "sourceKey")
    )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_MYAH_USAGE_ENTRY_PERIOD"
      ON core."myahUsageEntry" ("workspaceId", "usagePeriodStart")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS core."myahUsageEntry"`);
    await queryRunner.query(`DROP TABLE IF EXISTS core."myahWorkspaceSubscription"`);
  }
}
