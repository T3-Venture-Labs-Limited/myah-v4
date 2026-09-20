import { Injectable } from '@nestjs/common';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { SynchronizeCampaignActivityControlMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789313971536-synchronize-campaign-activity-control-metadata.command';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';

@RegisteredWorkspaceCommand('2.20.0', 1789633748003)
@Injectable()
export class CatchUpCampaignActivityControlMetadataWorkspaceCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    workspaceIteratorService: WorkspaceIteratorService,
    private readonly synchronizationCommand: SynchronizeCampaignActivityControlMetadataCommand,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace(args: RunOnWorkspaceArgs): Promise<void> {
    await this.synchronizationCommand.runOnWorkspace(args);
  }
}
