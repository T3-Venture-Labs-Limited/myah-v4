import type { DataSource, QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import type { SlowInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/slow-instance-command.interface';
import { invalidateComposioInstagramAuthorities } from 'src/database/commands/upgrade-version-command/2-20/utils/invalidate-composio-instagram-authorities.util';

@RegisteredInstanceCommand('2.20.0', 1789307619363, { type: 'slow' })
export class InvalidateComposioInstagramAuthoritiesSlowInstanceCommand implements SlowInstanceCommand {
  public readonly runDataMigrationWithoutWorkspaces = true;

  public async runDataMigration(dataSource: DataSource): Promise<void> {
    await invalidateComposioInstagramAuthorities(dataSource);
  }

  public async up(_queryRunner: QueryRunner): Promise<void> {}

  public async down(_queryRunner: QueryRunner): Promise<void> {}
}
