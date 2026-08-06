import { QueryRunner } from 'typeorm';
import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.20.0', 1786000003000)
export class CreateManagedEmailOfferFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE "core"."managedEmailOffer" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "workspaceId" uuid NOT NULL, "actorWorkspaceMemberId" uuid NOT NULL, "kind" text NOT NULL, "state" text NOT NULL, "proposalId" uuid, "quoteId" uuid, "providerInventoryId" text, "expiresAt" timestamptz NOT NULL, "fingerprint" text, "proposalFingerprint" text, "quoteFingerprint" text, "proposalSnapshot" jsonb, "quoteSnapshot" jsonb, "consumedOperationId" uuid, "idempotencyKey" text, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(), CONSTRAINT "PK_managedEmailOffer_id" PRIMARY KEY ("id"), CONSTRAINT "UQ_MANAGED_EMAIL_OFFER_WORKSPACE_ID" UNIQUE ("workspaceId", "id"), CONSTRAINT "UQ_MANAGED_EMAIL_OFFER_WORKSPACE_IDEMPOTENCY" UNIQUE ("workspaceId", "idempotencyKey"), CONSTRAINT "FK_managedEmailOffer_workspace" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE)',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_MANAGED_EMAIL_OFFER_EXPIRY" ON "core"."managedEmailOffer" ("expiresAt")',
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_MANAGED_EMAIL_OFFER_PROPOSAL" ON "core"."managedEmailOffer" ("workspaceId", "proposalId") WHERE "kind" = 'PROPOSAL'`,
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_MANAGED_EMAIL_OFFER_QUOTE" ON "core"."managedEmailOffer" ("workspaceId", "quoteId")',
    );
  }
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX "core"."IDX_MANAGED_EMAIL_OFFER_QUOTE"',
    );
    await queryRunner.query(
      'DROP INDEX "core"."IDX_MANAGED_EMAIL_OFFER_PROPOSAL"',
    );
    await queryRunner.query(
      'DROP INDEX "core"."IDX_MANAGED_EMAIL_OFFER_EXPIRY"',
    );
    await queryRunner.query('DROP TABLE "core"."managedEmailOffer"');
  }
}
