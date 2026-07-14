import { type DataSource } from 'typeorm';

import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

export interface SlowInstanceCommand extends FastInstanceCommand {
  // Instance-global backfills must run even before a workspace exists.
  readonly runDataMigrationWithoutWorkspaces?: boolean;
  runDataMigration(dataSource: DataSource): Promise<void>;
}
