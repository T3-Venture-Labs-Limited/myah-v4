import { IsNull, type Repository, type DataSource } from 'typeorm';
import { UpgradeMigrationService } from 'src/engine/core-modules/upgrade/services/upgrade-migration.service';
import { type UpgradeMigrationEntity } from 'src/engine/core-modules/upgrade/upgrade-migration.entity';
import { InstanceCommandRunnerService } from 'src/engine/core-modules/upgrade/services/instance-command-runner.service';
import { WorkspaceCommandRunnerService } from 'src/engine/core-modules/upgrade/services/workspace-command-runner.service';
import { type UpgradeStatusService } from 'src/engine/core-modules/upgrade/services/upgrade-status.service';
import { type TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { type WorkspaceVersionService } from 'src/engine/workspace-manager/workspace-version/services/workspace-version.service';
import { DiscoveryService } from '@nestjs/core';
import {
  UpgradeCommandRegistryService,
  type RegisteredWorkspaceCommand,
} from 'src/engine/core-modules/upgrade/services/upgrade-command-registry.service';
import { UpgradeSequenceReaderService } from 'src/engine/core-modules/upgrade/services/upgrade-sequence-reader.service';
import { CreateUnipileInstagramFoundationFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1789307619348-create-unipile-instagram-foundation';
import { InvalidateComposioInstagramAuthoritiesSlowInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-slow-1789307619363-invalidate-composio-instagram-authorities';
import { BackfillComposioInstagramHistoryWorkspaceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789307619373-backfill-composio-instagram-history.command';

const INSTAGRAM_FAST_D =
  '2.20.0_CreateUnipileInstagramFoundationFastInstanceCommand_1799201000000';
const INSTAGRAM_SLOW_D =
  '2.20.0_InvalidateComposioInstagramAuthoritiesSlowInstanceCommand_1799201004000';
const INSTAGRAM_WORKSPACE_D =
  '2.20.0_BackfillComposioInstagramHistoryWorkspaceCommand_1799201012000';

// Reflect real command prototypes only; these fixtures never invoke production command bodies.
const buildInstagramSequenceReader = () => {
  const providers = [
    CreateUnipileInstagramFoundationFastInstanceCommand,
    InvalidateComposioInstagramAuthoritiesSlowInstanceCommand,
    BackfillComposioInstagramHistoryWorkspaceCommand,
  ].map((metatype) => ({
    metatype,
    instance: Object.create(metatype.prototype),
  }));
  const registry = new UpgradeCommandRegistryService({
    getProviders: () => providers,
  } as unknown as DiscoveryService);
  registry.onModuleInit();
  const reader = new UpgradeSequenceReaderService(registry);
  expect(reader.getUpgradeSequence().map(({ timestamp }) => timestamp)).toEqual(
    [1789307619348, 1789307619363, 1789307619373],
  );
  return reader;
};

describe('UpgradeMigrationService durable Instagram history contracts (mock repository, not PostgreSQL)', () => {
  const workspaceId = 'saved-workspace';
  const executedByVersion = '2.20.0';
  const historical = Object.freeze({
    id: 'immutable-history-id',
    name: INSTAGRAM_WORKSPACE_D,
    attempt: 1,
    status: 'completed' as const,
    isInitial: true,
    workspaceId,
    executedByVersion,
    errorMessage: null,
    createdAt: new Date('2026-09-12T00:00:00Z'),
  });
  const original = { ...historical };
  const setup = () => {
    const queryBuilder = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({
        ...historical,
        name: INSTAGRAM_SLOW_D,
        workspaceId: null,
        isInitial: false,
      }),
    };
    const repository = {
      findOne: jest.fn(),
      count: jest.fn().mockResolvedValue(1),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      remove: jest.fn(),
      manager: { query: jest.fn().mockResolvedValue([historical]) },
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };
    const service = new UpgradeMigrationService(
      repository as unknown as Repository<UpgradeMigrationEntity>,
    );
    return { service, repository, queryBuilder };
  };

  it.each([null, workspaceId])(
    'uses exact D and existing scope %s for completion lookup',
    async (scope) => {
      const { service, repository } = setup();
      const name =
        buildInstagramSequenceReader().getUpgradeSequence()[
          scope === null ? 0 : 2
        ].name;
      repository.findOne.mockResolvedValue({
        ...historical,
        name,
        status: 'completed',
      });
      expect(
        await service.isLastAttemptCompleted({ name, workspaceId: scope }),
      ).toBe(true);
      expect(repository.findOne).toHaveBeenCalledWith({
        where: {
          name: scope === null ? INSTAGRAM_FAST_D : INSTAGRAM_WORKSPACE_D,
          workspaceId: scope === null ? IsNull() : scope,
        },
        order: { attempt: 'DESC' },
      });
      repository.findOne.mockResolvedValue({
        ...historical,
        name,
        status: 'failed',
      });
      expect(
        await service.isLastAttemptCompleted({ name, workspaceId: scope }),
      ).toBe(false);
    },
  );

  it.each([true, false])(
    'records failed-to-success under D only, isInstance=%s, without changing existing history',
    async (isInstance) => {
      const { service, repository } = setup();
      const name =
        buildInstagramSequenceReader().getUpgradeSequence()[isInstance ? 0 : 2]
          .name;
      repository.count.mockResolvedValueOnce(1).mockResolvedValueOnce(2);
      await service.recordUpgradeMigration({
        name,
        workspaceIds: [workspaceId],
        isInstance,
        status: 'failed',
        executedByVersion,
        error: new Error('saved failure'),
      });
      await service.recordUpgradeMigration({
        name,
        workspaceIds: [workspaceId],
        isInstance,
        status: 'completed',
        executedByVersion,
      });
      expect(repository.count.mock.calls).toEqual([
        [{ where: { name, workspaceId: isInstance ? IsNull() : workspaceId } }],
        [{ where: { name, workspaceId: isInstance ? IsNull() : workspaceId } }],
      ]);
      for (const [index, [saved]] of repository.save.mock.calls.entries()) {
        expect(saved).toEqual(
          (isInstance ? [null, workspaceId] : [workspaceId]).map((scope) => ({
            name: isInstance ? INSTAGRAM_FAST_D : INSTAGRAM_WORKSPACE_D,
            workspaceId: scope,
            attempt: index + 2,
            status: index === 0 ? 'failed' : 'completed',
            executedByVersion,
            errorMessage:
              index === 0 ? expect.stringContaining('saved failure') : null,
          })),
        );
      }
      expect(repository.update).not.toHaveBeenCalled();
      expect(repository.delete).not.toHaveBeenCalled();
      expect(repository.remove).not.toHaveBeenCalled();
      expect(historical).toEqual(original);
    },
  );

  it('preserves an existing initial D and creates only the same durable tail for new activation', async () => {
    const { service, repository } = setup();
    const reader = buildInstagramSequenceReader();
    const cursor = reader.getInitialCursorForNewWorkspace({
      name: INSTAGRAM_SLOW_D,
      status: 'completed',
    });
    repository.findOne
      .mockResolvedValueOnce(historical)
      .mockResolvedValueOnce(null);
    await service.markAsWorkspaceInitial({
      ...cursor,
      workspaceId,
      executedByVersion,
    });
    expect(repository.findOne).toHaveBeenCalledWith({
      where: {
        name: INSTAGRAM_WORKSPACE_D,
        attempt: 1,
        workspaceId,
        isInitial: true,
      },
    });
    expect(repository.save).not.toHaveBeenCalled();
    await service.markAsWorkspaceInitial({
      ...cursor,
      workspaceId: 'new-workspace',
      executedByVersion,
    });
    expect(repository.save).toHaveBeenCalledWith({
      name: INSTAGRAM_WORKSPACE_D,
      attempt: 1,
      isInitial: true,
      workspaceId: 'new-workspace',
      executedByVersion,
      status: 'completed',
    });
    expect(historical).toEqual(original);
  });

  it.each([{ workspaceIds: [] }, { workspaceIds: [workspaceId] }])(
    'keeps global initial exclusion and scope boundaries for $workspaceIds',
    async ({ workspaceIds }) => {
      const { service, queryBuilder } = setup();
      expect(
        await service.getLastAttemptedCommandNameOrThrow(workspaceIds),
      ).toEqual({ name: INSTAGRAM_SLOW_D, status: 'completed' });
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'migration."isInitial" = false',
      );
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('sub.name = migration.name'),
      );
      expect(queryBuilder.orderBy).toHaveBeenCalledWith(
        'migration.createdAt',
        'DESC',
      );
      if (workspaceIds.length) {
        expect(queryBuilder.andWhere).toHaveBeenCalledWith(
          '(migration."workspaceId" IS NULL OR migration."workspaceId" IN (:...allActiveOrSuspendedWorkspaceIds))',
          { allActiveOrSuspendedWorkspaceIds: workspaceIds },
        );
      } else {
        expect(queryBuilder.andWhere).toHaveBeenCalledWith(
          'migration."workspaceId" IS NULL',
        );
      }
      await service.getLastAttemptedInstanceCommand();
      expect(queryBuilder.where).toHaveBeenCalledWith(
        'migration."workspaceId" IS NULL',
      );
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'migration."isInitial" = false',
      );
    },
  );

  it.each([true, false])(
    'preserves returned workspace history with isInitial=%s',
    async (isInitial) => {
      const { service, repository } = setup();
      const row = Object.freeze({ ...historical, isInitial });
      repository.manager.query.mockResolvedValue([row]);
      const result = await service.getWorkspaceLastAttemptedCommandNameOrThrow([
        workspaceId,
      ]);
      const { id: _id, attempt: _attempt, ...cursor } = row;
      expect(result.get(workspaceId)).toEqual(cursor);
      expect(repository.manager.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY "workspaceId", name, attempt DESC'),
        [[workspaceId]],
      );
      const sql = repository.manager.query.mock.calls[0][0] as string;
      expect(sql).not.toContain('"isInitial" = false');
      expect(repository.save).not.toHaveBeenCalled();
      expect(repository.update).not.toHaveBeenCalled();
      expect(repository.delete).not.toHaveBeenCalled();
      expect(repository.remove).not.toHaveBeenCalled();
      expect(row).toEqual({ ...original, isInitial });
    },
  );

  it.each([true, false])(
    'fresh normal runner records D on attempt one, isInstance=%s',
    async (isInstance) => {
      const { service, repository } = setup();
      const sequence = buildInstagramSequenceReader().getUpgradeSequence();
      repository.findOne.mockResolvedValue(null);
      repository.count.mockResolvedValue(0);
      const config = {
        get: jest.fn().mockReturnValue(executedByVersion),
      } as unknown as TwentyConfigService;
      const status = {
        invalidateInstanceAndAllWorkspacesStatus: jest.fn(),
      } as unknown as UpgradeStatusService;
      if (isInstance) {
        const queryRunner = {
          connect: jest.fn(),
          startTransaction: jest.fn(),
          commitTransaction: jest.fn(),
          release: jest.fn(),
          manager: { getRepository: jest.fn().mockReturnValue(repository) },
        };
        const runner = new InstanceCommandRunnerService(
          {
            createQueryRunner: jest.fn().mockReturnValue(queryRunner),
          } as unknown as DataSource,
          config,
          service,
          {
            getActiveOrSuspendedWorkspaceIds: jest
              .fn()
              .mockResolvedValue([workspaceId]),
          } as unknown as WorkspaceVersionService,
          status,
        );
        const command = { up: jest.fn(), down: jest.fn() };
        await expect(
          runner.runFastInstanceCommand({ name: sequence[0].name, command }),
        ).resolves.toEqual({ status: 'success' });
        expect(command.up).toHaveBeenCalledWith(queryRunner);
      } else {
        const runner = new WorkspaceCommandRunnerService(
          config,
          service,
          status,
        );
        const command = {
          runOnWorkspace: jest.fn(),
        } as unknown as RegisteredWorkspaceCommand['command'];
        await runner.runWorkspaceCommands({
          iteratorContext: { workspaceId, index: 0, total: 1 },
          options: {},
          workspaceCommands: [{ name: sequence[2].name, command }],
        });
        expect(command.runOnWorkspace).toHaveBeenCalledTimes(1);
      }
      expect(repository.save).toHaveBeenCalledWith(
        (isInstance ? [null, workspaceId] : [workspaceId]).map((scope) => ({
          name: isInstance ? INSTAGRAM_FAST_D : INSTAGRAM_WORKSPACE_D,
          workspaceId: scope,
          attempt: 1,
          status: 'completed',
          executedByVersion,
          errorMessage: null,
        })),
      );
      expect(repository.update).not.toHaveBeenCalled();
      expect(repository.delete).not.toHaveBeenCalled();
      expect(historical).toEqual(original);
    },
  );
});
