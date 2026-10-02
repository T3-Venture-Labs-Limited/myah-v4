import { Command } from 'nest-commander';

import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';
import type { QueryRunner } from 'typeorm';
import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { TwentyStandardApplicationService } from 'src/engine/workspace-manager/twenty-standard-application/services/twenty-standard-application.service';
import type { UpgradeWorkspaceTransaction } from 'src/engine/workspace-manager/workspace-migration/types/upgrade-workspace-transaction.type';

@RegisteredWorkspaceCommand('2.19.0', 1785453080000)
@Command({
  name: 'upgrade:2-19:resynchronize-myah-standard-application',
  description:
    'Resynchronize canonical Myah standard metadata for existing workspaces',
})
export class ResynchronizeMyahStandardApplicationCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    private readonly twentyStandardApplicationService: TwentyStandardApplicationService,
    private readonly workspaceCacheService: WorkspaceCacheService,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace(args: RunOnWorkspaceArgs): Promise<void> {
    await this.synchronize(args);
  }

  override async runOnWorkspaceInUpgradeTransaction(
    args: RunOnWorkspaceArgs,
    queryRunner: QueryRunner,
    afterCommit: UpgradeWorkspaceTransaction['afterCommit'],
  ): Promise<void> {
    await this.synchronize(args, { queryRunner, afterCommit });
  }

  private async synchronize(
    { workspaceId, options }: RunOnWorkspaceArgs,
    upgradeTransaction?: UpgradeWorkspaceTransaction,
  ): Promise<void> {
    const { flatObjectMetadataMaps } =
      await this.workspaceCacheService.getOrRecompute(workspaceId, [
        'flatObjectMetadataMaps',
      ]);

    if (
      flatObjectMetadataMaps.byUniversalIdentifier[
        MYAH_STANDARD_OBJECTS.outreachAction.universalIdentifier
      ] === undefined
    ) {
      return;
    }

    if (options.dryRun === true) {
      this.logger.log(
        `[DRY RUN] Would resynchronize Myah standard metadata for workspace ${workspaceId}`,
      );

      return;
    }
    await this.twentyStandardApplicationService.synchronizeTwentyStandardApplicationOrThrow(
      { workspaceId, profile: 'myah', ...(upgradeTransaction ? { upgradeTransaction } : {}) },
    );
  }
}
