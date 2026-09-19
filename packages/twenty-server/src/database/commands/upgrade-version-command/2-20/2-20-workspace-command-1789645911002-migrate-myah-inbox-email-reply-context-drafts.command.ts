import { Command } from 'nest-commander';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { EmailReplyContextActivationService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-context-preflight.service';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';

@RegisteredWorkspaceCommand('2.20.0', 1789645911002)
@Command({
  name: 'upgrade:2-20:migrate-myah-inbox-email-reply-context-drafts',
  description:
    'Preserve locked legacy Email reply drafts and enable Email context replies only after a zero-hold preflight',
})
export class MigrateMyahInboxEmailReplyContextDraftsCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    workspaceIteratorService: WorkspaceIteratorService,
    private readonly activation: EmailReplyContextActivationService,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace(args: RunOnWorkspaceArgs): Promise<void> {
    // Workspaces without a provisioned schema have no legacy drafts to
    // preserve; skip them instead of failing the cutover run.
    if (!(await this.activation.isWorkspaceSchemaProvisioned(args.workspaceId))) {
      this.logger.log(
        `Skipping Email reply-context cutover for workspace ${args.workspaceId}: no provisioned schema`,
      );

      return;
    }

    const result = await this.activation.preflightEmailWorkspace(
      args.workspaceId,
      { dryRun: args.options.dryRun },
    );

    if (result.unmapped !== 0 || result.sourceChanged !== 0) {
      throw new Error(
        `Email reply-context cutover hold: mapped=${result.mapped}, unmapped=${result.unmapped}, sourceChanged=${result.sourceChanged}`,
      );
    }

    this.logger.log(
      `Email reply-context cutover ${args.options.dryRun ? 'preflighted' : 'activated'}: mapped=${result.mapped}, unmapped=0, sourceChanged=0`,
    );
  }
}
