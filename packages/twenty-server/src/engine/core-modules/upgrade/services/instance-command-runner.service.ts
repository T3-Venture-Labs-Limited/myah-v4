import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';

import { DataSource } from 'typeorm';

import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';
import { type SlowInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/slow-instance-command.interface';
import { UpgradeMigrationService } from 'src/engine/core-modules/upgrade/services/upgrade-migration.service';
import { UpgradeStatusService } from 'src/engine/core-modules/upgrade/services/upgrade-status.service';
import { UpgradeWriteLockService } from 'src/engine/core-modules/upgrade/services/upgrade-write-lock.service';
import { WorkspaceVersionService } from 'src/engine/workspace-manager/workspace-version/services/workspace-version.service';

type RunSingleMigrationResult =
  | { status: 'success' }
  | { status: 'already-executed' }
  | { status: 'failed'; error: unknown };

@Injectable()
export class InstanceCommandRunnerService {
  private readonly logger = new Logger(InstanceCommandRunnerService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly twentyConfigService: TwentyConfigService,
    private readonly upgradeMigrationService: UpgradeMigrationService,
    private readonly workspaceVersionService: WorkspaceVersionService,
    private readonly upgradeStatusService: UpgradeStatusService,
    private readonly upgradeWriteLockService: UpgradeWriteLockService,
  ) {}

  async runFastInstanceCommand({
    command,
    name,
  }: {
    command: FastInstanceCommand;
    name: string;
  }): Promise<RunSingleMigrationResult> {
    return this.upgradeWriteLockService.withLock(() =>
      this.runFastInstanceCommandUnderLock({ command, name }),
    );
  }

  private async runFastInstanceCommandUnderLock({
    command,
    name,
  }: {
    command: FastInstanceCommand;
    name: string;
  }): Promise<RunSingleMigrationResult> {
    const queryRunner = this.upgradeWriteLockService.currentRunner();
    const executedByVersion =
      this.twentyConfigService.get('APP_VERSION') ?? 'unknown';

    const isAlreadyCompleted =
      await this.upgradeMigrationService.isLastAttemptCompleted({
        name,
        workspaceId: null,
        queryRunner,
      });

    if (isAlreadyCompleted) {
      this.logger.log(`${name} already executed, skipping`);

      return { status: 'already-executed' };
    }

    let commitStarted = false;

    try {
      await queryRunner.startTransaction();

      await command.up(queryRunner);

      const workspaceIds =
        await this.workspaceVersionService.getActiveOrSuspendedWorkspaceIds({
          queryRunner,
        });

      await this.upgradeMigrationService.recordUpgradeMigration({
        name,
        workspaceIds,
        isInstance: true,
        status: 'completed',
        executedByVersion,
        queryRunner,
      });

      commitStarted = true;
      await queryRunner.commitTransaction();

      this.logger.log(`${name} executed successfully`);

      return { status: 'success' };
    } catch (error) {
      // An uncertain COMMIT response must be inspected on a new session, not
      // interpreted as a rollback followed by a fabricated failed receipt.
      if (commitStarted) throw error;
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }

      const workspaceIds =
        await this.workspaceVersionService.getActiveOrSuspendedWorkspaceIds({
          queryRunner,
        });

      await queryRunner.startTransaction();
      try {
        await this.upgradeMigrationService.recordUpgradeMigration({
          name,
          workspaceIds,
          isInstance: true,
          status: 'failed',
          executedByVersion,
          error,
          queryRunner,
        });
        await queryRunner.commitTransaction();
      } catch (receiptError) {
        if (queryRunner.isTransactionActive)
          await queryRunner.rollbackTransaction();
        throw receiptError;
      }

      this.logger.error(
        `${name} failed`,
        error instanceof Error ? error.stack : String(error),
      );

      return { status: 'failed', error };
    } finally {
      await this.safeInvalidateUpgradeStatusCache();
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

  async runSlowInstanceCommand({
    command,
    name,
    skipDataMigration,
  }: {
    command: SlowInstanceCommand;
    name: string;
    skipDataMigration?: boolean;
  }): Promise<RunSingleMigrationResult> {
    return this.upgradeWriteLockService.withLock(() =>
      this.runSlowInstanceCommandUnderLock({
        command,
        name,
        skipDataMigration,
      }),
    );
  }

  private async runSlowInstanceCommandUnderLock({
    command,
    name,
    skipDataMigration,
  }: {
    command: SlowInstanceCommand;
    name: string;
    skipDataMigration?: boolean;
  }): Promise<RunSingleMigrationResult> {
    const queryRunner = this.upgradeWriteLockService.currentRunner();
    const isAlreadyCompleted =
      await this.upgradeMigrationService.isLastAttemptCompleted({
        name,
        workspaceId: null,
        queryRunner,
      });

    if (isAlreadyCompleted) {
      this.logger.log(`${name} already executed, skipping`);

      return { status: 'already-executed' };
    }

    if (!skipDataMigration) {
      const executedByVersion =
        this.twentyConfigService.get('APP_VERSION') ?? 'unknown';

      try {
        this.logger.log(`${name} starting data migration...`);
        await command.runDataMigration(this.dataSource, queryRunner);
        this.logger.log(`${name} data migration completed`);
      } catch (error) {
        const workspaceIds =
          await this.workspaceVersionService.getActiveOrSuspendedWorkspaceIds({
            queryRunner,
          });

        await this.upgradeMigrationService.recordUpgradeMigration({
          name,
          workspaceIds,
          isInstance: true,
          status: 'failed',
          executedByVersion,
          error,
          queryRunner,
        });

        this.logger.error(
          `${name} data migration failed`,
          error instanceof Error ? error.stack : String(error),
        );

        await this.safeInvalidateUpgradeStatusCache();

        return { status: 'failed', error };
      }
    }

    return this.runFastInstanceCommand({
      command,
      name,
    });
  }
}
