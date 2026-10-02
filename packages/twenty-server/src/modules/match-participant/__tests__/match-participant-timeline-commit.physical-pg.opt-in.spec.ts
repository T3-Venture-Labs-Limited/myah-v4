import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';

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
import { projectParticipantLinkedTimelineActivities } from 'src/modules/timeline/repositories/timeline-activity.repository';
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
  '/home/superdao/.local/share/myah-scratch/myah334-frontier-20260928/timeline-commit.env';
const fixturePath =
  '/home/superdao/.local/share/myah-scratch/myah334-frontier-20260928/evidence/myah334-timeline-commit-ids.json';
const fixtureHash =
  '85bcf44b48bab58ed51c8e0448c8fd805f2bf336ab8b1233ff4c0b779710ed8b';
type Fixture = {
  personId: string;
  messageId: string;
  calendarId: string;
  messageParticipantId: string;
  calendarParticipantId: string;
  sourceHandle: string;
};
const loadFixture = (): Fixture => {
  if ((statSync(fixturePath).mode & 0o777) !== 0o600)
    throw new Error('Refusing timeline commit: fixture mode changed');
  const bytes = readFileSync(fixturePath);
  if (createHash('sha256').update(bytes).digest('hex') !== fixtureHash)
    throw new Error('Refusing timeline commit: fixture hash changed');
  const parsed: Fixture = JSON.parse(bytes.toString('utf8'));
  const ids = [
    parsed.personId,
    parsed.messageId,
    parsed.calendarId,
    parsed.messageParticipantId,
    parsed.calendarParticipantId,
  ];
  if (
    new Set(ids).size !== 5 ||
    ids.some(
      (id) =>
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
          id,
        ),
    ) ||
    !/^timeline-commit-[0-9a-f]{32}@example\.test$/.test(parsed.sourceHandle)
  )
    throw new Error('Refusing timeline commit: invalid synthetic fixture');
  return parsed;
};
const database = 'myah334_timeline_commit_20260928';
const marker = 'MYAH334_TIMELINE_COMMIT_20260928_TASK_OWNED';
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
  fixture: Fixture;
  inspectionRunner: QueryRunner;
  orm: GlobalWorkspaceOrmManager;
  dataSource: GlobalWorkspaceDataSource;
  workspaceEmitter: WorkspaceEventEmitter;
  isolatedEmitter: EventEmitter2;
};

// stderr, unlike console.*, remains visible under the unit Jest config's silent:true.
// Fixed stage labels only: never print URLs, SQL, identifiers, or result payloads.
const stage = (token: string): void => {
  process.stderr.write(`[myah334-timeline-commit] ${token}\n`);
};

const commitStep = async <T>(
  token: string,
  operation: () => Promise<T>,
): Promise<T> => {
  stage(`commit-before-${token}`);
  try {
    const result = await operation();
    stage(`commit-after-${token}`);
    return result;
  } catch (error) {
    stage(`commit-failed-${token}`);
    throw error;
  }
};

// Every post-COMMIT read opens a new pool and independent READ ONLY snapshot.
async function freshReadback(url: string, fixture: Fixture) {
  const fresh = new DataSource({
    type: 'postgres',
    url,
    poolSize: 1,
    connectTimeoutMS: 5_000,
    extra: { connectionTimeoutMillis: 5_000, query_timeout: 8_000 },
  });
  let runner: QueryRunner | undefined;
  let connected = false;
  try {
    await commitStep('readback-pool-initialize', () => fresh.initialize());
    runner = fresh.createQueryRunner();
    const read = runner;
    await commitStep('readback-connect', () => read.connect());
    connected = true;
    const [connectionMode] = await read.query(
      'SHOW default_transaction_read_only',
    );
    if (connectionMode?.default_transaction_read_only !== 'on')
      throw new Error('Independent readback connection not read-only');
    await commitStep('readback-begin', () =>
      read.query('BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY'),
    );
    const [mode] = await read.query('SHOW transaction_read_only');
    if (mode?.transaction_read_only !== 'on')
      throw new Error('Independent readback transaction not read-only');
    const activities = await commitStep('readback-activities', () =>
      read.query(
        `SELECT "id", "name", "targetPersonId", "linkedRecordId", "linkedObjectMetadataId"
       FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."timelineActivity"
       WHERE "targetPersonId"=$1 ORDER BY "name"`,
        [fixture.personId],
      ),
    );
    const [participants] = await commitStep('readback-participants', () =>
      read.query(
        `SELECT
       (SELECT "personId" FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."messageParticipant" WHERE "id"=$1) message_person,
       (SELECT "personId" FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."calendarEventParticipant" WHERE "id"=$2) calendar_person`,
        [fixture.messageParticipantId, fixture.calendarParticipantId],
      ),
    );
    return { activities, participants };
  } finally {
    try {
      if (runner) {
        const read = runner;
        try {
          if (connected)
            await commitStep('readback-rollback', () => read.query('ROLLBACK'));
        } finally {
          await commitStep('readback-release', () => read.release());
        }
      }
    } finally {
      if (fresh.isInitialized)
        await commitStep('readback-destroy', () => fresh.destroy());
    }
  }
}

async function withGuardedReadOnlyBootstrap(
  mode: 'COMMIT',
  onReady: (context: BootstrapContext) => Promise<void>,
): Promise<void> {
  const checkpoint = (token: string): void => stage(`commit-${token}`);
  const bootstrapStep = <T>(
    token: string,
    operation: () => Promise<T>,
  ): Promise<T> => commitStep(`bootstrap-${token}`, operation);
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
    redisUrl.pathname !== '/7' ||
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
  const fixture = loadFixture();
  try {
    checkpoint('before-redis-connect');
    await bootstrapStep('redis-connect', () => redis.connect());
    if (
      (await bootstrapStep('redis-preflight-dbsize', () => redis.dbsize())) !==
      0
    )
      throw new Error('Refusing timeline physical test: Redis7 is not empty');
    checkpoint('after-redis-dbsize');
    // Set before initializing ANY PG pool. The server enforces read-only
    // from first connect, independently of client-side transaction intent.
    process.env.PGOPTIONS =
      '-c default_transaction_read_only=on -c statement_timeout=8000 -c lock_timeout=2000 -c idle_in_transaction_session_timeout=15000 -c application_name=myah334_timeline_commit_probe';
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
      (SELECT count(*)::integer FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."person" WHERE "id"=$1 OR "emailsPrimaryEmail"=$6) people,
      (SELECT count(*)::integer FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."message" WHERE "id"=$2) messages,
      (SELECT count(*)::integer FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."calendarEvent" WHERE "id"=$3) events,
      (SELECT count(*)::integer FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."messageParticipant" WHERE "id"=$4 OR "handle"=$6) message_participants,
      (SELECT count(*)::integer FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."calendarEventParticipant" WHERE "id"=$5 OR "handle"=$6) calendar_participants,
      (SELECT count(*)::integer FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."timelineActivity" WHERE "targetPersonId"=$1 OR "linkedRecordId" IN ($2,$3)) activities`,
        [
          fixture.personId,
          fixture.messageId,
          fixture.calendarId,
          fixture.messageParticipantId,
          fixture.calendarParticipantId,
          fixture.sourceHandle,
        ],
      ),
    );
    if (Object.values(fresh).some((count) => count !== 0))
      throw new Error(
        'Refusing timeline physical test: synthetic identity exists',
      );
    const [idle] = await bootstrapStep('inspection-exclusive-target', () =>
      guardRunner.query(
        `SELECT count(*)::integer other_sessions FROM pg_stat_activity
       WHERE datname=current_database() AND pid <> pg_backend_pid()`,
      ),
    );
    const [locks] = await bootstrapStep('inspection-other-locks', () =>
      guardRunner.query(
        `SELECT count(*)::integer other_locks FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid
       WHERE a.datname=current_database() AND a.pid <> pg_backend_pid()`,
      ),
    );
    if (idle?.other_sessions !== 0 || locks?.other_locks !== 0)
      throw new Error(
        'Refusing timeline commit: target has other sessions or locks',
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
          fixture,
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
        throw new Error('Redis7 changed during timeline probe');
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

// A completed first COMMIT makes this fixture permanently ineligible for a
// second first-write attempt. Never run this under Jest retries or watch mode.
(phase === 'COMMIT' ? it : it.skip)(
  'commits native Person-linked Message and Calendar activities and replays their natural keys',
  async () => {
    jest.useRealTimers();
    try {
      await commitStep('guard-and-workspace-bootstrap', () =>
        withGuardedReadOnlyBootstrap(
          'COMMIT',
          async ({
            workspaceId,
            fixture,
            rawUrl,
            orm,
            dataSource,
            workspaceEmitter,
            isolatedEmitter,
          }) => {
            await commitStep('workspace-context', () =>
              orm.executeInWorkspaceContext(async () => {
                const runner = dataSource.createQueryRunner();
                let commitAttempted = false;
                try {
                  await commitStep('owned-runner-connect', () =>
                    runner.connect(),
                  );
                  await commitStep('owned-transaction-start', () =>
                    runner.startTransaction(),
                  );
                  await commitStep('owned-set-read-write', () =>
                    runner.query('SET TRANSACTION READ WRITE'),
                  );
                  const [mode] = await runner.query(
                    'SHOW transaction_read_only',
                  );
                  if (mode?.transaction_read_only !== 'off')
                    throw new Error('Owned transaction is not writable');
                  const personRepo = await orm.getRepository(
                    workspaceId,
                    'person',
                    {
                      shouldBypassPermissionChecks: true, // ONLY the synthetic Person seed.
                    },
                  );
                  const messageRepo = await orm.getRepository(
                    workspaceId,
                    'message',
                  );
                  const calendarRepo = await orm.getRepository(
                    workspaceId,
                    'calendarEvent',
                  );
                  const messageParticipantRepo =
                    await orm.getRepository<MessageParticipantWorkspaceEntity>(
                      workspaceId,
                      'messageParticipant',
                    );
                  const calendarParticipantRepo =
                    await orm.getRepository<CalendarEventParticipantWorkspaceEntity>(
                      workspaceId,
                      'calendarEventParticipant',
                    );
                  const activityRepo = await orm.getRepository(
                    workspaceId,
                    'timelineActivity',
                  );
                  await commitStep('person-insert', () =>
                    personRepo.insert(
                      {
                        id: fixture.personId,
                        emails: {
                          primaryEmail: fixture.sourceHandle,
                          additionalEmails: [],
                        },
                      },
                      runner.manager,
                    ),
                  );
                  await commitStep('message-insert', () =>
                    messageRepo.insert(
                      {
                        id: fixture.messageId,
                        headerMessageId: `<${fixture.messageId}@example.test>`,
                      },
                      runner.manager,
                    ),
                  );
                  await commitStep('calendar-insert', () =>
                    calendarRepo.insert(
                      {
                        id: fixture.calendarId,
                        title: 'Synthetic timeline commit',
                      },
                      runner.manager,
                    ),
                  );
                  const messageParticipant = (
                    await commitStep('message-participant-insert', () =>
                      messageParticipantRepo.insert(
                        {
                          id: fixture.messageParticipantId,
                          messageId: fixture.messageId,
                          handle: fixture.sourceHandle,
                          role: MessageParticipantRole.FROM,
                        },
                        runner.manager,
                      ),
                    )
                  ).raw[0];
                  const calendarParticipant = (
                    await commitStep('calendar-participant-insert', () =>
                      calendarParticipantRepo.insert(
                        {
                          id: fixture.calendarParticipantId,
                          calendarEventId: fixture.calendarId,
                          handle: fixture.sourceHandle,
                        },
                        runner.manager,
                      ),
                    )
                  ).raw[0];
                  const matcher = new MatchParticipantService(
                    workspaceEmitter,
                    orm,
                  );
                  await commitStep('message-projection', () =>
                    matcher.matchParticipants({
                      participants: [messageParticipant],
                      objectMetadataName: 'messageParticipant',
                      matchWith: 'personOnly',
                      workspaceId,
                      transactionManager: runner.manager,
                    }),
                  );
                  await commitStep('calendar-projection', () =>
                    matcher.matchParticipants({
                      participants: [calendarParticipant],
                      objectMetadataName: 'calendarEventParticipant',
                      matchWith: 'personOnly',
                      workspaceId,
                      transactionManager: runner.manager,
                    }),
                  );
                  const activities = await commitStep(
                    'owned-activity-read',
                    () =>
                      activityRepo.find(
                        {
                          where: { targetPersonId: fixture.personId },
                        },
                        runner.manager,
                      ),
                  );
                  const expected = [
                    [
                      'message.linked',
                      fixture.messageId,
                      runner.manager.internalContext.objectIdByNameSingular
                        .message,
                    ],
                    [
                      'calendarEvent.linked',
                      fixture.calendarId,
                      runner.manager.internalContext.objectIdByNameSingular
                        .calendarEvent,
                    ],
                  ];
                  if (
                    activities.length !== 2 ||
                    new Set(activities.map((row) => row.id)).size !== 2 ||
                    expected.some(
                      ([name, linkedRecordId, linkedObjectMetadataId]) =>
                        !linkedObjectMetadataId ||
                        !activities.some(
                          (row) =>
                            row.name === name &&
                            row.linkedRecordId === linkedRecordId &&
                            row.linkedObjectMetadataId ===
                              linkedObjectMetadataId,
                        ),
                    )
                  )
                    throw new Error(
                      'Missing distinct native Person-linked activities before commit',
                    );
                  const [linkedMessage] = await messageParticipantRepo.find(
                    { where: { id: fixture.messageParticipantId } },
                    runner.manager,
                  );
                  const [linkedCalendar] = await calendarParticipantRepo.find(
                    { where: { id: fixture.calendarParticipantId } },
                    runner.manager,
                  );
                  if (
                    linkedMessage?.personId !== fixture.personId ||
                    linkedCalendar?.personId !== fixture.personId
                  )
                    throw new Error(
                      'Native participant associations missing before commit',
                    );
                  if (
                    isolatedEmitter.eventNames().length ||
                    isolatedEmitter.listenersAny().length
                  )
                    throw new Error('Unexpected emitter listener');
                  // This is an irreversible boundary; its error is UNKNOWN, not rollback proof.
                  commitAttempted = true;
                  await commitStep('first-commit', () =>
                    runner.commitTransaction(),
                  );
                  stage('commit-first-confirmed');
                  const first = await commitStep(
                    'first-independent-readback',
                    () => freshReadback(rawUrl, fixture),
                  );
                  if (
                    first.activities.length !== 2 ||
                    first.participants?.message_person !== fixture.personId ||
                    first.participants?.calendar_person !== fixture.personId ||
                    expected.some(
                      ([name, linkedRecordId, linkedObjectMetadataId]) =>
                        !first.activities.some(
                          (row: {
                            id: string;
                            name: string;
                            targetPersonId: string;
                            linkedRecordId: string;
                            linkedObjectMetadataId: string;
                          }) =>
                            row.id ===
                              activities.find((owned) => owned.name === name)
                                ?.id &&
                            row.name === name &&
                            row.targetPersonId === fixture.personId &&
                            row.linkedRecordId === linkedRecordId &&
                            row.linkedObjectMetadataId ===
                              linkedObjectMetadataId,
                        ),
                    )
                  )
                    throw new Error(
                      'First COMMIT readback mismatch: STOP before replay',
                    );
                  stage('commit-first-readback-confirmed');
                  // Replay is permitted only after an independent committed readback.
                  await commitStep('replay-transaction-start', () =>
                    runner.startTransaction(),
                  );
                  await commitStep('replay-set-read-write', () =>
                    runner.query('SET TRANSACTION READ WRITE'),
                  );
                  const [replayMode] = await runner.query(
                    'SHOW transaction_read_only',
                  );
                  if (replayMode?.transaction_read_only !== 'off')
                    throw new Error('Replay transaction is not writable');
                  const [committedMessage] = await messageParticipantRepo.find(
                    { where: { id: fixture.messageParticipantId } },
                    runner.manager,
                  );
                  const [committedCalendar] =
                    await calendarParticipantRepo.find(
                      { where: { id: fixture.calendarParticipantId } },
                      runner.manager,
                    );
                  if (
                    !committedMessage ||
                    !committedCalendar ||
                    committedMessage.personId !== fixture.personId ||
                    committedCalendar.personId !== fixture.personId
                  )
                    throw new Error(
                      'Committed participants unavailable for replay',
                    );
                  await commitStep('replay-message-matcher', () =>
                    matcher.matchParticipants({
                      participants: [committedMessage],
                      objectMetadataName: 'messageParticipant',
                      matchWith: 'personOnly',
                      workspaceId,
                      transactionManager: runner.manager,
                    }),
                  );
                  await commitStep('replay-calendar-matcher', () =>
                    matcher.matchParticipants({
                      participants: [committedCalendar],
                      objectMetadataName: 'calendarEventParticipant',
                      matchWith: 'personOnly',
                      workspaceId,
                      transactionManager: runner.manager,
                    }),
                  );
                  // The matcher correctly short-circuits unchanged participants;
                  // also exercise the projector's existing natural-key lookup.
                  for (const [objectName, recordId] of [
                    ['message', fixture.messageId],
                    ['calendarEvent', fixture.calendarId],
                  ] as const) {
                    await commitStep(`replay-${objectName}-natural-key`, () =>
                      projectParticipantLinkedTimelineActivities({
                        globalWorkspaceOrmManager: orm,
                        transactionManager: runner.manager,
                        workspaceId,
                        objectName,
                        links: [{ personId: fixture.personId, recordId }],
                      }),
                    );
                  }
                  const replayRows = await activityRepo.find(
                    { where: { targetPersonId: fixture.personId } },
                    runner.manager,
                  );
                  if (
                    replayRows.length !== 2 ||
                    replayRows.some(
                      (row) =>
                        !first.activities.some(
                          (original: { id: string }) => original.id === row.id,
                        ),
                    )
                  )
                    throw new Error(
                      'Replay changed activity IDs or count before COMMIT',
                    );
                  // Replay commit also has UNKNOWN-response semantics.
                  await commitStep('replay-commit', () =>
                    runner.commitTransaction(),
                  );
                  stage('commit-replay-confirmed');
                  const after = await commitStep(
                    'replay-independent-readback',
                    () => freshReadback(rawUrl, fixture),
                  );
                  if (
                    after.activities.length !== 2 ||
                    after.participants?.message_person !== fixture.personId ||
                    after.participants?.calendar_person !== fixture.personId ||
                    JSON.stringify(after.activities) !==
                      JSON.stringify(first.activities)
                  )
                    throw new Error(
                      'Replay COMMIT readback mismatch: reconcile without retry',
                    );
                  stage('commit-replay-readback-confirmed');
                } catch (error) {
                  if (commitAttempted)
                    stage(
                      'commit-uncertain-or-postcommit-failure-stop-readonly-reconcile',
                    );
                  throw error;
                } finally {
                  try {
                    if (runner.isTransactionActive)
                      await commitStep('owned-finally-rollback', () =>
                        runner.rollbackTransaction(),
                      );
                  } finally {
                    await commitStep('owned-runner-release', () =>
                      runner.release(),
                    );
                  }
                }
              }, buildSystemAuthContext(workspaceId)),
            );
          },
        ),
      );
    } catch {
      // Jest must not echo SQL, URL, fixture IDs or provider payloads.
      throw new Error(
        'Timeline commit stopped: reconcile privately by fixture IDs before any retry',
      );
    }
  },
  120_000,
);
