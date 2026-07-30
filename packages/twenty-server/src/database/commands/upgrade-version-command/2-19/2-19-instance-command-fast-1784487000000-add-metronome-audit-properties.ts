import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.19.0', 1784487000000)
export class AddMetronomeAuditPropertiesFastInstanceCommand
  implements FastInstanceCommand
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "core"."managedProviderOperation" ADD COLUMN IF NOT EXISTS "maximumMetronomeProperties" jsonb',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."managedProviderOperation" ADD COLUMN IF NOT EXISTS "actualMetronomeProperties" jsonb',
    );
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // These columns are also owned by the amended foundation command. A repair
    // rollback must not remove schema that a fresh 2.19 installation created.
  }
}
