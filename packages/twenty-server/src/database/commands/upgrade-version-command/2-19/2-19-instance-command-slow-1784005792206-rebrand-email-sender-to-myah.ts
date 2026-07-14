import { type DataSource, QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { SlowInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/slow-instance-command.interface';

const LEGACY_SENDER_NAME = 'Felix from Twenty';
const MYAH_SENDER_NAME = 'Myah';

@RegisteredInstanceCommand('2.19.0', 1784005792206, { type: 'slow' })
export class RebrandEmailSenderToMyahSlowInstanceCommand
  implements SlowInstanceCommand
{
  public readonly runDataMigrationWithoutWorkspaces = true;

  public async runDataMigration(dataSource: DataSource): Promise<void> {
    await dataSource.query(
      `UPDATE "core"."keyValuePair"
      SET value = to_jsonb($1::text)
      WHERE type = 'CONFIG_VARIABLE'
      AND key = 'EMAIL_FROM_NAME'
      AND "userId" IS NULL
      AND "workspaceId" IS NULL
      AND value = to_jsonb($2::text)`,
      [MYAH_SENDER_NAME, LEGACY_SENDER_NAME],
    );
  }

  public async up(_queryRunner: QueryRunner): Promise<void> {}

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "core"."keyValuePair"
      SET value = to_jsonb($1::text)
      WHERE type = 'CONFIG_VARIABLE'
      AND key = 'EMAIL_FROM_NAME'
      AND "userId" IS NULL
      AND "workspaceId" IS NULL
      AND value = to_jsonb($2::text)`,
      [LEGACY_SENDER_NAME, MYAH_SENDER_NAME],
    );
  }
}
