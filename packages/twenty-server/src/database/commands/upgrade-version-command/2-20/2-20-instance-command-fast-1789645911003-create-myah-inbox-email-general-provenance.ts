import { type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.20.0', 1789645911003)
export class CreateMyahInboxEmailGeneralProvenanceFastInstanceCommand implements FastInstanceCommand {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS core."myahInboxEmailGeneralProvenance" (
      "workspaceId" uuid NOT NULL REFERENCES core.workspace(id) ON DELETE CASCADE,
      "deliveryTargetId" uuid NOT NULL,
      "creatorId" uuid NOT NULL,
      "revokedAt" timestamptz,
      PRIMARY KEY ("workspaceId", "deliveryTargetId")
    )`);
    // No backfill: historical NULL also represents a hard-deleted Campaign.
    // Tombstones prevent a deleted/relinked identity from regaining proof.
    await queryRunner.query(`CREATE OR REPLACE FUNCTION core."recordMyahInboxEmailGeneralProvenance"()
      RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF TG_OP = 'INSERT' THEN
          IF NEW."creatorId" IS NOT NULL AND NEW."myahCampaignId" IS NULL AND NEW."deletedAt" IS NULL THEN
            INSERT INTO core."myahInboxEmailGeneralProvenance" (
              "workspaceId", "deliveryTargetId", "creatorId"
            ) VALUES (TG_ARGV[0]::uuid, NEW.id, NEW."creatorId")
            ON CONFLICT DO NOTHING;
          END IF;
        ELSIF TG_OP = 'DELETE' THEN
          UPDATE core."myahInboxEmailGeneralProvenance" SET "revokedAt" = COALESCE("revokedAt", now())
          WHERE "workspaceId" = TG_ARGV[0]::uuid AND "deliveryTargetId" = OLD.id;
        ELSIF NEW."creatorId" IS DISTINCT FROM OLD."creatorId"
          OR NEW."myahCampaignId" IS DISTINCT FROM OLD."myahCampaignId"
          OR NEW."deletedAt" IS DISTINCT FROM OLD."deletedAt"
          OR NEW.id IS DISTINCT FROM OLD.id THEN
          UPDATE core."myahInboxEmailGeneralProvenance" SET "revokedAt" = COALESCE("revokedAt", now())
          WHERE "workspaceId" = TG_ARGV[0]::uuid AND "deliveryTargetId" = OLD.id;
        END IF;
        RETURN NULL;
      END $$`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Workspace triggers must be removed explicitly before dropping this function.
    await queryRunner.query('DROP FUNCTION IF EXISTS core."recordMyahInboxEmailGeneralProvenance"()');
    await queryRunner.query('DROP TABLE IF EXISTS core."myahInboxEmailGeneralProvenance"');
  }
}
