import { MODULE_METADATA } from '@nestjs/common/constants';

import { V2_20_UpgradeVersionCommandModule } from 'src/database/commands/upgrade-version-command/2-20/2-20-upgrade-version-command.module';
import { WorkspaceMigrationRunnerModule } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-runner/workspace-migration-runner.module';

describe('V2_20_UpgradeVersionCommandModule', () => {
  it('directly imports the workspace migration runner for social-link cache invalidation', () => {
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      V2_20_UpgradeVersionCommandModule,
    ) as unknown[];

    expect(imports).toContain(WorkspaceMigrationRunnerModule);
  });
});
