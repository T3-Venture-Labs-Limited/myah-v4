import { Module } from '@nestjs/common';
import { V2_20_UpgradeVersionCommandModule } from 'src/database/commands/upgrade-version-command/2-20/2-20-upgrade-version-command.module';
import { RepairInstagramSecurityCutoverCommand } from 'src/database/commands/upgrade-version-command/2-20/repair-instagram-security-cutover.command';

import { WorkspaceIteratorModule } from 'src/database/commands/command-runners/workspace-iterator.module';
import { UpgradeCommand } from 'src/database/commands/upgrade-version-command/upgrade.command';
import { UpgradeModule } from 'src/engine/core-modules/upgrade/upgrade.module';

@Module({
  imports: [
    UpgradeModule,
    WorkspaceIteratorModule,
    V2_20_UpgradeVersionCommandModule,
  ],
  providers: [UpgradeCommand, RepairInstagramSecurityCutoverCommand],
})
export class UpgradeVersionCommandModule {}
