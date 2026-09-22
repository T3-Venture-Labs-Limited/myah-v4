import { type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.20.0', 1789645911010)
export class CreateCreatorDataOperationReceiptsFastInstanceCommand implements FastInstanceCommand {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE core."creatorDataOperationReceipt" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "kind" varchar(32) NOT NULL,
        "actorWorkspaceMemberId" uuid,
        "attemptKey" varchar(128) NOT NULL,
        "operationKey" varchar(256) NOT NULL,
        "sourceDigest" varchar(64) NOT NULL,
        "creatorId" uuid NOT NULL,
        "socialProfileIds" uuid[] NOT NULL DEFAULT '{}',
        "noteId" uuid,
        "noteTargetId" uuid,
        "result" jsonb NOT NULL DEFAULT '{}',
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_CREATOR_DATA_OPERATION_RECEIPT_WORKSPACE"
          FOREIGN KEY ("workspaceId") REFERENCES core."workspace"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_CREATOR_DATA_OPERATION_RECEIPT_IDENTITY"
          UNIQUE ("workspaceId", "kind", "attemptKey", "operationKey"),
        CONSTRAINT "CHK_CREATOR_DATA_OPERATION_RECEIPT_KIND"
          CHECK ("kind" IN ('LEGACY_MIGRATION', 'SPREADSHEET_IMPORT')),
        CONSTRAINT "CHK_CREATOR_DATA_OPERATION_RECEIPT_REQUIRED_TEXT"
          CHECK (
            btrim("attemptKey") <> ''
            AND btrim("operationKey") <> ''
            AND "sourceDigest" ~ '^[0-9a-f]{64}$'
          )
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_CREATOR_DATA_OPERATION_RECEIPT_WORKSPACE_KIND"
      ON core."creatorDataOperationReceipt" ("workspaceId", "kind")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TABLE core."creatorDataOperationReceipt"',
    );
  }
}
