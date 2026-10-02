import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import chunk from 'lodash.chunk';
import { isDefined } from 'twenty-shared/utils';
import { In, IsNull, type QueryRunner, Repository } from 'typeorm';

import {
  UpgradeMigrationEntity,
  UpgradeMigrationStatus,
} from 'src/engine/core-modules/upgrade/upgrade-migration.entity';
import { LEGACY_2_19_PREREQUISITE_RECONCILIATION_NAME } from 'src/engine/core-modules/upgrade/constants/legacy-2-19-prerequisite-reconciliation-name.constant';
import { formatUpgradeErrorForStorage } from 'src/engine/core-modules/upgrade/utils/format-upgrade-error-for-storage.util';
import { extractVersionFromCommandName } from 'src/engine/core-modules/upgrade/utils/extract-version-from-command-name.util';

export type WorkspaceLastAttemptedCommand = {
  workspaceId: string;
  name: string;
  status: UpgradeMigrationStatus;
  executedByVersion: string;
  errorMessage: string | null;
  createdAt: Date;
  isInitial: boolean;
};

const UPGRADE_MIGRATION_SAVE_BATCH_SIZE = 1000;

@Injectable()
export class UpgradeMigrationService {
  constructor(
    @InjectRepository(UpgradeMigrationEntity)
    private readonly upgradeMigrationRepository: Repository<UpgradeMigrationEntity>,
  ) {}

  async getInferredVersion(commandName?: string): Promise<string | null> {
    if (isDefined(commandName)) {
      return extractVersionFromCommandName(commandName);
    }

    const migration = await this.getLastAttemptedInstanceCommand();

    return isDefined(migration)
      ? extractVersionFromCommandName(migration.name)
      : null;
  }

  async isLastAttemptCompleted({
    name,
    workspaceId,
    queryRunner,
  }: {
    name: string;
    workspaceId: string | null;
    queryRunner?: QueryRunner;
  }): Promise<boolean> {
    const repository = queryRunner
      ? queryRunner.manager.getRepository(UpgradeMigrationEntity)
      : this.upgradeMigrationRepository;
    const latestAttempt = await repository.findOne({
      where: {
        name,
        workspaceId: workspaceId === null ? IsNull() : workspaceId,
      },
      order: { attempt: 'DESC' },
    });

    return isDefined(latestAttempt) && latestAttempt.status === 'completed';
  }

  // Used only after an uncertain activation COMMIT. This pooled repository
  // must observe durable state independently of the failed pinned backend.
  async hasWorkspaceInitialReceipt({
    workspaceId,
    name,
    status,
  }: {
    workspaceId: string;
    name: string;
    status: UpgradeMigrationStatus;
  }): Promise<boolean> {
    return this.upgradeMigrationRepository.exists({
      where: { workspaceId, name, status, attempt: 1, isInitial: true },
    });
  }

  async hasInstanceAttempt(name: string): Promise<boolean> {
    return this.upgradeMigrationRepository.exists({
      where: { name, workspaceId: IsNull() },
    });
  }

  async getLatestPrerequisiteReconciliationAttempt(): Promise<UpgradeMigrationEntity | null> {
    return this.upgradeMigrationRepository.findOne({
      where: {
        name: LEGACY_2_19_PREREQUISITE_RECONCILIATION_NAME,
        workspaceId: IsNull(),
      },
      order: { attempt: 'DESC' },
    });
  }

  async recordUpgradeMigration(
    params:
      | {
          name: string;
          workspaceIds: string[];
          isInstance: boolean;
          status: 'completed';
          executedByVersion: string;
          queryRunner?: QueryRunner;
        }
      | {
          name: string;
          workspaceIds: string[];
          isInstance: boolean;
          status: 'failed';
          executedByVersion: string;
          error: unknown;
          queryRunner?: QueryRunner;
        },
  ): Promise<void> {
    const { name, workspaceIds, isInstance, status, executedByVersion } =
      params;

    const repository = params.queryRunner
      ? params.queryRunner.manager.getRepository(UpgradeMigrationEntity)
      : this.upgradeMigrationRepository;

    const errorMessage =
      params.status === 'failed'
        ? formatUpgradeErrorForStorage(params.error)
        : null;

    if (isInstance) {
      const previousAttempts = await repository.count({
        where: { name, workspaceId: IsNull() },
      });

      const instanceRows = [
        {
          name,
          status,
          attempt: previousAttempts + 1,
          executedByVersion,
          workspaceId: null,
          errorMessage,
        },
        ...workspaceIds.map((workspaceId) => ({
          name,
          status,
          attempt: previousAttempts + 1,
          executedByVersion,
          workspaceId,
          errorMessage,
        })),
      ];

      for (const batch of chunk(
        instanceRows,
        UPGRADE_MIGRATION_SAVE_BATCH_SIZE,
      )) {
        await repository.save(batch);
      }

      return;
    }

    const rows = [];

    for (const workspaceId of workspaceIds) {
      const previousAttempts = await repository.count({
        where: { name, workspaceId },
      });

      rows.push({
        name,
        status,
        attempt: previousAttempts + 1,
        executedByVersion,
        workspaceId,
        errorMessage,
      });
    }

    for (const batch of chunk(rows, UPGRADE_MIGRATION_SAVE_BATCH_SIZE)) {
      await repository.save(batch);
    }
  }

  async markAsWorkspaceInitial({
    name,
    workspaceId,
    executedByVersion,
    status,
    queryRunner,
  }: {
    name: string;
    workspaceId: string;
    executedByVersion: string;
    status: UpgradeMigrationStatus;
    queryRunner?: QueryRunner;
  }): Promise<void> {
    const repository = queryRunner
      ? queryRunner.manager.getRepository(UpgradeMigrationEntity)
      : this.upgradeMigrationRepository;

    const existingInitialMigration = await repository.findOne({
      where: { name, attempt: 1, workspaceId, isInitial: true },
    });

    if (isDefined(existingInitialMigration)) {
      return;
    }

    await repository.save({
      name,
      status,
      isInitial: true,
      attempt: 1,
      executedByVersion,
      workspaceId,
    });
  }

  // Returns the most recently attempted command (by createdAt)
  // across instance and active-workspace scopes, with its status.
  // isInitial records are excluded — they represent activation
  // state, not execution progress.
  async getLastAttemptedCommandNameOrThrow(
    allActiveOrSuspendedWorkspaceIds: string[],
  ): Promise<{
    name: string;
    status: UpgradeMigrationStatus;
  }> {
    const queryBuilder = this.upgradeMigrationRepository
      .createQueryBuilder('migration')
      .select(['migration.name', 'migration.status'])
      .andWhere('migration."isInitial" = false')
      .andWhere('migration.name != :nonProgressName', {
        nonProgressName: LEGACY_2_19_PREREQUISITE_RECONCILIATION_NAME,
      })
      .andWhere(
        `migration.attempt = (
          SELECT MAX(sub.attempt)
          FROM core."upgradeMigration" sub
          WHERE sub.name = migration.name
          AND (
            (sub."workspaceId" IS NULL AND migration."workspaceId" IS NULL)
            OR sub."workspaceId" = migration."workspaceId"
          )
        )`,
      );

    if (allActiveOrSuspendedWorkspaceIds.length > 0) {
      queryBuilder.andWhere(
        '(migration."workspaceId" IS NULL OR migration."workspaceId" IN (:...allActiveOrSuspendedWorkspaceIds))',
        { allActiveOrSuspendedWorkspaceIds },
      );
    } else {
      queryBuilder.andWhere('migration."workspaceId" IS NULL');
    }

    const migration = await queryBuilder
      .orderBy('migration.createdAt', 'DESC')
      .getOne();

    if (!migration) {
      throw new Error(
        'No upgrade migration found — the database may not have been initialized',
      );
    }

    return { name: migration.name, status: migration.status };
  }

  async getWorkspaceLastAttemptedCommandName(
    workspaceIds: string[],
  ): Promise<Map<string, WorkspaceLastAttemptedCommand>> {
    if (workspaceIds.length === 0) {
      return new Map();
    }

    const rows = await this.upgradeMigrationRepository.manager.query<
      Array<{
        workspaceId: string;
        name: string;
        status: UpgradeMigrationStatus;
        executedByVersion: string;
        errorMessage: string | null;
        createdAt: Date;
        isInitial: boolean;
      }>
    >(
      `
        SELECT DISTINCT ON (latest_per_name."workspaceId")
          latest_per_name."workspaceId",
          latest_per_name.name,
          latest_per_name.status,
          latest_per_name."executedByVersion",
          latest_per_name."errorMessage",
          latest_per_name."createdAt",
          latest_per_name."isInitial"
        FROM (
          SELECT DISTINCT ON ("workspaceId", name)
            "workspaceId",
            name,
            status,
            "executedByVersion",
            "errorMessage",
            "createdAt",
            "isInitial"
          FROM core."upgradeMigration"
          WHERE "workspaceId" = ANY($1)
            AND name != $2
          ORDER BY "workspaceId", name, attempt DESC
        ) latest_per_name
        ORDER BY latest_per_name."workspaceId", latest_per_name."createdAt" DESC
      `,
      [workspaceIds, LEGACY_2_19_PREREQUISITE_RECONCILIATION_NAME],
    );

    const cursors = new Map<string, WorkspaceLastAttemptedCommand>();

    for (const row of rows) {
      cursors.set(row.workspaceId, {
        workspaceId: row.workspaceId,
        name: row.name,
        status: row.status,
        executedByVersion: row.executedByVersion,
        errorMessage: row.errorMessage,
        createdAt: row.createdAt,
        isInitial: row.isInitial,
      });
    }

    return cursors;
  }

  async getWorkspaceLastAttemptedCommandNameOrThrow(
    workspaceIds: string[],
  ): Promise<Map<string, WorkspaceLastAttemptedCommand>> {
    const cursors =
      await this.getWorkspaceLastAttemptedCommandName(workspaceIds);

    const missingWorkspaceIds = workspaceIds.filter(
      (workspaceId) => !cursors.has(workspaceId),
    );

    if (missingWorkspaceIds.length > 0) {
      throw new Error(
        `No upgrade migration found for workspace(s): ${missingWorkspaceIds.join(', ')}`,
      );
    }

    return cursors;
  }

  async areAllWorkspacesAtCommand({
    commandName,
    workspaceIds,
  }: {
    commandName: string;
    workspaceIds: string[];
  }): Promise<boolean> {
    if (workspaceIds.length === 0) {
      return true;
    }

    const completedCount = await this.upgradeMigrationRepository
      .createQueryBuilder('migration')
      .where({
        name: commandName,
        status: 'completed',
        workspaceId: In(workspaceIds),
      })
      .andWhere(
        `migration.attempt = (
          SELECT MAX(sub.attempt)
          FROM core."upgradeMigration" sub
          WHERE sub.name = migration.name
          AND sub."workspaceId" = migration."workspaceId"
        )`,
      )
      .getCount();

    return completedCount === workspaceIds.length;
  }

  async getLastAttemptedInstanceCommand(queryRunner?: QueryRunner): Promise<{
    name: string;
    status: UpgradeMigrationStatus;
    executedByVersion: string;
    errorMessage: string | null;
    createdAt: Date;
  } | null> {
    const repository = queryRunner
      ? queryRunner.manager.getRepository(UpgradeMigrationEntity)
      : this.upgradeMigrationRepository;
    const migration = await repository
      .createQueryBuilder('migration')
      .select([
        'migration.name',
        'migration.status',
        'migration.executedByVersion',
        'migration.errorMessage',
        'migration.createdAt',
      ])
      .where('migration."workspaceId" IS NULL')
      .andWhere('migration."isInitial" = false')
      .andWhere('migration.name != :nonProgressName', {
        nonProgressName: LEGACY_2_19_PREREQUISITE_RECONCILIATION_NAME,
      })
      .andWhere(
        `migration.attempt = (
          SELECT MAX(sub.attempt)
          FROM core."upgradeMigration" sub
          WHERE sub.name = migration.name
          AND sub."workspaceId" IS NULL
        )`,
      )
      .orderBy('migration.createdAt', 'DESC')
      .getOne();

    if (!migration) {
      return null;
    }

    return {
      name: migration.name,
      status: migration.status,
      executedByVersion: migration.executedByVersion,
      errorMessage: migration.errorMessage,
      createdAt: migration.createdAt,
    };
  }

  async getLastAttemptedInstanceCommandOrThrow(
    queryRunner?: QueryRunner,
  ): Promise<{
    name: string;
    status: UpgradeMigrationStatus;
  }> {
    const result = await this.getLastAttemptedInstanceCommand(queryRunner);

    if (!result) {
      throw new Error(
        'No instance command found — the database may not have been initialized',
      );
    }

    return result;
  }
}
