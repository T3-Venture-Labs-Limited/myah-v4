import { randomUUID } from 'node:crypto';

import { EventEmitter2 } from '@nestjs/event-emitter';
import { DiscoveryModule } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MessageParticipantRole } from 'twenty-shared/types';
import { DataSource, type QueryRunner } from 'typeorm';
import IORedis from 'ioredis';

import { UpgradeCommandRegistryService } from 'src/engine/core-modules/upgrade/services/upgrade-command-registry.service';
import { UpgradeMigrationService } from 'src/engine/core-modules/upgrade/services/upgrade-migration.service';
import { UpgradeSequenceReaderService } from 'src/engine/core-modules/upgrade/services/upgrade-sequence-reader.service';
import { UpgradeMigrationEntity } from 'src/engine/core-modules/upgrade/upgrade-migration.entity';
import { UpgradeAwareEntityMetadataAdapter } from 'src/engine/twenty-orm/upgrade-aware/upgrade-aware-entity-metadata.adapter';
import { installUpgradeAwareRepositoryProxy } from 'src/engine/twenty-orm/upgrade-aware/install-upgrade-aware-repository-proxy';
import { getRegisteredInstanceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { getRegisteredWorkspaceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { CacheStorageNamespace } from 'src/engine/core-modules/cache-storage/types/cache-storage-namespace.enum';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { MetricsService } from 'src/engine/core-modules/metrics/metrics.service';
import { ApplicationEntity } from 'src/engine/core-modules/application/application.entity';
import { FeatureFlagEntity } from 'src/engine/core-modules/feature-flag/feature-flag.entity';
import { FieldMetadataEntity } from 'src/engine/metadata-modules/field-metadata/field-metadata.entity';
import { IndexMetadataEntity } from 'src/engine/metadata-modules/index-metadata/index-metadata.entity';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { FieldPermissionEntity } from 'src/engine/metadata-modules/object-permission/field-permission/field-permission.entity';
import { ObjectPermissionEntity } from 'src/engine/metadata-modules/object-permission/object-permission.entity';
import { RolePermissionFlagEntity } from 'src/engine/metadata-modules/role-permission-flag/role-permission-flag.entity';
import { RoleTargetEntity } from 'src/engine/metadata-modules/role-target/role-target.entity';
import { RoleEntity } from 'src/engine/metadata-modules/role/role.entity';
import { RowLevelPermissionPredicateEntity } from 'src/engine/metadata-modules/row-level-permission-predicate/entities/row-level-permission-predicate.entity';
import { RowLevelPermissionPredicateGroupEntity } from 'src/engine/metadata-modules/row-level-permission-predicate/entities/row-level-permission-predicate-group.entity';
import { SearchFieldMetadataEntity } from 'src/engine/metadata-modules/search-field-metadata/search-field-metadata.entity';
import { ViewEntity } from 'src/engine/metadata-modules/view/entities/view.entity';
import { ViewFieldEntity } from 'src/engine/metadata-modules/view-field/entities/view-field.entity';
import { ViewFilterEntity } from 'src/engine/metadata-modules/view-filter/entities/view-filter.entity';
import { ViewGroupEntity } from 'src/engine/metadata-modules/view-group/entities/view-group.entity';
import { ViewSortEntity } from 'src/engine/metadata-modules/view-sort/entities/view-sort.entity';
import { WorkspaceFlatObjectMetadataMapCacheService } from 'src/engine/metadata-modules/flat-object-metadata/services/workspace-flat-object-metadata-map-cache.service';
import { WorkspaceFlatFieldMetadataMapCacheService } from 'src/engine/metadata-modules/flat-field-metadata/services/workspace-flat-field-metadata-map-cache.service';
import { WorkspaceFlatIndexMapCacheService } from 'src/engine/metadata-modules/flat-index-metadata/services/workspace-flat-index-map-cache.service';
import { WorkspaceFlatRowLevelPermissionPredicateMapCacheService } from 'src/engine/metadata-modules/flat-row-level-permission-predicate/services/workspace-flat-row-level-permission-predicate-map-cache.service';
import { WorkspaceFlatRowLevelPermissionPredicateGroupMapCacheService } from 'src/engine/metadata-modules/flat-row-level-permission-predicate/services/workspace-flat-row-level-permission-predicate-group-map-cache.service';
import { WorkspaceRolesPermissionsCacheService } from 'src/engine/metadata-modules/role/services/workspace-roles-permissions-cache.service';
import { WorkspaceUserWorkspaceRoleMapCacheService } from 'src/engine/metadata-modules/role-target/services/workspace-user-workspace-role-map-cache.service';
import { WorkspaceApiKeyRoleMapCacheService } from 'src/engine/metadata-modules/role-target/services/workspace-api-key-role-map-cache.service';
import { WorkspaceFeatureFlagsMapCacheService } from 'src/engine/metadata-modules/workspace-feature-flags-map-cache/workspace-feature-flags-map-cache.service';
import { EntitySchemaColumnFactory } from 'src/engine/twenty-orm/factories/entity-schema-column.factory';
import { EntitySchemaRelationFactory } from 'src/engine/twenty-orm/factories/entity-schema-relation.factory';
import { EntitySchemaFactory } from 'src/engine/twenty-orm/factories/entity-schema.factory';
import { GlobalWorkspaceDataSourceService } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource.service';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { WorkspaceORMEntityMetadatasCacheService } from 'src/engine/twenty-orm/global-workspace-datasource/workspace-orm-entity-metadatas-cache.service';
import { getWorkspaceScopedRepositoryToken } from 'src/engine/twenty-orm/workspace-scoped-repository/get-workspace-scoped-repository-token.util';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { WorkspaceEventEmitter } from 'src/engine/workspace-event-emitter/workspace-event-emitter';
import { MatchParticipantService } from 'src/modules/match-participant/match-participant.service';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { MessageParticipantWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message-participant.workspace-entity';
import { CalendarEventParticipantWorkspaceEntity } from 'src/modules/calendar/common/standard-objects/calendar-event-participant.workspace-entity';

import { connectionSource } from 'src/database/typeorm/core/core.datasource';
import { rawDataSource } from 'src/database/typeorm/raw/raw.datasource';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { type GlobalWorkspaceDataSource } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource';

const root =
  '/home/superdao/myah-v4/.worktrees/daryll/myah-392-manage-creator-partnerships-from-reply-through-fulfillment';
const selector =
  '/home/superdao/.local/share/myah-scratch/myah334-frontier-20260928/timeline-atomicity.env';
const database = 'myah334_timeline_atomicity_20260928';
const marker = 'MYAH334_TIMELINE_ATOMICITY_20260928_TASK_OWNED';
const entities = [
  ApplicationEntity,
  FeatureFlagEntity,
  FieldMetadataEntity,
  IndexMetadataEntity,
  ObjectMetadataEntity,
  FieldPermissionEntity,
  ObjectPermissionEntity,
  RolePermissionFlagEntity,
  RoleTargetEntity,
  RoleEntity,
  RowLevelPermissionPredicateEntity,
  RowLevelPermissionPredicateGroupEntity,
  SearchFieldMetadataEntity,
  ViewEntity,
  ViewFieldEntity,
  ViewFilterEntity,
  ViewGroupEntity,
  ViewSortEntity,
];
const cacheProviders = [
  WorkspaceFlatObjectMetadataMapCacheService,
  WorkspaceFlatFieldMetadataMapCacheService,
  WorkspaceFlatIndexMapCacheService,
  WorkspaceFlatRowLevelPermissionPredicateMapCacheService,
  WorkspaceFlatRowLevelPermissionPredicateGroupMapCacheService,
  WorkspaceRolesPermissionsCacheService,
  WorkspaceUserWorkspaceRoleMapCacheService,
  WorkspaceApiKeyRoleMapCacheService,
  WorkspaceFeatureFlagsMapCacheService,
  WorkspaceORMEntityMetadatasCacheService,
];
const phase = process.env.MYAH334_TIMELINE_PHASE;

type BootstrapContext = {
  workspaceId: string;
  rawUrl: string;
  syntheticId: string;
  inspectionRunner: QueryRunner;
  orm: GlobalWorkspaceOrmManager;
  dataSource: GlobalWorkspaceDataSource;
  workspaceEmitter: WorkspaceEventEmitter;
  isolatedEmitter: EventEmitter2;
};

// stderr, unlike console.*, remains visible under the unit Jest config's silent:true.
// Fixed stage labels only: never print URLs, SQL, identifiers, or result payloads.
const stage = (token: string): void => {
  process.stderr.write(`[myah334-timeline] ${token}\n`);
};

const rollbackStep = async <T>(
  token: string,
  operation: () => Promise<T>,
): Promise<T> => {
  stage(`rollback-before-${token}`);
  try {
    const result = await operation();
    stage(`rollback-after-${token}`);
    return result;
  } catch (error) {
    stage(`rollback-failed-${token}`);
    throw error;
  }
};

// The guard deliberately keeps its own repeatable-read snapshot pinned. Each
// visibility assertion instead opens and closes a different physical pool and
// READ ONLY transaction, so the post-rollback read cannot reuse prewrite data.
async function freshReadOnlyActivityCount(
  url: string,
  personId: string,
  phase: 'uncommitted' | 'post-rollback',
): Promise<number> {
  const fresh = new DataSource({
    type: 'postgres',
    url,
    poolSize: 1,
    connectTimeoutMS: 5_000,
    extra: { connectionTimeoutMillis: 5_000, query_timeout: 8_000 },
  });
  let freshRunner: QueryRunner | undefined;
  let freshConnected = false;
  try {
    await rollbackStep(`${phase}-pool-initialize`, () => fresh.initialize());
    const runner = fresh.createQueryRunner();
    freshRunner = runner;
    await rollbackStep(`${phase}-connect`, () => runner.connect());
    freshConnected = true;
    const [connectionMode] = await rollbackStep(
      `${phase}-default-readonly`,
      () => runner.query('SHOW default_transaction_read_only'),
    );
    if (connectionMode?.default_transaction_read_only !== 'on')
      throw new Error('Fresh inspection connection is not read-only');
    await rollbackStep(`${phase}-begin-readonly`, () =>
      runner.query('BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY'),
    );
    const [transactionMode] = await rollbackStep(
      `${phase}-transaction-readonly`,
      () => runner.query('SHOW transaction_read_only'),
    );
    const [isolation] = await rollbackStep(`${phase}-isolation`, () =>
      runner.query('SHOW transaction_isolation'),
    );
    if (
      transactionMode?.transaction_read_only !== 'on' ||
      isolation?.transaction_isolation !== 'read committed'
    )
      throw new Error(
        'Fresh inspection snapshot is not read committed and read-only',
      );
    const [result] = await rollbackStep(`${phase}-activity-count`, () =>
      runner.query(
        `SELECT count(*)::integer activities FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."timelineActivity"
         WHERE "targetPersonId"=$1`,
        [personId],
      ),
    );
    return result?.activities;
  } finally {
    try {
      if (freshRunner) {
        const runner = freshRunner;
        try {
          // Raw BEGIN does not set TypeORM's isTransactionActive flag.
          if (freshConnected)
            await rollbackStep(`${phase}-snapshot-rollback`, () =>
              runner.query('ROLLBACK'),
            );
        } finally {
          await rollbackStep(`${phase}-release`, () => runner.release());
        }
      }
    } finally {
      if (fresh.isInitialized)
        await rollbackStep(`${phase}-pool-destroy`, () => fresh.destroy());
    }
  }
}

async function withGuardedReadOnlyBootstrap(
  mode: 'ROLLBACK' | 'READ_ONLY_DIAGNOSTIC',
  onReady: (context: BootstrapContext) => Promise<void>,
): Promise<void> {
  const diagnostic = mode === 'READ_ONLY_DIAGNOSTIC';
  const checkpoint = (token: string): void =>
    stage(diagnostic ? token : `rollback-${token}`);
  const bootstrapStep = <T>(
    token: string,
    operation: () => Promise<T>,
  ): Promise<T> =>
    diagnostic ? operation() : rollbackStep(`bootstrap-${token}`, operation);
  checkpoint('before-compiled-target-guard');
  const raw =
    'url' in rawDataSource.options ? rawDataSource.options.url : undefined;
  const core =
    'url' in connectionSource.options
      ? connectionSource.options.url
      : undefined;
  if (
    !raw ||
    raw !== core ||
    raw !== process.env.PG_DATABASE_URL ||
    process.env.NODE_ENV !== 'test' ||
    process.env.TWENTY_SERVER_INTEGRATION_ENV_FILE !== selector ||
    ![root, `${root}/packages/twenty-server`].includes(process.cwd()) ||
    !process.argv.some((arg) => arg.includes('jest')) ||
    phase !== mode
  ) {
    throw new Error(
      'Refusing timeline physical test: process/compiled datasource selector mismatch',
    );
  }
  const pg = new URL(raw);
  const redisUrl = new URL(process.env.REDIS_URL ?? '');
  if (
    pg.protocol !== 'postgres:' ||
    pg.hostname !== '127.0.0.1' ||
    pg.port !== '32788' ||
    pg.pathname !== `/${database}` ||
    pg.search ||
    pg.hash ||
    redisUrl.protocol !== 'redis:' ||
    redisUrl.hostname !== '127.0.0.1' ||
    redisUrl.port !== '32789' ||
    redisUrl.pathname !== '/6' ||
    redisUrl.search ||
    redisUrl.hash ||
    (process.env.REDIS_QUEUE_URL &&
      process.env.REDIS_QUEUE_URL !== process.env.REDIS_URL)
  ) {
    throw new Error(
      'Refusing timeline physical test: exact PG/Redis target mismatch',
    );
  }
  if (connectionSource.options.type !== 'postgres') {
    throw new Error(
      'Refusing timeline physical test: core datasource is not PostgreSQL',
    );
  }
  const coreOptions = connectionSource.options;
  checkpoint('after-compiled-target-guard');
  const redis = new IORedis(process.env.REDIS_URL!, {
    lazyConnect: true,
    enableOfflineQueue: false,
    connectTimeout: 5_000,
    commandTimeout: 5_000,
    retryStrategy: () => null,
  });
  const inspection = new DataSource({
    type: 'postgres',
    url: raw,
    poolSize: 1,
    connectTimeoutMS: 5_000,
    extra: { connectionTimeoutMillis: 5_000, query_timeout: 8_000 },
  });
  // Preserve compiled URL/entities, and bound both modes' connection/query waits.
  const coreDataSource = new DataSource({
    ...coreOptions,
    poolSize: 2,
    connectTimeoutMS: 5_000,
    extra: {
      ...coreOptions.extra,
      connectionTimeoutMillis: 5_000,
      query_timeout: 8_000,
    },
  });
  let inspectionRunner: QueryRunner | undefined;
  let inspectionConnected = false;
  const syntheticId = randomUUID();
  try {
    checkpoint('before-redis-connect');
    await bootstrapStep('redis-connect', () => redis.connect());
    if (
      (await bootstrapStep('redis-preflight-dbsize', () => redis.dbsize())) !==
      0
    )
      throw new Error('Refusing timeline physical test: Redis6 is not empty');
    checkpoint('after-redis-dbsize');
    // Set before initializing ANY PG pool. The server enforces read-only
    // from first connect, independently of client-side transaction intent.
    process.env.PGOPTIONS = diagnostic
      ? '-c default_transaction_read_only=on -c statement_timeout=8000 -c lock_timeout=2000 -c idle_in_transaction_session_timeout=15000 -c application_name=myah334_timeline_ro_diag'
      : '-c default_transaction_read_only=on -c statement_timeout=8000 -c lock_timeout=2000 -c idle_in_transaction_session_timeout=15000 -c application_name=myah334_timeline_rollback_probe';
    checkpoint('before-inspection-initialize');
    await bootstrapStep('inspection-initialize', () => inspection.initialize());
    inspectionRunner = inspection.createQueryRunner();
    const guardRunner = inspectionRunner;
    await bootstrapStep('inspection-runner-connect', () =>
      guardRunner.connect(),
    );
    inspectionConnected = true;
    const [inspectionReadonly] = await bootstrapStep(
      'inspection-default-readonly',
      () => guardRunner.query('SHOW default_transaction_read_only'),
    );
    if (inspectionReadonly?.default_transaction_read_only !== 'on') {
      throw new Error('Inspection connection is not server-side read-only');
    }
    await bootstrapStep('inspection-begin-readonly', () =>
      guardRunner.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'),
    );
    const [transactionReadonly] = await bootstrapStep(
      'inspection-transaction-readonly',
      () => guardRunner.query('SHOW transaction_read_only'),
    );
    const [isolation] = await bootstrapStep('inspection-isolation', () =>
      guardRunner.query('SHOW transaction_isolation'),
    );
    if (
      transactionReadonly?.transaction_read_only !== 'on' ||
      isolation?.transaction_isolation !== 'repeatable read'
    ) {
      throw new Error('Inspection snapshot is not repeatable read-only');
    }
    checkpoint('after-inspection-snapshot-before-marker');
    const [identity] = await bootstrapStep('inspection-marker', () =>
      guardRunner.query(`SELECT current_database() db, shobj_description(oid,'pg_database') marker,
      current_setting('server_version_num') version FROM pg_database WHERE datname=current_database()`),
    );
    if (
      identity?.db !== database ||
      identity.marker !== marker ||
      !String(identity.version).startsWith('16')
    ) {
      throw new Error('Refusing timeline physical test: PG16 marker mismatch');
    }
    checkpoint('after-marker-before-fixture-snapshot');
    const [counts] = await bootstrapStep('inspection-fixture-counts', () =>
      guardRunner.query(`SELECT
      (SELECT count(*)::integer FROM core."upgradeMigration") receipts,
      (SELECT count(*)::integer FROM core."upgradeMigration" WHERE "status" <> 'completed') failed,
      (SELECT count(*)::integer FROM core."campaignPartnershipWorkItem") work,
      (SELECT count(*)::integer FROM core."campaignEmailWorkCollision") collision,
      (SELECT count(*)::integer FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname IN ('core','public') OR n.nspname LIKE 'workspace_%') objects`),
    );
    if (
      counts?.receipts !== 143 ||
      counts.failed !== 0 ||
      counts.work !== 2 ||
      counts.collision !== 1 ||
      counts.objects !== 673
    ) {
      throw new Error(
        'Refusing timeline physical test: inherited fixture changed',
      );
    }
    const workStates = await bootstrapStep('inspection-work-states', () =>
      guardRunner.query(
        `SELECT "state" FROM core."campaignPartnershipWorkItem"`,
      ),
    );
    if (
      workStates.length !== 2 ||
      workStates.some((work: { state: string }) => work.state !== 'HELD')
    ) {
      throw new Error(
        'Refusing timeline physical test: inherited HELD work changed',
      );
    }
    const workspaces = await bootstrapStep('inspection-workspaces', () =>
      guardRunner.query('SELECT "id" FROM core."workspace"'),
    );
    if (workspaces.length !== 1)
      throw new Error(
        'Refusing timeline physical test: workspace count changed',
      );
    const workspaceId = workspaces[0].id as string;
    const schema = getWorkspaceSchemaName(workspaceId);
    if (schema !== 'workspace_1wgvd1injqtife6y4rvfbu3h5') {
      throw new Error(
        'Refusing timeline physical test: workspace identity changed',
      );
    }
    const [tableCount] = await bootstrapStep('inspection-table-count', () =>
      guardRunner.query(
        `SELECT count(*)::integer tables FROM information_schema.tables
      WHERE table_schema=$1 AND table_type='BASE TABLE'`,
        [schema],
      ),
    );
    if (tableCount?.tables !== 45)
      throw new Error(
        'Refusing timeline physical test: workspace table count changed',
      );
    const objects = await bootstrapStep('inspection-native-metadata', () =>
      guardRunner.query(
        `SELECT "nameSingular" FROM core."objectMetadata"
      WHERE "workspaceId"=$1 AND "nameSingular"=ANY($2)`,
        [
          workspaceId,
          [
            'person',
            'message',
            'messageParticipant',
            'calendarEvent',
            'calendarEventParticipant',
            'timelineActivity',
          ],
        ],
      ),
    );
    if (objects.length !== 6)
      throw new Error(
        'Refusing timeline physical test: native metadata missing',
      );
    const [fresh] = await bootstrapStep('inspection-synthetic-absence', () =>
      guardRunner.query(
        `SELECT
      (SELECT count(*)::integer FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."person" WHERE "id"=$1) people,
      (SELECT count(*)::integer FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."message" WHERE "id"=$1) messages,
      (SELECT count(*)::integer FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."calendarEvent" WHERE "id"=$1) events,
      (SELECT count(*)::integer FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."timelineActivity" WHERE "linkedRecordId"=$1) activities`,
        [syntheticId],
      ),
    );
    if (Object.values(fresh).some((count) => count !== 0))
      throw new Error(
        'Refusing timeline physical test: synthetic identity exists',
      );
    checkpoint('after-fixture-guard-before-core-initialize');
    await bootstrapStep('core-initialize', () => coreDataSource.initialize());
    checkpoint('after-core-initialize');
    const [coreReadonly] = await bootstrapStep('core-default-readonly', () =>
      coreDataSource.query('SHOW default_transaction_read_only'),
    );
    if (coreReadonly?.default_transaction_read_only !== 'on')
      throw new Error('Core connection is not read-only');
    installUpgradeAwareRepositoryProxy(coreDataSource);
    checkpoint('after-core-proxy-before-registry');
    const [{ INSTANCE_COMMANDS }, { WorkspaceCommandProviderModule }] =
      await bootstrapStep('upgrade-command-imports', () =>
        Promise.all([
          import('src/database/commands/upgrade-version-command/instance-commands.constant'),
          import('src/database/commands/upgrade-version-command/workspace-command-provider.module'),
        ]),
      );
    const registered = new Set<Function>(INSTANCE_COMMANDS);
    const modules: Function[] =
      Reflect.getMetadata('imports', WorkspaceCommandProviderModule) ?? [];
    for (const versionModule of modules) {
      const candidates: unknown[] =
        Reflect.getMetadata('providers', versionModule) ?? [];
      for (const candidate of candidates) {
        if (
          typeof candidate === 'function' &&
          (getRegisteredInstanceCommandMetadata(candidate) ||
            getRegisteredWorkspaceCommandMetadata(candidate))
        )
          registered.add(candidate);
      }
    }
    const registry = new UpgradeCommandRegistryService({
      getProviders: () =>
        [...registered].map((metatype) => ({
          metatype,
          instance: Object.create(metatype.prototype) as object,
        })),
    } as never);
    registry.onModuleInit();
    const sequenceReader = new UpgradeSequenceReaderService(registry);
    if (sequenceReader.getUpgradeSequence().length !== 240)
      throw new Error('Registered upgrade sequence changed');
    checkpoint('after-registry-before-core-cursor');
    const migrationService = new UpgradeMigrationService(
      coreDataSource.getRepository(UpgradeMigrationEntity),
    );
    const last = await bootstrapStep('core-upgrade-cursor', () =>
      migrationService.getLastAttemptedInstanceCommand(),
    );
    if (
      !last ||
      last.status !== 'completed' ||
      !sequenceReader
        .getUpgradeSequence()
        .some((step) => step.name === last.name)
    ) {
      throw new Error('Real upgrade cursor unavailable');
    }
    checkpoint('after-core-cursor-before-metadata-adapter');
    await bootstrapStep('metadata-adapter', () =>
      new UpgradeAwareEntityMetadataAdapter(
        coreDataSource,
        sequenceReader,
        migrationService,
      ).onModuleInit(),
    );
    checkpoint('after-metadata-adapter');
    const cfg = {
      get: (key: string) =>
        (
          ({
            PG_DATABASE_URL: raw,
            PG_DATABASE_REPLICA_URL: undefined,
            PG_SSL_ALLOW_SELF_SIGNED: false,
            PG_POOL_MAX_CONNECTIONS: 2,
            PG_DATABASE_PRIMARY_TIMEOUT_MS: 8_000,
            PG_POOL_IDLE_TIMEOUT_MS: 5000,
            PG_POOL_ALLOW_EXIT_ON_IDLE: true,
          }) as Record<string, unknown>
        )[key],
      getLoggingConfig: () => [],
    };
    // Process-local cache only; no Redis storage provider can issue writes.
    const localCache = new Map<string, unknown>();
    const cacheStorage = {
      mget: async (keys: string[]) => keys.map((key) => localCache.get(key)),
      mset: async (entries: { key: string; value: unknown }[]) => {
        for (const { key, value } of entries) localCache.set(key, value);
      },
      mdel: async () => {
        throw new Error('Cache delete refused');
      },
    };
    const isolatedEmitter = new EventEmitter2();
    const workspaceEmitter = new WorkspaceEventEmitter(isolatedEmitter);
    checkpoint('before-module-compile');
    const module = await bootstrapStep('module-compile', () =>
      Test.createTestingModule({
        imports: [DiscoveryModule],
        providers: [
          ...entities.map((entity) => ({
            provide: getRepositoryToken(entity),
            useValue: coreDataSource.getRepository(entity),
          })),
          ...entities.map((entity) => ({
            provide: getWorkspaceScopedRepositoryToken(entity),
            useValue: new WorkspaceScopedRepository(
              coreDataSource.getRepository(entity) as never,
            ),
          })),
          { provide: DataSource, useValue: coreDataSource },
          { provide: TwentyConfigService, useValue: cfg },
          { provide: WorkspaceEventEmitter, useValue: workspaceEmitter },
          {
            provide: CacheStorageNamespace.EngineWorkspace,
            useValue: cacheStorage,
          },
          {
            provide: MetricsService,
            useValue: { incrementCounterBy: () => undefined },
          },
          EntitySchemaColumnFactory,
          EntitySchemaRelationFactory,
          EntitySchemaFactory,
          WorkspaceCacheService,
          GlobalWorkspaceDataSourceService,
          GlobalWorkspaceOrmManager,
          ...cacheProviders,
        ],
      }).compile(),
    );
    try {
      checkpoint('after-module-compile-before-cache-init');
      await bootstrapStep('cache-initialize', () =>
        module.get(WorkspaceCacheService).onModuleInit(),
      );
      checkpoint('after-cache-init-before-workspace-datasource');
      const service = module.get(GlobalWorkspaceDataSourceService);
      await bootstrapStep('workspace-datasource-initialize', () =>
        service.onModuleInit(),
      );
      checkpoint('after-workspace-datasource-initialize');
      const dataSource = service.getGlobalWorkspaceDataSource();
      const [workspaceReadonly] = await bootstrapStep(
        'workspace-default-readonly',
        () =>
          dataSource.query(
            'SHOW default_transaction_read_only',
            [],
            undefined,
            { shouldBypassPermissionChecks: true },
          ),
      );
      if (workspaceReadonly?.default_transaction_read_only !== 'on')
        throw new Error('Workspace pool is not read-only');
      if (
        isolatedEmitter.eventNames().length ||
        isolatedEmitter.listenersAny().length ||
        isolatedEmitter.hasListeners()
      ) {
        throw new Error('Unexpected listener in private emitter');
      }
      checkpoint('after-workspace-pool-readonly-check');
      const orm = module.get(GlobalWorkspaceOrmManager);
      await bootstrapStep('workspace-callback', () =>
        onReady({
          workspaceId,
          rawUrl: raw,
          syntheticId,
          inspectionRunner: guardRunner,
          orm,
          dataSource,
          workspaceEmitter,
          isolatedEmitter,
        }),
      );
      checkpoint('after-workspace-callback-before-redis-check');
      if (
        (await bootstrapStep('redis-after-dbsize', () => redis.dbsize())) !== 0
      )
        throw new Error('Redis6 changed during timeline probe');
    } finally {
      checkpoint('before-module-close');
      await bootstrapStep('module-close', () => module.close());
      checkpoint('after-module-close');
    }
  } finally {
    try {
      if (inspectionRunner) {
        const runner = inspectionRunner;
        try {
          // BEGIN was issued directly, so TypeORM's isTransactionActive is
          // false even when PostgreSQL still holds the snapshot.
          if (inspectionConnected)
            await bootstrapStep('inspection-snapshot-rollback', () =>
              runner.query('ROLLBACK'),
            );
        } finally {
          await bootstrapStep('inspection-runner-release', () =>
            runner.release(),
          );
        }
      }
    } finally {
      try {
        if (inspection.isInitialized)
          await bootstrapStep('inspection-pool-destroy', () =>
            inspection.destroy(),
          );
      } finally {
        try {
          if (coreDataSource.isInitialized)
            await bootstrapStep('core-pool-destroy', () =>
              coreDataSource.destroy(),
            );
        } finally {
          redis.disconnect();
          checkpoint('after-pg-redis-cleanup');
        }
      }
    }
  }
}

(phase === 'ROLLBACK' ? it : it.skip)(
  'guards and rolls back native participant-linked activities',
  async () => {
    // The unit Jest config globally enables fake timers; use real timers for
    // network connection/timeout semantics before opening any connection.
    jest.useRealTimers();
    await rollbackStep('guard-and-workspace-bootstrap', () =>
      withGuardedReadOnlyBootstrap(
        'ROLLBACK',
        async ({
          workspaceId,
          syntheticId,
          rawUrl,
          orm,
          dataSource,
          workspaceEmitter,
          isolatedEmitter,
        }) => {
          await rollbackStep('workspace-context', () =>
            orm.executeInWorkspaceContext(async () => {
              const runner = dataSource.createQueryRunner();
              try {
                await rollbackStep('owned-runner-connect', () =>
                  runner.connect(),
                );
                await rollbackStep('owned-transaction-start', () =>
                  runner.startTransaction(),
                );
                await rollbackStep('owned-set-read-write', () =>
                  runner.query('SET TRANSACTION READ WRITE'),
                );
                const [mode] = await rollbackStep(
                  'owned-transaction-mode',
                  () => runner.query('SHOW transaction_read_only'),
                );
                if (mode?.transaction_read_only !== 'off')
                  throw new Error('Owned transaction not writable');
                const personId = randomUUID();
                const calendarId = randomUUID();
                const email = `timeline-${syntheticId}@example.test`;
                const personRepo = await rollbackStep('person-repository', () =>
                  orm.getRepository(workspaceId, 'person', {
                    shouldBypassPermissionChecks: true,
                  }),
                );
                const messageRepo = await rollbackStep(
                  'message-repository',
                  () => orm.getRepository(workspaceId, 'message'),
                );
                const calendarRepo = await rollbackStep(
                  'calendar-repository',
                  () => orm.getRepository(workspaceId, 'calendarEvent'),
                );
                const messageParticipantRepo = await rollbackStep(
                  'message-participant-repository',
                  () =>
                    orm.getRepository<MessageParticipantWorkspaceEntity>(
                      workspaceId,
                      'messageParticipant',
                    ),
                );
                const calendarParticipantRepo = await rollbackStep(
                  'calendar-participant-repository',
                  () =>
                    orm.getRepository<CalendarEventParticipantWorkspaceEntity>(
                      workspaceId,
                      'calendarEventParticipant',
                    ),
                );
                await rollbackStep('person-insert', () =>
                  personRepo.insert(
                    {
                      id: personId,
                      emails: { primaryEmail: email, additionalEmails: [] },
                    },
                    runner.manager,
                  ),
                );
                await rollbackStep('message-insert', () =>
                  messageRepo.insert(
                    {
                      id: syntheticId,
                      headerMessageId: `<${syntheticId}@example.test>`,
                    },
                    runner.manager,
                  ),
                );
                await rollbackStep('calendar-insert', () =>
                  calendarRepo.insert(
                    { id: calendarId, title: 'Synthetic timeline rollback' },
                    runner.manager,
                  ),
                );
                const messageParticipant = (
                  await rollbackStep('message-participant-insert', () =>
                    messageParticipantRepo.insert(
                      {
                        messageId: syntheticId,
                        handle: email,
                        role: MessageParticipantRole.FROM,
                      },
                      runner.manager,
                    ),
                  )
                ).raw[0];
                const calendarParticipant = (
                  await rollbackStep('calendar-participant-insert', () =>
                    calendarParticipantRepo.insert(
                      { calendarEventId: calendarId, handle: email },
                      runner.manager,
                    ),
                  )
                ).raw[0];
                const matcher = new MatchParticipantService(
                  workspaceEmitter,
                  orm,
                );
                await rollbackStep('message-projection', () =>
                  matcher.matchParticipants({
                    participants: [messageParticipant],
                    objectMetadataName: 'messageParticipant',
                    matchWith: 'personOnly',
                    workspaceId,
                    transactionManager: runner.manager,
                  }),
                );
                await rollbackStep('calendar-projection', () =>
                  matcher.matchParticipants({
                    participants: [calendarParticipant],
                    objectMetadataName: 'calendarEventParticipant',
                    matchWith: 'personOnly',
                    workspaceId,
                    transactionManager: runner.manager,
                  }),
                );
                const activityRepo = await rollbackStep(
                  'activity-repository',
                  () => orm.getRepository(workspaceId, 'timelineActivity'),
                );
                const activities = await rollbackStep(
                  'owned-activity-read',
                  () =>
                    activityRepo.find(
                      { where: { targetPersonId: personId } },
                      runner.manager,
                    ),
                );
                if (
                  activities.length !== 2 ||
                  !activities.some(
                    (row) =>
                      row.name === 'message.linked' &&
                      row.linkedRecordId === syntheticId,
                  ) ||
                  !activities.some(
                    (row) =>
                      row.name === 'calendarEvent.linked' &&
                      row.linkedRecordId === calendarId,
                  )
                ) {
                  throw new Error(
                    'Native timeline projection missing in owned transaction',
                  );
                }
                // A fresh connection opened after the writes must NOT see
                // uncommitted activity. Never reuse the pinned guard snapshot.
                const separate = await rollbackStep(
                  'uncommitted-visibility',
                  () =>
                    freshReadOnlyActivityCount(rawUrl, personId, 'uncommitted'),
                );
                if (separate !== 0)
                  throw new Error(
                    'Uncommitted timeline visible to another connection',
                  );
                if (
                  isolatedEmitter.eventNames().length ||
                  isolatedEmitter.listenersAny().length
                )
                  throw new Error('Custom event listener invoked');
                await rollbackStep('owned-rollback', () =>
                  runner.rollbackTransaction(),
                );
                // Another independent read-only connection begins AFTER
                // rollback. An accidental COMMIT is now observable as >0.
                const after = await rollbackStep(
                  'post-rollback-visibility',
                  () =>
                    freshReadOnlyActivityCount(
                      rawUrl,
                      personId,
                      'post-rollback',
                    ),
                );
                if (after !== 0) throw new Error('Timeline survived rollback');
              } finally {
                try {
                  if (runner.isTransactionActive)
                    await rollbackStep('owned-finally-rollback', () =>
                      runner.rollbackTransaction(),
                    );
                } finally {
                  await rollbackStep('owned-runner-release', () =>
                    runner.release(),
                  );
                }
              }
            }, buildSystemAuthContext(workspaceId)),
          );
        },
      ),
    );
  },
  120_000,
);

(phase === 'READ_ONLY_DIAGNOSTIC' ? it : it.skip)(
  'diagnoses read-only timeline bootstrap without any mutation path',
  async () => {
    jest.useRealTimers();
    await withGuardedReadOnlyBootstrap(
      'READ_ONLY_DIAGNOSTIC',
      async ({ workspaceId, orm }) => {
        stage('before-workspace-context');
        await orm.executeInWorkspaceContext(async () => {
          stage('after-workspace-context');
          stage('before-participant-repository-read');
          const participants = await orm.getRepository(
            workspaceId,
            'messageParticipant',
          );
          await participants.find({ take: 1 });
          stage('after-participant-repository-read');
          stage('before-timeline-repository-read');
          const timeline = await orm.getRepository(
            workspaceId,
            'timelineActivity',
          );
          await timeline.find({ take: 1 });
          stage('after-timeline-repository-read');
        }, buildSystemAuthContext(workspaceId));
        stage('after-workspace-context-cleanup');
      },
    );
  },
  60_000,
);
