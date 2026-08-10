import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.20.0', 1786000002000)
export class AddManagedProviderStripeCustomerFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "core"."myahWorkspaceInstallation" ADD "stripeCustomerId" varchar',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_MYAH_WORKSPACE_INSTALLATION_STRIPE_CUSTOMER_ID_UNIQUE" ON "core"."myahWorkspaceInstallation" ("stripeCustomerId") WHERE "stripeCustomerId" IS NOT NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX "core"."IDX_MYAH_WORKSPACE_INSTALLATION_STRIPE_CUSTOMER_ID_UNIQUE"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."myahWorkspaceInstallation" DROP COLUMN "stripeCustomerId"',
    );
  }
}
