import { type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.19.0', 1810000011000)
export class AddActionReceiptProviderIdentifiersFastInstanceCommand
  implements FastInstanceCommand
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "core"."actionExecutionReceipt" ADD COLUMN IF NOT EXISTS "providerExternalMessageId" text, ADD COLUMN IF NOT EXISTS "providerThreadExternalId" text',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "core"."actionExecutionReceipt" DROP COLUMN IF EXISTS "providerThreadExternalId", DROP COLUMN IF EXISTS "providerExternalMessageId"',
    );
  }
}
