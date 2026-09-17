import { Module } from '@nestjs/common';

import { WorkspaceIteratorModule } from 'src/database/commands/command-runners/workspace-iterator.module';
import { MigrateMyahInboxEmailReplyContextDraftsCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789313971536-migrate-myah-inbox-email-reply-context-drafts.command';
import { MyahInboxReplyContextModule } from 'src/engine/core-modules/myah-inbox/myah-inbox-reply-context.module';

// Release B is an explicit provider graph, deployed only after the Release A
// compatibility build has drained every legacy Email draft writer.
@Module({
  imports: [WorkspaceIteratorModule, MyahInboxReplyContextModule],
  providers: [MigrateMyahInboxEmailReplyContextDraftsCommand],
})
export class V2_20_EmailReplyContextActivationUpgradeVersionCommandModule {}
