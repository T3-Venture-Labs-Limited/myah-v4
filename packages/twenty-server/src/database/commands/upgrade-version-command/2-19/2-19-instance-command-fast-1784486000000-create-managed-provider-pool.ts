import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.19.0', 1784486000000)
export class CreateManagedProviderPoolFastInstanceCommand
  implements FastInstanceCommand
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "core"."managedProviderPool" (
        "providerKey" text NOT NULL PRIMARY KEY,
        "state" text NOT NULL,
        "activeTariffVersion" text,
        "activeConfigurationDigest" text,
        "appliedDesiredStateEpoch" bigint NOT NULL DEFAULT 0,
        "appliedDesiredStateDigest" text,
        "rowVersion" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      )
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Current-version repair migrations are intentionally irreversible.
  }
}
