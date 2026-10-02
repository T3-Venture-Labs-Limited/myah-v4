import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.20.0', 1789064096741)
export class VerifyMainSchemaBaselineFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TYPE "core"."actionExecutionReceipt_state_enum" RENAME TO "actionExecutionReceipt_state_enum_old"');
    await queryRunner.query('CREATE TYPE "core"."actionExecutionReceipt_state_enum" AS ENUM(\'PROCESSING\', \'PROVIDER_ACCEPTED\', \'SENT\', \'BLOCKED\', \'FAILED\', \'UNKNOWN\')');
    await queryRunner.query('ALTER TABLE "core"."actionExecutionReceipt" ALTER COLUMN "state" TYPE "core"."actionExecutionReceipt_state_enum" USING "state"::"text"::"core"."actionExecutionReceipt_state_enum"');
    await queryRunner.query('DROP TYPE "core"."actionExecutionReceipt_state_enum_old"');
    await queryRunner.query('ALTER TYPE "core"."actionApprovalBinding_state_enum" RENAME TO "actionApprovalBinding_state_enum_old"');
    await queryRunner.query('CREATE TYPE "core"."actionApprovalBinding_state_enum" AS ENUM(\'PENDING\', \'APPROVED\', \'REJECTED\', \'CHANGES_REQUESTED\', \'EXPIRED\', \'CONSUMED\')');
    await queryRunner.query('ALTER TABLE "core"."actionApprovalBinding" ALTER COLUMN "state" TYPE "core"."actionApprovalBinding_state_enum" USING "state"::"text"::"core"."actionApprovalBinding_state_enum"');
    await queryRunner.query('DROP TYPE "core"."actionApprovalBinding_state_enum_old"');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE TYPE "core"."actionApprovalBinding_state_enum_old" AS ENUM(\'APPROVED\', \'CHANGES_REQUESTED\', \'CONSUMED\', \'EXPIRED\', \'PENDING\', \'REJECTED\')');
    await queryRunner.query('ALTER TABLE "core"."actionApprovalBinding" ALTER COLUMN "state" TYPE "core"."actionApprovalBinding_state_enum_old" USING "state"::"text"::"core"."actionApprovalBinding_state_enum_old"');
    await queryRunner.query('DROP TYPE "core"."actionApprovalBinding_state_enum"');
    await queryRunner.query('ALTER TYPE "core"."actionApprovalBinding_state_enum_old" RENAME TO "actionApprovalBinding_state_enum"');
    await queryRunner.query('CREATE TYPE "core"."actionExecutionReceipt_state_enum_old" AS ENUM(\'BLOCKED\', \'FAILED\', \'PROCESSING\', \'PROVIDER_ACCEPTED\', \'SENT\', \'UNKNOWN\')');
    await queryRunner.query('ALTER TABLE "core"."actionExecutionReceipt" ALTER COLUMN "state" TYPE "core"."actionExecutionReceipt_state_enum_old" USING "state"::"text"::"core"."actionExecutionReceipt_state_enum_old"');
    await queryRunner.query('DROP TYPE "core"."actionExecutionReceipt_state_enum"');
    await queryRunner.query('ALTER TYPE "core"."actionExecutionReceipt_state_enum_old" RENAME TO "actionExecutionReceipt_state_enum"');
  }
}
