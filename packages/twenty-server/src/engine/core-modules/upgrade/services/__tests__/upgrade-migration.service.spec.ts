import {
  IsNull,
  type Repository,
  type DataSource,
  type QueryRunner,
} from 'typeorm';
import { LEGACY_2_19_PREREQUISITE_RECONCILIATION_NAME } from 'src/engine/core-modules/upgrade/constants/legacy-2-19-prerequisite-reconciliation-name.constant';
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

describe('UpgradeMigrationService pinned complete history (mock QueryRunner, not PostgreSQL)', () => {
  const a = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const b = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const date = new Date('2026-09-25T01:02:03.000Z');
  const row = (id: string, workspaceId: string | null, overrides = {}) => ({
    id,
    workspaceId,
    name: 'unknown-old-command',
    attempt: 1,
    status: 'failed',
    isInitial: false,
    createdAt: date,
    ...overrides,
  });
  const repository = {
    manager: { query: jest.fn() },
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const service = new UpgradeMigrationService(
    repository as unknown as Repository<UpgradeMigrationEntity>,
  );
  const runner = (rows: unknown[]) => ({
    databaseConnection: {},
    isReleased: false,
    query: jest.fn().mockResolvedValue(rows),
    manager: { query: jest.fn(), getRepository: jest.fn() },
  });

  beforeEach(() => jest.clearAllMocks());

  it('reads every attempt and initial/unknown/failed receipt, partitions null and requested empty scopes without pooled reads', async () => {
    const rows = [
      row('null-1', null),
      row('a-1', a, { name: 'old-command', status: 'completed' }),
      row('a-2', a, { attempt: 2 }),
      row('b-initial', b, {
        name: 'selected-command',
        isInitial: true,
        status: 'completed',
      }),
    ];
    const pinned = runner(rows);
    const result = await service.getScopedUpgradeReceiptHistories({
      workspaceIds: [
        a,
        b,
        a.toUpperCase(),
        'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      ],
      queryRunner: pinned as unknown as QueryRunner,
    });
    expect([...result.keys()]).toEqual([
      null,
      a,
      b,
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    ]);
    expect(result.get(null)).toEqual([rows[0]]);
    expect(result.get(a)).toEqual([rows[1], rows[2]]);
    expect(result.get(b)).toEqual([rows[3]]);
    expect(result.get('cccccccc-cccc-4ccc-8ccc-cccccccccccc')).toEqual([]);
    expect(result.get(a)?.[0].id).toBe('a-1');
    expect(result.get(a)?.[0].createdAt).toBe(date);
    expect(pinned.query).toHaveBeenCalledTimes(1);
    expect(pinned.query).toHaveBeenCalledWith(
      expect.stringMatching(
        /SELECT id, name, attempt, status, "workspaceId", "isInitial", "createdAt"\s+FROM core\."upgradeMigration"\s+WHERE "workspaceId" IS NULL OR "workspaceId" = ANY\(\$1::uuid\[\]\)\s+ORDER BY "workspaceId" NULLS FIRST, "createdAt", id/,
      ),
      [[a, b, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc']],
    );
    expect(repository.manager.query).not.toHaveBeenCalled();
    expect(repository.find).not.toHaveBeenCalled();
    expect(repository.createQueryBuilder).not.toHaveBeenCalled();
    expect(pinned.manager.query).not.toHaveBeenCalled();
  });

  it('queries only null scope for explicitly empty workspace IDs', async () => {
    const pinned = runner([row('null-1', null)]);
    const result = await service.getScopedUpgradeReceiptHistories({
      workspaceIds: [],
      queryRunner: pinned as unknown as QueryRunner,
    });
    expect([...result.entries()]).toEqual([[null, [row('null-1', null)]]]);
    expect(pinned.query).toHaveBeenCalledWith(
      expect.stringContaining('ANY($1::uuid[])'),
      [[]],
    );
  });

  it.each([undefined, null, 'bad', [a, 'bad'], [a, null]])(
    'rejects invalid or absent workspace scope %p before querying',
    async (workspaceIds) => {
      const pinned = runner([]);
      await expect(
        service.getScopedUpgradeReceiptHistories({
          workspaceIds,
          queryRunner: pinned as unknown as QueryRunner,
        } as Parameters<typeof service.getScopedUpgradeReceiptHistories>[0]),
      ).rejects.toThrow();
      expect(pinned.query).not.toHaveBeenCalled();
    },
  );

  it.each([
    null,
    { isReleased: true, databaseConnection: {} },
    { isReleased: false },
  ])(
    'rejects absent, released or disconnected runner %p',
    async (queryRunner) => {
      await expect(
        service.getScopedUpgradeReceiptHistories({
          workspaceIds: [],
          queryRunner: queryRunner as QueryRunner,
        }),
      ).rejects.toThrow();
    },
  );

  it('fails closed if a pinned result unexpectedly includes another workspace', async () => {
    const pinned = runner([row('out-of-scope', b)]);
    await expect(
      service.getScopedUpgradeReceiptHistories({
        workspaceIds: [a],
        queryRunner: pinned as unknown as QueryRunner,
      }),
    ).rejects.toThrow('outside requested workspace scope');
  });

  it('propagates pinned query errors rather than substituting pooled history', async () => {
    const pinned = runner([]);
    const failure = new Error('query failed');
    pinned.query.mockRejectedValue(failure);
    await expect(
      service.getScopedUpgradeReceiptHistories({
        workspaceIds: [a],
        queryRunner: pinned as unknown as QueryRunner,
      }),
    ).rejects.toBe(failure);
    expect(repository.manager.query).not.toHaveBeenCalled();
  });
});

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
      exists: jest.fn().mockResolvedValue(true),
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

  it.each(['failed', 'completed'] as const)(
    'reads the latest global R %s attempt by exact identity and attempt order after reconstruction',
    async (status) => {
      const { repository } = setup();
      const receipt = {
        ...historical,
        name: LEGACY_2_19_PREREQUISITE_RECONCILIATION_NAME,
        workspaceId: null,
        attempt: 2,
        status,
        errorMessage: status === 'failed' ? 'stored failure' : null,
        createdAt: new Date('2026-09-13T00:00:00Z'),
      };
      repository.findOne.mockResolvedValue(receipt);
      const reconstructed = new UpgradeMigrationService(
        repository as unknown as Repository<UpgradeMigrationEntity>,
      );

      expect(
        await reconstructed.getLatestPrerequisiteReconciliationAttempt(),
      ).toEqual(receipt);
      expect(repository.findOne).toHaveBeenCalledWith({
        where: {
          name: LEGACY_2_19_PREREQUISITE_RECONCILIATION_NAME,
          workspaceId: IsNull(),
        },
        order: { attempt: 'DESC' },
      });
      repository.findOne.mockResolvedValue(null);
      expect(
        await reconstructed.getLatestPrerequisiteReconciliationAttempt(),
      ).toBeNull();
    },
  );

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
        [[workspaceId], LEGACY_2_19_PREREQUISITE_RECONCILIATION_NAME],
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

  it.each([
    ['completed', false],
    ['failed', false],
    ['completed', true],
    ['failed', true],
  ] as const)(
    'excludes only non-progress R from all three cursors after %s, timestamp tie=%s',
    async (status, timestampTie) => {
      const { repository, queryBuilder } = setup();
      const r = LEGACY_2_19_PREREQUISITE_RECONCILIATION_NAME;
      const originalCursor = { name: INSTAGRAM_SLOW_D, status: 'completed' };
      const originalWorkspace = { ...historical };
      const originalInstance = {
        ...historical,
        ...originalCursor,
        workspaceId: null,
        isInitial: false,
      };
      const receipt = {
        ...originalInstance,
        name: r,
        status,
        createdAt: timestampTie
          ? originalInstance.createdAt
          : new Date('2026-09-13T00:00:00Z'),
      };
      // Emulate the query's exclusion while keeping the persisted rows untouched.
      const records = [
        originalInstance,
        originalWorkspace,
        receipt,
        { ...receipt, workspaceId },
      ];
      queryBuilder.getOne.mockImplementation(async () => {
        const predicates = queryBuilder.andWhere.mock.calls.map(([sql]) => sql);
        return predicates.some(
          (sql) => sql === 'migration.name != :nonProgressName',
        )
          ? originalInstance
          : receipt;
      });
      repository.manager.query.mockImplementation(
        async (sql: string, params: unknown[]) =>
          sql.includes('name != $2') && params[1] === r
            ? [originalWorkspace]
            : [{ ...receipt, workspaceId }],
      );
      repository.findOne.mockResolvedValue(receipt);
      const reconstructed = new UpgradeMigrationService(
        repository as unknown as Repository<UpgradeMigrationEntity>,
      );
      expect(
        await reconstructed.getLastAttemptedCommandNameOrThrow([workspaceId]),
      ).toEqual(originalCursor);
      expect(
        (
          await reconstructed.getWorkspaceLastAttemptedCommandName([
            workspaceId,
          ])
        ).get(workspaceId)?.name,
      ).toBe(INSTAGRAM_WORKSPACE_D);
      expect(
        (await reconstructed.getLastAttemptedInstanceCommand())?.name,
      ).toBe(INSTAGRAM_SLOW_D);
      expect(
        await reconstructed.isLastAttemptCompleted({
          name: r,
          workspaceId: null,
        }),
      ).toBe(status === 'completed');
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { name: r, workspaceId: IsNull() },
        order: { attempt: 'DESC' },
      });
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'migration.name != :nonProgressName',
        { nonProgressName: r },
      );
      expect(repository.manager.query).toHaveBeenCalledWith(
        expect.stringContaining('name != $2'),
        [[workspaceId], r],
      );
      expect(records[0]).toEqual(originalInstance);
      expect(records[1]).toEqual(originalWorkspace);
      expect(records[2]).toEqual(receipt);
      expect(await reconstructed.hasInstanceAttempt(r)).toBe(true);
      expect(repository.exists).toHaveBeenCalledWith({
        where: { name: r, workspaceId: IsNull() },
      });
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
          {
            withLock: async (operation: () => Promise<unknown>) => operation(),
            currentRunner: () => queryRunner,
          } as never,
        );
        const command = { up: jest.fn(), down: jest.fn() };
        await expect(
          runner.runFastInstanceCommand({ name: sequence[0].name, command }),
        ).resolves.toEqual({ status: 'success' });
        expect(command.up).toHaveBeenCalledWith(queryRunner);
      } else {
        const queryRunner = {
          isReleased: false,
          isTransactionActive: false,
          startTransaction: jest.fn(),
          commitTransaction: jest.fn(),
          manager: { getRepository: jest.fn().mockReturnValue(repository) },
        };
        const runner = new WorkspaceCommandRunnerService(
          config,
          service,
          status,
          { currentRunner: () => queryRunner } as never,
        );
        const command = {
          runOnWorkspace: jest.fn(),
          runOnWorkspaceInUpgradeTransaction: jest.fn(),
        } as unknown as RegisteredWorkspaceCommand['command'];
        await runner.runWorkspaceCommands({
          iteratorContext: { workspaceId, index: 0, total: 1 },
          options: {},
          workspaceCommands: [{ name: sequence[2].name, command }],
        });
        expect(command.runOnWorkspaceInUpgradeTransaction).toHaveBeenCalledWith(
          expect.objectContaining({ workspaceId }),
          queryRunner,
          expect.any(Function),
        );
        expect(queryRunner.startTransaction).toHaveBeenCalledTimes(1);
        expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
        expect(command.runOnWorkspace).not.toHaveBeenCalled();
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
