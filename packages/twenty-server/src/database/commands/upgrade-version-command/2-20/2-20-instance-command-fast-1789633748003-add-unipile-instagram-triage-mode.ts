import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.20.0', 1789633748003)
export class AddUnipileInstagramTriageModeFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "core"."unipileInstagramSyncRun" ADD COLUMN "triageMode" text NOT NULL DEFAULT 'BACKFILL'`,
    );
    await queryRunner.query(
      `ALTER TABLE "core"."unipileInstagramSyncRun" ADD CONSTRAINT "CHK_UNIPILE_IG_SYNC_RUN_TRIAGE_MODE" CHECK ("triageMode" IN ('LIVE', 'BACKFILL'))`,
    );
    // Contract-required bounded backfill: it preserves the persisted LIVE mode
    // for resumable runs whose binding already completed an earlier sync.
    await queryRunner.query(
      // oxlint-disable-next-line twenty/no-data-mutation-in-fast-instance-command
      `UPDATE "core"."unipileInstagramSyncRun" AS run
       SET "triageMode" = 'LIVE'
       WHERE EXISTS (
         SELECT 1
         FROM "core"."unipileInstagramSyncRun" AS earlier_run
         WHERE earlier_run."bindingId" = run."bindingId"
           AND earlier_run."status" = 'COMPLETED'
           AND earlier_run."createdAt" < run."createdAt"
       )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "core"."unipileInstagramSyncRun" DROP CONSTRAINT IF EXISTS "CHK_UNIPILE_IG_SYNC_RUN_TRIAGE_MODE"`,
    );
    await queryRunner.query(
      `ALTER TABLE "core"."unipileInstagramSyncRun" DROP COLUMN IF EXISTS "triageMode"`,
    );
  }
}
