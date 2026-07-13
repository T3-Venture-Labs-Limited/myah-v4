import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.19.0', 1783922687955)
export class CreateCustomerAccountControlPlaneFastInstanceCommand
  implements FastInstanceCommand
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE "core"."customerAccount" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_1809b8a190c9b2a08a7674ec178" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE TABLE "core"."myahWorkspaceInstallation" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "customerAccountId" uuid NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_9a296caaa5236bba54537955435" PRIMARY KEY ("id"), CONSTRAINT "FK_ffc7c3969dace403842f00c38ab" FOREIGN KEY ("customerAccountId") REFERENCES "core"."customerAccount"("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_ba6cef6db9843fee885ae523b20" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION)',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_MYAH_WORKSPACE_INSTALLATION_CUSTOMER_ACCOUNT_ID" ON "core"."myahWorkspaceInstallation" ("customerAccountId") ',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_MYAH_WORKSPACE_INSTALLATION_WORKSPACE_ID_UNIQUE" ON "core"."myahWorkspaceInstallation" ("workspaceId") ',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "core"."myahWorkspaceInstallation"');
    await queryRunner.query('DROP TABLE "core"."customerAccount"');
  }
}
