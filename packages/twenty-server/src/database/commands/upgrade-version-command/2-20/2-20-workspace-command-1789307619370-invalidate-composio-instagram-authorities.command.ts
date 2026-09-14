import { InjectDataSource } from '@nestjs/typeorm';
import { Command } from 'nest-commander';
import { DataSource } from 'typeorm';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { invalidateComposioInstagramAuthorities } from 'src/database/commands/upgrade-version-command/2-20/utils/invalidate-composio-instagram-authorities.util';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';

@RegisteredWorkspaceCommand('2.20.0', 1789307619370)
@Command({
  name: 'upgrade:2-20:invalidate-composio-instagram-authorities',
  description:
    'Expire legacy Composio Instagram authorities for each existing workspace',
})
export class InvalidateComposioInstagramAuthoritiesWorkspaceCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    workspaceIteratorService: WorkspaceIteratorService,
    @InjectDataSource() private readonly coreDataSource: DataSource,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace(args: RunOnWorkspaceArgs): Promise<void> {
    if (args.options.dryRun) {
      return;
    }

    await invalidateComposioInstagramAuthorities(
      this.coreDataSource,
      args.workspaceId,
    );
  }
}
