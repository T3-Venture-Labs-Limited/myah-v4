import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.19.0', 1784488000000)
export class RepairManagedProviderOperationRetentionFastInstanceCommand
  implements FastInstanceCommand
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "core"."managedProviderOperation" DROP CONSTRAINT IF EXISTS "FK_MANAGED_PROVIDER_OPERATION_WORKSPACE"',
    );
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // The amended foundation owns the retained, nullable schema.
  }
}
