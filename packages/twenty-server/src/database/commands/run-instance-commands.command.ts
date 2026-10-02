import { Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';

import chalk from 'chalk';
import { Command, CommandRunner, Option } from 'nest-commander';
import { DataSource } from 'typeorm';
import { MigrationExecutor } from 'typeorm/migration/MigrationExecutor';

import { LEGACY_2_19_PREREQUISITE_COMMAND_NAMES } from 'src/engine/core-modules/upgrade/constants/legacy-2-19-prerequisite-command-names.constant';
import { LEGACY_2_19_PREREQUISITE_RECONCILIATION_NAME } from 'src/engine/core-modules/upgrade/constants/legacy-2-19-prerequisite-reconciliation-name.constant';
import { TWENTY_PREVIOUS_VERSIONS } from 'src/engine/core-modules/upgrade/constants/twenty-previous-versions.constant';
import { InstanceCommandRunnerService } from 'src/engine/core-modules/upgrade/services/instance-command-runner.service';
import { UpgradeCommandRegistryService } from 'src/engine/core-modules/upgrade/services/upgrade-command-registry.service';
import { UpgradeMigrationService } from 'src/engine/core-modules/upgrade/services/upgrade-migration.service';
import { UpgradeSequenceReaderService } from 'src/engine/core-modules/upgrade/services/upgrade-sequence-reader.service';
import { UpgradeStatusService } from 'src/engine/core-modules/upgrade/services/upgrade-status.service';
import { UpgradeWriteLockService } from 'src/engine/core-modules/upgrade/services/upgrade-write-lock.service';
import { WorkspaceVersionService } from 'src/engine/workspace-manager/workspace-version/services/workspace-version.service';

const LEGACY_REBRAND_COMMAND_NAME =
  '2.19.0_RebrandEmailSenderToMyahSlowInstanceCommand_1784005792206';
type RunInstanceCommandsOptions = {
  force?: boolean;
  includeSlow?: boolean;
};

// TODO should be replaced by a specific call to the upgrade
@Command({
  name: 'run-instance-commands',
  description:
    'Run legacy TypeORM migrations and all registered instance commands',
})
export class RunInstanceCommandsCommand extends CommandRunner {
  private readonly logger = new Logger(RunInstanceCommandsCommand.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly workspaceVersionService: WorkspaceVersionService,
    private readonly upgradeCommandRegistryService: UpgradeCommandRegistryService,
    private readonly upgradeSequenceReaderService: UpgradeSequenceReaderService,
    private readonly instanceUpgradeService: InstanceCommandRunnerService,
    private readonly upgradeMigrationService: UpgradeMigrationService,
    private readonly upgradeStatusService: UpgradeStatusService,
    private readonly upgradeWriteLockService: UpgradeWriteLockService,
  ) {
    super();
  }

  @Option({
    flags: '-f, --force',
    description: 'Skip workspace version safety check',
    required: false,
  })
  parseForce(): boolean {
    return true;
  }

  @Option({
    flags: '--include-slow',
    description: 'Also run slow instance commands (data migration + DDL)',
    required: false,
  })
  parseIncludeSlow(): boolean {
    return true;
  }

  async run(
    _passedParams: string[],
    options: RunInstanceCommandsOptions,
  ): Promise<void> {
    return this.upgradeWriteLockService.withLock(
      async (emptyCoreBootstrap) => {
        await this.runUnderLock(options, emptyCoreBootstrap);
      },
      { requireNoOngoingActivation: true, allowEmptyCoreBootstrap: true },
    );
  }

  private async runUnderLock(
    options: RunInstanceCommandsOptions,
    emptyCoreBootstrap = false,
  ): Promise<void> {
    // The initial empty core has no upgrade ledger or workspace table until
    // the pinned legacy TypeORM migrations create both under this lock.
    // Existing databases retain both preflight checks before any writes.
    // DataSource.runMigrations() creates a different pooled runner and can outlive
    // the session advisory lock when its backend is lost.
    if (!emptyCoreBootstrap) {
      await this.checkLegacyUpgradeReceiptHole();
      await this.checkWorkspaceVersionSafety(options);
    }
    const runner = this.upgradeWriteLockService.currentRunner();
    const executor = new MigrationExecutor(this.dataSource, runner);
    executor.transaction = 'each';
    const pendingMigrations = await executor.getPendingMigrations();
    const nontransactional = pendingMigrations.filter(
      (migration) => migration.instance?.transaction === false,
    );

    if (nontransactional.length > 0) {
      throw new Error(
        `Unable to run legacy TypeORM migrations: pending nontransactional migrations cannot safely pair SQL with a receipt: ${nontransactional.map((migration) => migration.name).join(', ')}`,
      );
    }

    try {
      await this.runLegacyPendingTypeOrmMigrations(
        executor,
        pendingMigrations.length,
      );

      const activeOrSuspendedWorkspaceIds =
        await this.workspaceVersionService.getActiveOrSuspendedWorkspaceIds();

      const sequence = this.upgradeSequenceReaderService.getUpgradeSequence();

      for (const step of sequence) {
        if (step.kind === 'fast-instance') {
          const result =
            await this.instanceUpgradeService.runFastInstanceCommand({
              command: step.command,
              name: step.name,
            });

          if (result.status === 'failed') {
            throw result.error;
          }
        }

        if (step.kind === 'slow-instance' && options.includeSlow) {
          const result =
            await this.instanceUpgradeService.runSlowInstanceCommand({
              command: step.command,
              name: step.name,
              skipDataMigration:
                activeOrSuspendedWorkspaceIds.length === 0 &&
                !step.command.runDataMigrationWithoutWorkspaces,
            });

          if (result.status === 'failed') {
            throw result.error;
          }
        }
      }

      this.logger.log(chalk.green('Instance commands completed'));
    } catch (error) {
      this.logger.error(
        chalk.red(`Instance commands failed: ${error.message}`),
      );
      throw error;
    } finally {
      await this.safeInvalidateUpgradeStatusCache();
    }
  }

  private async checkLegacyUpgradeReceiptHole(): Promise<void> {
    if (
      await this.upgradeMigrationService.hasInstanceAttempt(
        LEGACY_2_19_PREREQUISITE_RECONCILIATION_NAME,
      )
    ) {
      throw new Error(
        `Unable to run-instance-commands: ${LEGACY_2_19_PREREQUISITE_RECONCILIATION_NAME} has an attempt. ` +
          'Use the ordered upgrade route; --force and --include-slow cannot bypass this guard.',
      );
    }

    // A failed Rebrand may be retried in this invocation, and later genuine
    // cursors still retain the same skipped fast-command hole. Neither case
    // can use a successful-Rebrand-only guard.
    if (
      await this.upgradeMigrationService.hasInstanceAttempt(
        LEGACY_REBRAND_COMMAND_NAME,
      )
    ) {
      for (const name of LEGACY_2_19_PREREQUISITE_COMMAND_NAMES) {
        if (
          !(await this.upgradeMigrationService.isLastAttemptCompleted({
            name,
            workspaceId: null,
          }))
        ) {
          throw new Error(
            `Unable to run-instance-commands: ${LEGACY_REBRAND_COMMAND_NAME} has an attempt but completed ${name} is missing. ` +
              'This historical 2.19 sequence has an instance-command prerequisite hole; unrestricted replay can duplicate existing approval tables. ' +
              'Use the ordered upgrade route after the 2.19 prerequisite reconciliation is available. --force and --include-slow cannot bypass this guard.',
          );
        }
      }
    }
  }

  private async safeInvalidateUpgradeStatusCache(): Promise<void> {
    try {
      await this.upgradeStatusService.invalidateInstanceAndAllWorkspacesStatus();
    } catch (error) {
      this.logger.warn(
        `Failed to invalidate upgrade-status cache: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async checkWorkspaceVersionSafety(
    options: RunInstanceCommandsOptions,
  ): Promise<void> {
    if (options.force) {
      this.logger.warn(
        chalk.yellow('Skipping workspace version check (--force flag used)'),
      );

      return;
    }

    const activeOrSuspendedWorkspaceIds =
      await this.workspaceVersionService.getActiveOrSuspendedWorkspaceIds();

    if (activeOrSuspendedWorkspaceIds.length === 0) {
      return;
    }

    const previousVersion =
      TWENTY_PREVIOUS_VERSIONS[TWENTY_PREVIOUS_VERSIONS.length - 1];

    const lastWorkspaceCommand =
      this.upgradeCommandRegistryService.getLastWorkspaceCommandForVersion(
        previousVersion,
      );

    if (!lastWorkspaceCommand) {
      return;
    }

    const allAtPreviousVersion =
      await this.upgradeMigrationService.areAllWorkspacesAtCommand({
        commandName: lastWorkspaceCommand.name,
        workspaceIds: activeOrSuspendedWorkspaceIds,
      });

    if (!allAtPreviousVersion) {
      throw new Error(
        'Unable to run instance commands. Some workspace(s) have not completed ' +
          `the last workspace command for ${previousVersion} ("${lastWorkspaceCommand.name}").\n` +
          'Please ensure all workspaces are upgraded to at least the previous version before running migrations.\n' +
          'Use --force to bypass this check (not recommended).',
      );
    }
  }

  private async runLegacyPendingTypeOrmMigrations(
    executor: MigrationExecutor,
    pendingCount: number,
  ): Promise<void> {
    this.logger.log('Running legacy TypeORM migrations...');

    // An absent table with no registered migrations needs no synthetic receipt.
    // TypeORM executes each migration and its original migration-table row in
    // the same transaction on the pinned lock backend.
    const migrations = pendingCount
      ? await executor.executePendingMigrations()
      : [];

    if (migrations.length === 0) {
      this.logger.log('No pending legacy migrations');
    } else {
      this.logger.log(
        `Executed ${migrations.length} legacy migration(s): ${migrations.map((migration) => migration.name).join(', ')}`,
      );
    }
  }
}
