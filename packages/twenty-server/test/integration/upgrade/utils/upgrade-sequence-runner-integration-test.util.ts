import { Test, type TestingModule } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';

import { config } from 'dotenv';
import { DataSource, IsNull, type Repository } from 'typeorm';
import { WorkspaceActivationStatus } from 'twenty-shared/workspace';

import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { ApplicationEntity } from 'src/engine/core-modules/application/application.entity';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { InstanceCommandRunnerService } from 'src/engine/core-modules/upgrade/services/instance-command-runner.service';
import {
  UpgradeMigrationService,
  type WorkspaceLastAttemptedCommand,
} from 'src/engine/core-modules/upgrade/services/upgrade-migration.service';
import {
  UpgradeSequenceReaderService,
  type UpgradeStep,
  type WorkspaceUpgradeStep,
} from 'src/engine/core-modules/upgrade/services/upgrade-sequence-reader.service';
import { UpgradeSequenceRunnerService } from 'src/engine/core-modules/upgrade/services/upgrade-sequence-runner.service';
import { UpgradeAwareEntityMetadataAdapter } from 'src/engine/twenty-orm/upgrade-aware/upgrade-aware-entity-metadata.adapter';
import { UpgradeStatusService } from 'src/engine/core-modules/upgrade/services/upgrade-status.service';
import { WorkspaceCommandRunnerService } from 'src/engine/core-modules/upgrade/services/workspace-command-runner.service';
import {
  UpgradeMigrationEntity,
  type UpgradeMigrationStatus,
} from 'src/engine/core-modules/upgrade/upgrade-migration.entity';
import {
  SEED_APPLE_WORKSPACE_ID,
  SEED_EMPTY_WORKSPACE_3_ID,
  SEED_EMPTY_WORKSPACE_4_ID,
  SEED_YCOMBINATOR_WORKSPACE_ID,
} from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';
import { createWorkspace } from 'src/engine/workspace-manager/dev-seeder/core/utils/seed-workspace.util';
import { WorkspaceVersionService } from 'src/engine/workspace-manager/workspace-version/services/workspace-version.service';

jest.useRealTimers();

config({
  path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
  override: true,
});

export const WS_1 = SEED_APPLE_WORKSPACE_ID;
export const WS_2 = SEED_YCOMBINATOR_WORKSPACE_ID;
export const WS_3 = SEED_EMPTY_WORKSPACE_3_ID;
export const WS_4 = SEED_EMPTY_WORKSPACE_4_ID;

const FK_WORKSPACE_FIXTURES = [
  {
    workspaceId: WS_3,
    applicationId: 'f1c0ffee-0000-4000-8000-0000000000c3',
    subdomain: 'upgrade-test-fixture-3',
  },
  {
    workspaceId: WS_4,
    applicationId: 'f1c0ffee-0000-4000-8000-0000000000c4',
    subdomain: 'upgrade-test-fixture-4',
  },
];

const seedEmptyWorkspaces = async (dataSource: DataSource) => {
  const queryRunner = dataSource.createQueryRunner();

  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    for (const {
      workspaceId,
      applicationId,
      subdomain,
    } of FK_WORKSPACE_FIXTURES) {
      await createWorkspace({
        queryRunner,
        schemaName: 'core',
        createWorkspaceInput: {
          id: workspaceId,
          displayName: subdomain,
          subdomain,
          inviteHash: `${subdomain}.dev-invite-hash`,
          logo: '',
          activationStatus: WorkspaceActivationStatus.PENDING_CREATION,
          isTwoFactorAuthenticationEnforced: false,
          workspaceCustomApplicationId: applicationId,
        },
      });

      await queryRunner.manager
        .createQueryBuilder()
        .insert()
        .into(ApplicationEntity)
        .values({
          id: applicationId,
          universalIdentifier: applicationId,
          name: 'upgrade-test-fixture',
          sourcePath: '',
          workspaceId,
        })
        .orIgnore()
        .execute();
    }

    await queryRunner.commitTransaction();
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
};

const EXECUTED_BY_VERSION = `42.42.42-test-${process.pid}`;
const TEST_COMMAND_NAME_SUFFIX = `-test-${process.pid}-${Date.now()}`;

export const clearUpgradeSequenceRunnerTestMigrations = async (
  dataSource: DataSource,
) => {
  await dataSource.query(
    `DELETE FROM core."upgradeMigration"
     WHERE "executedByVersion" = $1`,
    [EXECUTED_BY_VERSION],
  );
};

class UpgradeSequenceRunnerTestMigrationService extends UpgradeMigrationService {
  constructor(
    private readonly testMigrationRepository: Repository<UpgradeMigrationEntity>,
  ) {
    super(testMigrationRepository);
  }

  override async isLastAttemptCompleted({
    name,
    workspaceId,
  }: {
    name: string;
    workspaceId: string | null;
  }): Promise<boolean> {
    const latestAttempt = await this.testMigrationRepository.findOne({
      where: {
        name,
        executedByVersion: EXECUTED_BY_VERSION,
        workspaceId: workspaceId === null ? IsNull() : workspaceId,
      },
      order: { attempt: 'DESC' },
    });

    return latestAttempt?.status === 'completed';
  }

  override async getLastAttemptedCommandNameOrThrow(
    allActiveOrSuspendedWorkspaceIds: string[],
  ): Promise<{
    name: string;
    status: UpgradeMigrationStatus;
  }> {
    const parameters: unknown[] = [EXECUTED_BY_VERSION];
    const workspaceScope =
      allActiveOrSuspendedWorkspaceIds.length > 0
        ? `AND (migration."workspaceId" IS NULL OR migration."workspaceId" = ANY($2))`
        : 'AND migration."workspaceId" IS NULL';

    if (allActiveOrSuspendedWorkspaceIds.length > 0) {
      parameters.push(allActiveOrSuspendedWorkspaceIds);
    }

    const [migration] = await this.testMigrationRepository.query<
      Array<{ name: string; status: UpgradeMigrationStatus }>
    >(
      `SELECT migration.name, migration.status
         FROM core."upgradeMigration" migration
        WHERE migration."executedByVersion" = $1
          AND migration."isInitial" = false
          AND migration.attempt = (
            SELECT MAX(sub.attempt)
              FROM core."upgradeMigration" sub
             WHERE sub.name = migration.name
               AND sub."executedByVersion" = $1
               AND (
                 (sub."workspaceId" IS NULL AND migration."workspaceId" IS NULL)
                 OR sub."workspaceId" = migration."workspaceId"
               )
          )
          ${workspaceScope}
        ORDER BY migration."createdAt" DESC
        LIMIT 1`,
      parameters,
    );

    if (!migration) {
      throw new Error(
        'No upgrade migration found — the database may not have been initialized',
      );
    }

    return migration;
  }

  override async getWorkspaceLastAttemptedCommandName(
    workspaceIds: string[],
  ): Promise<Map<string, WorkspaceLastAttemptedCommand>> {
    if (workspaceIds.length === 0) {
      return new Map();
    }

    const rows = await this.testMigrationRepository.query<
      WorkspaceLastAttemptedCommand[]
    >(
      `SELECT DISTINCT ON (latest_per_name."workspaceId")
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
            AND "executedByVersion" = $2
          ORDER BY "workspaceId", name, attempt DESC
        ) latest_per_name
        ORDER BY latest_per_name."workspaceId", latest_per_name."createdAt" DESC`,
      [workspaceIds, EXECUTED_BY_VERSION],
    );

    return new Map(rows.map((row) => [row.workspaceId, row]));
  }
}

const noopAsync = async () => {};

export const makeStep = (
  kind: UpgradeStep['kind'],
  name: string,
): UpgradeStep => {
  const command =
    kind === 'workspace'
      ? { runOnWorkspace: noopAsync }
      : kind === 'slow-instance'
        ? { up: noopAsync, down: noopAsync, runDataMigration: noopAsync }
        : { up: noopAsync, down: noopAsync };

  return {
    kind,
    name: `${name}${TEST_COMMAND_NAME_SUFFIX}`,
    command,
    version: '1.21.0',
    timestamp: 0,
  } as unknown as UpgradeStep;
};

export const makeFastInstance = (name: string) =>
  makeStep('fast-instance', name);

export const makeSlowInstance = (name: string) =>
  makeStep('slow-instance', name);

export const makeWorkspace = (name: string) =>
  makeStep('workspace', name) as WorkspaceUpgradeStep;

let mockActiveWorkspaceIds: string[] = [];

export const setMockActiveWorkspaceIds = (ids: string[]) => {
  mockActiveWorkspaceIds = ids;
};

export const DEFAULT_OPTIONS = {
  workspaceIds: undefined,
  startFromWorkspaceId: undefined,
  workspaceCountLimit: undefined,
  dryRun: false,
  verbose: false,
};

type IntegrationTestModule = Awaited<
  ReturnType<typeof createUpgradeSequenceRunnerIntegrationTestModule>
>;

export type IntegrationTestContext = {
  [K in keyof IntegrationTestModule]: IntegrationTestModule[K];
};

export const createUpgradeSequenceRunnerIntegrationTestModule = async () => {
  const dataSource = new DataSource({
    type: 'postgres',
    url: process.env.PG_DATABASE_URL,
    schema: 'core',
    entities: [
      'src/engine/core-modules/**/*.entity.ts',
      'src/engine/metadata-modules/**/*.entity.ts',
    ],
    synchronize: false,
  });

  await dataSource.initialize();

  await seedEmptyWorkspaces(dataSource);

  const migrationRepo: Repository<UpgradeMigrationEntity> =
    dataSource.getRepository(UpgradeMigrationEntity);

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      {
        provide: getRepositoryToken(UpgradeMigrationEntity),
        useValue: migrationRepo,
      },
      {
        provide: getDataSourceToken(),
        useValue: dataSource,
      },
      {
        provide: TwentyConfigService,
        useValue: {
          get: (key: string) =>
            key === 'APP_VERSION' ? EXECUTED_BY_VERSION : undefined,
        },
      },
      {
        provide: UpgradeMigrationService,
        useValue: new UpgradeSequenceRunnerTestMigrationService(migrationRepo),
      },
      {
        provide: WorkspaceVersionService,
        useValue: {
          getActiveOrSuspendedWorkspaceIds: jest
            .fn()
            .mockImplementation(async () => mockActiveWorkspaceIds),
          hasActiveOrSuspendedWorkspaces: jest
            .fn()
            .mockImplementation(async () => mockActiveWorkspaceIds.length > 0),
        },
      },
      {
        provide: UpgradeSequenceReaderService,
        useFactory: () => new UpgradeSequenceReaderService({} as any),
      },
      {
        provide: UpgradeStatusService,
        useValue: {
          invalidateInstanceAndAllWorkspacesStatus: jest
            .fn()
            .mockResolvedValue(undefined),
        },
      },
      InstanceCommandRunnerService,
      WorkspaceCommandRunnerService,
      {
        provide: WorkspaceIteratorService,
        useValue: {
          iterate: jest.fn().mockImplementation(async (args: any) => {
            const { callback, workspaceIds } = args;
            const ids = workspaceIds ?? [WS_1];
            const report = { fail: [] as any[], success: [] as any[] };

            for (const [index, workspaceId] of ids.entries()) {
              try {
                await callback({
                  workspaceId,
                  index,
                  total: ids.length,
                  dataSource,
                });
                report.success.push({ workspaceId });
              } catch (error) {
                report.fail.push({ error, workspaceId });
              }
            }

            return report;
          }),
        },
      },
      {
        provide: UpgradeAwareEntityMetadataAdapter,
        useValue: {
          refresh: jest.fn().mockResolvedValue(undefined),
          isEntityAvailable: jest.fn().mockReturnValue(true),
          getHiddenColumnPropertyNames: jest.fn().mockReturnValue(new Set()),
        },
      },
      UpgradeSequenceRunnerService,
    ],
  }).compile();

  const runner = module.get(UpgradeSequenceRunnerService);

  jest.spyOn(runner['logger'], 'log').mockImplementation();
  jest.spyOn(runner['logger'], 'error').mockImplementation();
  jest.spyOn(runner['logger'], 'warn').mockImplementation();

  const instanceCommandRunnerService = module.get(InstanceCommandRunnerService);

  jest
    .spyOn(instanceCommandRunnerService['logger'], 'log')
    .mockImplementation();
  jest
    .spyOn(instanceCommandRunnerService['logger'], 'error')
    .mockImplementation();

  const workspaceCommandRunnerService = module.get(
    WorkspaceCommandRunnerService,
  );

  jest
    .spyOn(workspaceCommandRunnerService['logger'], 'log')
    .mockImplementation();
  jest
    .spyOn(workspaceCommandRunnerService['logger'], 'error')
    .mockImplementation();

  return {
    module,
    dataSource,
    runner,
  };
};

let seedSequenceCounter = 0;

export const resetSeedSequenceCounter = () => {
  seedSequenceCounter = 0;
};

export const seedInstanceMigration = async (
  dataSource: DataSource,
  {
    name,
    status,
    workspaceIds = [],
    attempt = 1,
    executedByVersion = EXECUTED_BY_VERSION,
    namespaceName = true,
  }: {
    name: string;
    status: 'completed' | 'failed';
    workspaceIds?: string[];
    attempt?: number;
    executedByVersion?: string;
    namespaceName?: boolean;
  },
) => {
  const persistedName = namespaceName
    ? `${name}${TEST_COMMAND_NAME_SUFFIX}`
    : name;
  // Seeds must have past timestamps so the runner's NOW()-based records
  // always sort after them in createdAt order.
  const createdAt = new Date(
    Date.now() - (1000000 - seedSequenceCounter * 1000),
  ).toISOString();

  seedSequenceCounter++;

  const values: string[] = [];
  const args: unknown[] = [];
  let paramIndex = 1;

  values.push(
    `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, NULL, $${paramIndex++}, false)`,
  );
  args.push(persistedName, status, attempt, executedByVersion, createdAt);

  for (const workspaceId of workspaceIds) {
    values.push(
      `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, false)`,
    );
    args.push(
      persistedName,
      status,
      attempt,
      executedByVersion,
      workspaceId,
      createdAt,
    );
  }

  await dataSource.query(
    `INSERT INTO core."upgradeMigration" (name, status, attempt, "executedByVersion", "workspaceId", "createdAt", "isInitial")
     VALUES ${values.join(', ')}`,
    args,
  );
};

export const seedWorkspaceMigration = async (
  dataSource: DataSource,
  {
    name,
    status,
    workspaceId,
    attempt = 1,
    isInitial = false,
    useCurrentTimestamp = false,
    namespaceName = true,
  }: {
    name: string;
    status: 'completed' | 'failed';
    workspaceId: string;
    attempt?: number;
    isInitial?: boolean;
    useCurrentTimestamp?: boolean;
    namespaceName?: boolean;
  },
) => {
  const persistedName = namespaceName
    ? `${name}${TEST_COMMAND_NAME_SUFFIX}`
    : name;
  if (useCurrentTimestamp) {
    await dataSource.query(
      `INSERT INTO core."upgradeMigration" (name, status, attempt, "executedByVersion", "workspaceId", "isInitial")
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        persistedName,
        status,
        attempt,
        EXECUTED_BY_VERSION,
        workspaceId,
        isInitial,
      ],
    );
  } else {
    const createdAt = new Date(
      Date.now() - (1000000 - seedSequenceCounter * 1000),
    ).toISOString();

    seedSequenceCounter++;

    await dataSource.query(
      `INSERT INTO core."upgradeMigration" (name, status, attempt, "executedByVersion", "workspaceId", "createdAt", "isInitial")
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        persistedName,
        status,
        attempt,
        EXECUTED_BY_VERSION,
        workspaceId,
        createdAt,
        isInitial,
      ],
    );
  }
};

export type ExecutedMigrationRecord = {
  name: string;
  status: string;
  attempt: number;
  workspaceId: string | null;
  isInitial: boolean;
};

export const testGetExecutedMigrationsInOrder = async (
  dataSource: DataSource,
): Promise<ExecutedMigrationRecord[]> => {
  const rows = await dataSource.query<ExecutedMigrationRecord[]>(
    `SELECT name, status, attempt, "workspaceId", "isInitial"
     FROM core."upgradeMigration"
     WHERE "executedByVersion" = $1
     ORDER BY "createdAt" ASC, "workspaceId" ASC NULLS FIRST, attempt ASC`,
    [EXECUTED_BY_VERSION],
  );

  return rows.map((row) => ({
    ...row,
    name: row.name.endsWith(TEST_COMMAND_NAME_SUFFIX)
      ? row.name.slice(0, -TEST_COMMAND_NAME_SUFFIX.length)
      : row.name,
  }));
};

export const migrationRecordToKey = ({
  name,
  workspaceId,
  status,
  attempt,
  isInitial,
}: ExecutedMigrationRecord): string => {
  const scope = workspaceId ?? 'instance';
  const initial = isInitial ? ':initial' : '';

  return `${name}:${scope}:${status}:${attempt}${initial}`;
};
