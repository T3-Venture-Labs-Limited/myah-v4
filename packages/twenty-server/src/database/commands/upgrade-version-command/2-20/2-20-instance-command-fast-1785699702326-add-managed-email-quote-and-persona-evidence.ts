import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.20.0', 1785699702326)
export class AddManagedEmailQuoteAndPersonaEvidenceFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "core"."managedEmailMailbox" DROP CONSTRAINT "CHK_MANAGED_EMAIL_MAILBOX_IDENTITIES_NONEMPTY"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."managedEmailAcquisitionOperation" DROP CONSTRAINT "CHK_MANAGED_EMAIL_ACQUISITION_REQUIRED_TEXT"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."managedEmailMailbox" ADD "personaFirstName" text NOT NULL',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."managedEmailMailbox" ADD "personaLastName" text NOT NULL',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."managedEmailMailbox" ALTER COLUMN "personaRole" DROP NOT NULL',
    );
    await queryRunner.query(
      `ALTER TABLE "core"."managedEmailMailbox" ADD CONSTRAINT "CHK_MANAGED_EMAIL_MAILBOX_IDENTITIES_NONEMPTY" CHECK (btrim("address") <> '' AND btrim("normalizedAddress") <> '' AND btrim("personaFirstName") <> '' AND btrim("personaLastName") <> '' AND btrim("personaSignature") <> '' AND btrim("providerType") <> '' AND btrim("providerConfigurationKey") <> '' AND btrim("readinessPolicyVersion") <> '')`,
    );
    await queryRunner.query(
      `ALTER TABLE "core"."managedEmailAcquisitionOperation" ADD CONSTRAINT "CHK_MANAGED_EMAIL_ACQUISITION_REQUIRED_TEXT" CHECK (btrim("idempotencyKey") <> '' AND btrim("proposalHash") <> '' AND btrim("quoteHash") <> '' AND btrim("catalogVersion") <> '' AND btrim("metronomeRateCardAlias") <> '' AND "currency" = 'USD' AND btrim("state") <> '')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "core"."managedEmailAcquisitionOperation" DROP CONSTRAINT "CHK_MANAGED_EMAIL_ACQUISITION_REQUIRED_TEXT"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."managedEmailMailbox" DROP CONSTRAINT "CHK_MANAGED_EMAIL_MAILBOX_IDENTITIES_NONEMPTY"',
    );
    await queryRunner.query(
      `UPDATE "core"."managedEmailMailbox" SET "personaRole" = '' WHERE "personaRole" IS NULL`,
    );
    await queryRunner.query(
      'ALTER TABLE "core"."managedEmailMailbox" ALTER COLUMN "personaRole" SET NOT NULL',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."managedEmailMailbox" DROP COLUMN "personaLastName"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."managedEmailMailbox" DROP COLUMN "personaFirstName"',
    );
    await queryRunner.query(
      `ALTER TABLE "core"."managedEmailMailbox" ADD CONSTRAINT "CHK_MANAGED_EMAIL_MAILBOX_IDENTITIES_NONEMPTY" CHECK (btrim("address") <> '' AND btrim("normalizedAddress") <> '' AND btrim("providerType") <> '' AND btrim("providerConfigurationKey") <> '' AND btrim("readinessPolicyVersion") <> '')`,
    );
    await queryRunner.query(
      `ALTER TABLE "core"."managedEmailAcquisitionOperation" ADD CONSTRAINT "CHK_MANAGED_EMAIL_ACQUISITION_REQUIRED_TEXT" CHECK (btrim("idempotencyKey") <> '' AND btrim("proposalHash") <> '' AND btrim("quoteHash") <> '' AND btrim("catalogVersion") <> '' AND btrim("metronomeRateCardAlias") <> '' AND btrim("currency") <> '' AND btrim("state") <> '')`,
    );
  }
}
