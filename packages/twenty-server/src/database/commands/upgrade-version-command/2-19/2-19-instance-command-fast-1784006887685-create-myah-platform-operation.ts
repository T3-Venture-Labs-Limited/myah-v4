import { type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.19.0', 1784006887685)
export class CreateMyahPlatformOperationFastInstanceCommand
  implements FastInstanceCommand
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "core"."myahPlatformOperation" ("id" uuid NOT NULL, "operatorId" character varying NOT NULL, "idempotencyKey" character varying NOT NULL, "requestHash" character varying NOT NULL, "action" character varying NOT NULL, "resourceType" character varying NOT NULL, "resourceId" character varying NOT NULL, "status" character varying NOT NULL, "requestBody" jsonb NOT NULL, "result" jsonb, "errorCode" character varying, "errorMessage" character varying, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "completedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_myahPlatformOperation_id" PRIMARY KEY ("id"), CONSTRAINT "UQ_myahPlatformOperation_operator_idempotency" UNIQUE ("operatorId", "idempotencyKey"))`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_myahPlatformOperation_resource" ON "core"."myahPlatformOperation" ("resourceType", "resourceId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "core"."myahPlatformOperation"`,
    );
  }
}
