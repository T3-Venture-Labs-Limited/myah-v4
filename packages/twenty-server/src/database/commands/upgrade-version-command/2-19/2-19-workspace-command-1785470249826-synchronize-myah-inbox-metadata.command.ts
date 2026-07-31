import { Command } from 'nest-commander';
import {
  MYAH_INBOX_FIELD_UNIVERSAL_IDENTIFIERS,
  MYAH_STANDARD_OBJECTS,
} from 'twenty-shared/metadata';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { SynchronizeSourceControlledMyahMetadataService } from 'src/database/commands/upgrade-version-command/2-19/services/synchronize-source-controlled-myah-metadata.service';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';

@RegisteredWorkspaceCommand('2.19.0', 1785470249826)
@Command({
  name: 'upgrade:2-19:synchronize-myah-inbox-metadata',
  description: 'Synchronize Inbox metadata for existing workspaces',
})
export class SynchronizeMyahInboxMetadataCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    private readonly synchronizeSourceControlledMyahMetadataService: SynchronizeSourceControlledMyahMetadataService,
  ) {
    super(workspaceIteratorService);
  }

  override runOnWorkspace(args: RunOnWorkspaceArgs): Promise<void> {
    return this.synchronizeSourceControlledMyahMetadataService.synchronizeWorkspace(
      args,
      {
        fieldMetadata: new Set([
          ...Object.values(MYAH_INBOX_FIELD_UNIVERSAL_IDENTIFIERS),
          MYAH_STANDARD_OBJECTS.creator.fields.inboxThreads.universalIdentifier,
          MYAH_STANDARD_OBJECTS.campaign.fields.inboxThreads
            .universalIdentifier,
        ]),
      },
    );
  }
}
