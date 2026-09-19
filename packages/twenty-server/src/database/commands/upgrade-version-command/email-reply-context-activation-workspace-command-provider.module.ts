import { Module } from '@nestjs/common';

import { V2_20_EmailReplyContextActivationUpgradeVersionCommandModule } from 'src/database/commands/upgrade-version-command/2-20/2-20-email-reply-context-activation-upgrade-version-command.module';
import { WorkspaceCommandProviderModule } from 'src/database/commands/upgrade-version-command/workspace-command-provider.module';

// Release B provider root: use this instead of WorkspaceCommandProviderModule
// only after the Release A compatibility fleet is fully drained.
@Module({
  imports: [
    WorkspaceCommandProviderModule,
    V2_20_EmailReplyContextActivationUpgradeVersionCommandModule,
  ],
})
export class EmailReplyContextActivationWorkspaceCommandProviderModule {}
