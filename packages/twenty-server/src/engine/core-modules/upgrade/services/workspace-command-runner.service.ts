import { Inject, Injectable, Logger } from '@nestjs/common';

import { type WorkspaceIteratorContext } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type ParsedUpgradeCommandOptions } from 'src/database/commands/upgrade-version-command/upgrade.command';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { type RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/services/upgrade-command-registry.service';
import { UpgradeMigrationService } from 'src/engine/core-modules/upgrade/services/upgrade-migration.service';
import { UpgradeStatusService } from 'src/engine/core-modules/upgrade/services/upgrade-status.service';
import { formatUpgradeLog } from 'src/engine/core-modules/upgrade/utils/format-upgrade-log.util';
import { UpgradeWriteLockService } from 'src/engine/core-modules/upgrade/services/upgrade-write-lock.service';

type WorkspaceCommandEntry = Pick<
  RegisteredWorkspaceCommand,
  'name' | 'command'
>;

export type RunWorkspaceCommandsArgs = {
  iteratorContext: WorkspaceIteratorContext;
  options: ParsedUpgradeCommandOptions;
  workspaceCommands: WorkspaceCommandEntry[];
};

@Injectable()
export class WorkspaceCommandRunnerService {
  private readonly logger = new Logger(WorkspaceCommandRunnerService.name);

  constructor(
    private readonly twentyConfigService: TwentyConfigService,
    private readonly upgradeMigrationService: UpgradeMigrationService,
    private readonly upgradeStatusService: UpgradeStatusService,
    @Inject(UpgradeWriteLockService)
    private readonly upgradeWriteLockService?: UpgradeWriteLockService,
  ) {}

  async runWorkspaceCommands({
    iteratorContext,
    options,
    workspaceCommands,
  }: RunWorkspaceCommandsArgs): Promise<void> {
    const { workspaceId, index, total } = iteratorContext;

    const dryRunPrefix = options.dryRun ? '(dry run) ' : '';

    this.logger.log(
      formatUpgradeLog({
        humanMessage: `${dryRunPrefix}Upgrading workspace ${workspaceId} ${index + 1}/${total}`,
        event: 'workspace.start',
        logFields: {
          workspaceId,
          index: index + 1,
          total,
          dryRun: options.dryRun ?? false,
        },
      }),
    );

    const executedByVersion =
      this.twentyConfigService.get('APP_VERSION') ?? 'unknown';

    try {
      for (const workspaceCommandEntry of workspaceCommands) {
        await this.runSingleWorkspaceCommandOrThrow({
          workspaceCommandEntry,
          workspaceId,
          executedByVersion,
          options,
          iteratorContext,
        });
      }

      this.logger.log(
        formatUpgradeLog({
          humanMessage: `Upgrade for workspace ${workspaceId} completed.`,
          event: 'workspace.success',
          logFields: {
            workspaceId,
            executedByVersion,
            dryRun: options.dryRun ?? false,
          },
        }),
      );
    } finally {
      if (!options.dryRun) {
        await this.safeInvalidateWorkspace(workspaceId);
      }
    }
  }

  private async safeInvalidateWorkspace(workspaceId: string): Promise<void> {
    try {
      await this.upgradeStatusService.invalidateInstanceAndAllWorkspacesStatus();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.warn(
        formatUpgradeLog({
          humanMessage: `Failed to invalidate upgrade-status cache (triggered by workspace ${workspaceId}): ${errorMessage}`,
          event: 'cache.invalidate.failed',
          logFields: {
            scope: 'instance-and-all-workspaces',
            triggeredByWorkspaceId: workspaceId,
          },
        }),
      );
    }
  }

  private async runSingleWorkspaceCommandOrThrow({
    workspaceCommandEntry,
    workspaceId,
    executedByVersion,
    options,
    iteratorContext,
  }: {
    workspaceCommandEntry: WorkspaceCommandEntry;
    workspaceId: string;
    executedByVersion: string;
    options: ParsedUpgradeCommandOptions;
    iteratorContext: WorkspaceIteratorContext;
  }): Promise<void> {
    const { name, command: workspaceCommand } = workspaceCommandEntry;
    let commitAttempted = false;

    try {
      const args = {
        options,
        workspaceId,
        dataSource: iteratorContext.dataSource,
        index: iteratorContext.index,
        total: iteratorContext.total,
      };

      if (options.dryRun) {
        await workspaceCommand.runOnWorkspace(args);
        return;
      }

      const queryRunner = this.upgradeWriteLockService?.currentRunner();
      if (!queryRunner)
        throw new Error(
          'Upgrade write lock is required for workspace commands',
        );

      if (!workspaceCommand.runOnWorkspaceInUpgradeTransaction) {
        throw new Error(
          `Workspace command ${name} is not adapted to the pinned upgrade transaction`,
        );
      }
      const afterCommitEffects: (() => Promise<void> | void)[] = [];
      await queryRunner.startTransaction();
      try {
        await workspaceCommand.runOnWorkspaceInUpgradeTransaction(
          args,
          queryRunner,
          (effect) => afterCommitEffects.push(effect),
        );
        await this.upgradeMigrationService.recordUpgradeMigration({
          name,
          workspaceIds: [workspaceId],
          isInstance: false,
          status: 'completed',
          executedByVersion,
          queryRunner,
        });
        commitAttempted = true;
        await queryRunner.commitTransaction();
        for (const effect of afterCommitEffects) await effect();
      } catch (error) {
        if (
          !commitAttempted &&
          queryRunner.isTransactionActive &&
          !queryRunner.isReleased
        ) {
          await queryRunner.rollbackTransaction();
        }
        throw error;
      }
    } catch (error) {
      // An uncertain COMMIT is resolved by a fresh process/ledger inspection;
      // never append a contradictory failed attempt after sending COMMIT.
      if (!options.dryRun && !commitAttempted) {
        const queryRunner = this.upgradeWriteLockService?.currentRunner();
        if (!queryRunner) throw error;
        if (queryRunner.isTransactionActive || queryRunner.isReleased)
          throw error;
        await queryRunner.startTransaction();
        try {
          await this.upgradeMigrationService.recordUpgradeMigration({
            name,
            workspaceIds: [workspaceId],
            isInstance: false,
            status: 'failed',
            executedByVersion,
            error,
            queryRunner,
          });
          await queryRunner.commitTransaction();
        } catch (receiptError) {
          if (queryRunner.isTransactionActive && !queryRunner.isReleased)
            await queryRunner.rollbackTransaction();
          throw receiptError;
        }
      }

      throw error;
    }
  }
}
