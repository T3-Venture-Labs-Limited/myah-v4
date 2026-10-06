import { type DataSource, type QueryRunner } from 'typeorm';

import { Logger } from '@nestjs/common';

import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type SlowInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/slow-instance-command.interface';

@RegisteredInstanceCommand('2.20.0', 1791217440633, {
  type: 'slow',
  catchUpOnResume: true,
})
export class VerifyExistingMyahUsersSlowInstanceCommand implements SlowInstanceCommand {
  readonly runDataMigrationWithoutWorkspaces = true;
  private readonly logger = new Logger(
    VerifyExistingMyahUsersSlowInstanceCommand.name,
  );

  constructor(private readonly config: TwentyConfigService) {}

  async runDataMigration(dataSource: DataSource): Promise<void> {
    // Once verification is required, unverified users are pending sign-ups that
    // must verify their own email, so a late or catch-up run leaves them alone.
    if (this.config.get('IS_EMAIL_VERIFICATION_REQUIRED')) {
      this.logger.log(
        'Email verification is already required; existing users are not changed',
      );
      return;
    }
    await dataSource.query(`UPDATE core."user" SET "isEmailVerified" = true WHERE "isEmailVerified" = false`);
  }

  async up(_queryRunner: QueryRunner): Promise<void> {}

  // Verification is intentionally not revoked on rollback.
  async down(_queryRunner: QueryRunner): Promise<void> {}
}
