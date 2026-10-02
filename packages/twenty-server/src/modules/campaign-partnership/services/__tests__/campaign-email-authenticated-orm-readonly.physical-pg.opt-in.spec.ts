import { ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DiscoveryModule } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { UpgradeCommandRegistryService } from 'src/engine/core-modules/upgrade/services/upgrade-command-registry.service';
import { UpgradeMigrationService } from 'src/engine/core-modules/upgrade/services/upgrade-migration.service';
import { UpgradeSequenceReaderService } from 'src/engine/core-modules/upgrade/services/upgrade-sequence-reader.service';
import { UpgradeMigrationEntity } from 'src/engine/core-modules/upgrade/upgrade-migration.entity';
import { UpgradeAwareEntityMetadataAdapter } from 'src/engine/twenty-orm/upgrade-aware/upgrade-aware-entity-metadata.adapter';
import { installUpgradeAwareRepositoryProxy } from 'src/engine/twenty-orm/upgrade-aware/install-upgrade-aware-repository-proxy';
import { getRegisteredInstanceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { getRegisteredWorkspaceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';

import { connectionSource } from 'src/database/typeorm/core/core.datasource';
import { rawDataSource } from 'src/database/typeorm/raw/raw.datasource';
import { CacheStorageNamespace } from 'src/engine/core-modules/cache-storage/types/cache-storage-namespace.enum';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { MetricsService } from 'src/engine/core-modules/metrics/metrics.service';
import { type UserWorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
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
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { resolveRolePermissionConfig } from 'src/engine/twenty-orm/utils/resolve-role-permission-config.util';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { WorkspaceEventEmitter } from 'src/engine/workspace-event-emitter/workspace-event-emitter';
import { CampaignEmailReplyWorkBoundaryService } from 'src/modules/campaign-partnership/services/campaign-email-reply-work-boundary.service';
import { CampaignEmailReplyWorkReviewService } from 'src/modules/campaign-partnership/services/campaign-email-reply-work-review.service';

const enabled = process.env.MYAH334_AUTH_ORM_READONLY_OPT_IN === '1';
const root =
  '/home/superdao/myah-v4/.worktrees/daryll/myah-392-manage-creator-partnerships-from-reply-through-fulfillment';
const selector =
  '/home/superdao/.local/share/myah-scratch/myah334-frontier-20260928/collision-clean.env';
const dbName = 'myah334_collision_clean_20260928';
const marker = 'MYAH334_COLLISION_CLEAN_20260928_TASK_OWNED';
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
const providers = [
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

(enabled ? it : it.skip)(
  'loads seeded admin via real ORM cache and permissioned repositories, read-only',
  async () => {
    jest.useRealTimers();
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
      process.env.TWENTY_SERVER_INTEGRATION_ENV_FILE !== selector ||
      process.env.NODE_ENV !== 'test' ||
      !process.argv.some((arg) => arg.includes('jest')) ||
      ![root, `${root}/packages/twenty-server`].includes(process.cwd())
    )
      throw new Error(
        'Refusing ORM smoke: compiled raw/core/selector/Jest process mismatch',
      );
    const pg = new URL(raw);
    const redis = new URL(process.env.REDIS_URL ?? '');
    if (
      pg.protocol !== 'postgres:' ||
      pg.hostname !== '127.0.0.1' ||
      pg.port !== '32788' ||
      pg.pathname !== `/${dbName}` ||
      pg.search ||
      pg.hash ||
      redis.protocol !== 'redis:' ||
      redis.hostname !== '127.0.0.1' ||
      redis.port !== '32789' ||
      redis.pathname !== '/5' ||
      redis.search ||
      redis.hash ||
      (process.env.REDIS_QUEUE_URL &&
        process.env.REDIS_QUEUE_URL !== process.env.REDIS_URL)
    )
      throw new Error('Refusing ORM smoke: exact PG/Redis target mismatch');
    const inspection = new DataSource({ type: 'postgres', url: raw });
    try {
      await inspection.initialize();
      await inspection.query('BEGIN READ ONLY');
      const [identity] =
        await inspection.query(`SELECT current_database() db, shobj_description(oid,'pg_database') marker,
      current_setting('server_version_num') version FROM pg_database WHERE datname=current_database()`);
      if (
        identity?.db !== dbName ||
        identity.marker !== marker ||
        !String(identity.version).startsWith('16')
      )
        throw new Error(
          'Refusing ORM smoke: PG16 shared-object marker mismatch',
        );
      const [before] = await inspection.query(`SELECT
      (SELECT count(*)::integer FROM core."upgradeMigration") receipts,
      (SELECT count(*)::integer FROM core."upgradeMigration" WHERE "status" <> 'completed') failed,
      (SELECT count(*)::integer FROM core."campaignPartnershipWorkItem") work,
      (SELECT count(*)::integer FROM core."campaignEmailWorkCollision") collision,
      (SELECT count(*)::integer FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname IN ('core','public') OR n.nspname LIKE 'workspace_%') objects`);
      if (
        before.receipts !== 143 ||
        before.failed !== 0 ||
        before.work !== 1 ||
        before.collision !== 1 ||
        before.objects !== 673
      )
        throw new Error(
          'Refusing ORM smoke: native fixture prerequisite changed',
        );
      const [workspace] = await inspection.query(
        'SELECT "id" FROM core."workspace"',
      );
      if (!workspace?.id)
        throw new Error('Refusing ORM smoke: one seeded workspace required');
      const schema = getWorkspaceSchemaName(workspace.id);
      if (schema !== 'workspace_1wgvd1injqtife6y4rvfbu3h5')
        throw new Error('Refusing ORM smoke: seeded schema identity mismatch');
      const [admin] = await inspection.query(
        `SELECT uw.id "userWorkspaceId",uw."userId",
      wm.id "workspaceMemberId",wm."userId" "memberUserId",rt."roleId"
      FROM core."userWorkspace" uw JOIN core."roleTarget" rt ON rt."userWorkspaceId"=uw.id
      JOIN core.role r ON r.id=rt."roleId" AND r.label='Admin'
      JOIN "workspace_1wgvd1injqtife6y4rvfbu3h5"."workspaceMember" wm ON wm."userId"=uw."userId"
      WHERE uw."workspaceId"=$1 AND wm."deletedAt" IS NULL LIMIT 1`,
        [workspace.id],
      );
      if (!admin?.userId || admin.memberUserId !== admin.userId)
        throw new Error(
          'Refusing ORM smoke: real seeded admin/member relation unavailable',
        );
      const [collisionSource] = await inspection.query(
        `SELECT w."id" "workItemId", w."messageThreadId" "threadId",
          w."state", w."reason", w."contextGeneration",
          c."id" "collisionId", c."originalWorkId" "originalWorkItemId"
         FROM core."campaignPartnershipWorkItem" w
         JOIN core."campaignEmailWorkCollision" c
           ON c."originalWorkId"=w."id" AND c."workspaceId"=w."workspaceId"
           AND c."messageThreadId"=w."messageThreadId"
         WHERE w."workspaceId"=$1 AND w."providerMessageId" IS NOT NULL`,
        [workspace.id],
      );
      if (
        !collisionSource?.workItemId ||
        !collisionSource.threadId ||
        !collisionSource.collisionId ||
        collisionSource.originalWorkItemId !== collisionSource.workItemId ||
        collisionSource.state !== 'HELD' ||
        collisionSource.reason !== 'PROVIDER_ID_COLLISION' ||
        collisionSource.contextGeneration !== 1
      )
        throw new Error(
          'Refusing Inbox smoke: original collision route changed',
        );
      const authContext: UserWorkspaceAuthContext = {
        type: 'user',
        workspace: {
          id: workspace.id,
        } as UserWorkspaceAuthContext['workspace'],
        userWorkspaceId: admin.userWorkspaceId,
        workspaceMemberId: admin.workspaceMemberId,
        user: { id: admin.userId } as UserWorkspaceAuthContext['user'],
        workspaceMember: {
          id: admin.workspaceMemberId,
          userId: admin.userId,
        } as UserWorkspaceAuthContext['workspaceMember'],
      };
      await inspection.query('ROLLBACK');
      // No production cache backend: real WorkspaceCacheService and real providers
      // recompute from marked DB, while cache I/O is memory-only and cannot write Redis.
      const cacheOps = { reads: 0, writes: 0 };
      const cacheStorage = {
        mget: async (keys: string[]) => {
          cacheOps.reads += keys.length;
          return keys.map(() => undefined);
        },
        mset: async (_entries: unknown[]) => {
          cacheOps.writes++;
        },
        mdel: async () => {
          throw new Error('Read-only harness cache delete refused');
        },
      };
      const cfg = {
        get: (key: string) =>
          (
            ({
              PG_DATABASE_URL: raw,
              PG_DATABASE_REPLICA_URL: undefined,
              PG_SSL_ALLOW_SELF_SIGNED: false,
              PG_POOL_MAX_CONNECTIONS: 2,
              PG_DATABASE_PRIMARY_TIMEOUT_MS: 10000,
              PG_POOL_IDLE_TIMEOUT_MS: 5000,
              PG_POOL_ALLOW_EXIT_ON_IDLE: true,
            }) as Record<string, unknown>
          )[key],
        getLoggingConfig: () => [],
      };
      // This direct small module excludes AppModule, connector transports, cron,
      // queues and all production cache/Redis modules. It registers actual cache
      // provider classes and TypeORM repositories (not fabricated role maps).
      // Even an unexpected query from a provider cannot write through these PG sessions.
      process.env.PGOPTIONS = '-c default_transaction_read_only=on';
      await connectionSource.initialize();
      const [coreReadonly] = await connectionSource.query(
        'SHOW default_transaction_read_only',
      );
      if (coreReadonly?.default_transaction_read_only !== 'on')
        throw new Error(
          'Refusing ORM smoke: core connection is not server-side read-only',
        );
      // Production core initialization installs this proxy before any repository
      // access. Derive registry discovery ONLY from the actual registered class
      // providers; no command constructors, up()/run(), app module or cron runs.
      installUpgradeAwareRepositoryProxy(connectionSource);
      const [{ INSTANCE_COMMANDS }, { WorkspaceCommandProviderModule }] =
        await Promise.all([
          import('src/database/commands/upgrade-version-command/instance-commands.constant'),
          import('src/database/commands/upgrade-version-command/workspace-command-provider.module'),
        ]);
      const versionModules: Function[] =
        Reflect.getMetadata('imports', WorkspaceCommandProviderModule) ?? [];
      const registeredClasses = new Set<Function>(INSTANCE_COMMANDS);
      for (const versionModule of versionModules) {
        const versionProviders: unknown[] =
          Reflect.getMetadata('providers', versionModule) ?? [];
        for (const candidate of versionProviders) {
          if (
            typeof candidate === 'function' &&
            (getRegisteredInstanceCommandMetadata(candidate) ||
              getRegisteredWorkspaceCommandMetadata(candidate))
          )
            registeredClasses.add(candidate);
        }
      }
      // Inert prototypes carry the real class name and decorator metadata to
      // the real production registry. Discovery is the only test seam; its
      // sequence and cursor are never authored by the harness.
      const discovery = {
        getProviders: () =>
          [...registeredClasses].map((metatype) => ({
            metatype,
            instance: Object.create(metatype.prototype) as object,
          })),
      };
      const registry = new UpgradeCommandRegistryService(discovery as never);
      registry.onModuleInit();
      const sequenceReader = new UpgradeSequenceReaderService(registry);
      const sequence = sequenceReader.getUpgradeSequence();
      if (sequence.length !== 240)
        throw new Error(
          `Refusing ORM smoke: registered sequence length ${sequence.length} != 240`,
        );
      const migrationService = new UpgradeMigrationService(
        connectionSource.getRepository(UpgradeMigrationEntity),
      );
      const latest = await migrationService.getLastAttemptedInstanceCommand();
      if (
        !latest ||
        latest.status !== 'completed' ||
        !sequence.some((step) => step.name === latest.name)
      )
        throw new Error(
          'Refusing ORM smoke: genuine instance receipt cursor absent from real sequence',
        );
      const metadataAdapter = new UpgradeAwareEntityMetadataAdapter(
        connectionSource,
        sequenceReader,
        migrationService,
      );
      await metadataAdapter.onModuleInit();
      const module = await Test.createTestingModule({
        imports: [DiscoveryModule],
        providers: [
          ...entities.map((entity) => ({
            provide: getRepositoryToken(entity),
            useValue: connectionSource.getRepository(entity),
          })),
          ...entities.map((entity) => ({
            provide: getWorkspaceScopedRepositoryToken(entity),
            useValue: new WorkspaceScopedRepository(
              connectionSource.getRepository(entity) as never,
            ),
          })),
          { provide: DataSource, useValue: connectionSource },
          { provide: TwentyConfigService, useValue: cfg },
          {
            provide: WorkspaceEventEmitter,
            useValue: new WorkspaceEventEmitter(new EventEmitter2()),
          },
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
          ...providers,
        ],
      }).compile();
      try {
        // Explicit lifecycle, no module.init(): no unrelated module hooks.
        await module.get(WorkspaceCacheService).onModuleInit();
        const dataSourceService = module.get(GlobalWorkspaceDataSourceService);
        await dataSourceService.onModuleInit();
        const [workspaceReadonly] = await dataSourceService
          .getGlobalWorkspaceDataSource()
          .query('SHOW default_transaction_read_only', [], undefined, {
            shouldBypassPermissionChecks: true,
          });
        if (workspaceReadonly?.default_transaction_read_only !== 'on')
          throw new Error(
            'Refusing ORM smoke: workspace connection is not server-side read-only',
          );
        const orm = module.get(GlobalWorkspaceOrmManager);
        const result = await orm.executeInWorkspaceContext(async () => {
          const context = getWorkspaceContext();
          const permission = resolveRolePermissionConfig({
            authContext,
            userWorkspaceRoleMap: context.userWorkspaceRoleMap,
            apiKeyRoleMap: context.apiKeyRoleMap,
          });
          expect(permission).toEqual({ intersectionOf: [admin.roleId] });
          if (!permission || 'shouldBypassPermissionChecks' in permission)
            throw new Error(
              'Real seeded role did not resolve permission intersection',
            );
          const counts: Record<string, number> = {};
          for (const name of [
            'messageThread',
            'campaign',
            'creator',
          ] as const) {
            const repo = await orm.getRepository(
              workspace.id,
              name,
              permission,
            );
            const rows = await repo.find({ take: 2, select: { id: true } });
            counts[name] = rows.length;
          }
          return {
            counts,
            flatObjects: Object.keys(
              context.flatObjectMetadataMaps.byUniversalIdentifier,
            ).length,
            roleCount: Object.keys(context.permissionsPerRoleId).length,
            entityCount: context.entityMetadatas.length,
          };
        }, authContext);
        expect(result.flatObjects).toBeGreaterThan(0);
        expect(result.roleCount).toBeGreaterThan(0);
        expect(result.entityCount).toBeGreaterThan(0);
        expect(result.counts.messageThread).toBeGreaterThan(0);
        expect(result.counts.creator).toBeGreaterThan(0);
        expect(result.counts.campaign).toBe(0); // seeded workspace has no Campaign row
        const boundary = new CampaignEmailReplyWorkBoundaryService(orm);
        const review = new CampaignEmailReplyWorkReviewService(orm, boundary);
        const threadId = await review.threadIdForHeld({
          authContext,
          expectedWorkspaceId: workspace.id,
          workItemId: collisionSource.workItemId,
        });
        expect(threadId).toBe(collisionSource.threadId);
        const collisions = await review.listCollisions({
          authContext,
          expectedWorkspaceId: workspace.id,
          threadId,
        });
        expect(collisions).toMatchObject({
          hasNextPage: false,
          items: [
            {
              collisionId: collisionSource.collisionId,
              originalWorkItemId: collisionSource.workItemId,
              originalState: 'HELD',
            },
          ],
        });
        expect(collisions.items).toHaveLength(1);
        const held = await review.listHeld({
          authContext,
          expectedWorkspaceId: workspace.id,
          threadId,
        });
        expect(held.hasNextPage).toBe(false);
        expect(held.items).toContainEqual({
          workItemId: collisionSource.workItemId,
          contextGeneration: 1,
          choices: [],
        });
        expect(held.items).toHaveLength(1);
        // A mismatched member-user must fail before any attention IDs or content
        // can be returned. Do not call promote: this boundary is read-only.
        const denied = await review
          .listCollisions({
            authContext: {
              ...authContext,
              workspaceMember: {
                ...authContext.workspaceMember,
                userId: workspace.id,
              },
            },
            expectedWorkspaceId: workspace.id,
            threadId,
          })
          .then(
            () => null,
            (error: unknown) => error,
          );
        expect(denied).toBeInstanceOf(ForbiddenException);
        expect((denied as ForbiddenException).message).toBe(
          'Authenticated Inbox collision attention required',
        );
        expect(cacheOps.reads).toBeGreaterThan(0);
        const [after] = await inspection.query(`SELECT
        (SELECT count(*)::integer FROM core."upgradeMigration") receipts,
        (SELECT count(*)::integer FROM core."upgradeMigration" WHERE "status" <> 'completed') failed,
        (SELECT count(*)::integer FROM core."campaignPartnershipWorkItem") work,
        (SELECT count(*)::integer FROM core."campaignEmailWorkCollision") collision,
        (SELECT count(*)::integer FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname IN ('core','public') OR n.nspname LIKE 'workspace_%') objects`);
        expect(after).toEqual(before);
        expect(cacheOps.writes).toBeGreaterThan(0); // real cache recomputation but memory-only
        // No IDs, customer payload or credentials in Jest output.
      } finally {
        await module
          .get(GlobalWorkspaceDataSourceService)
          .onApplicationShutdown();
        await module.close();
      }
    } finally {
      if (inspection.isInitialized) await inspection.destroy();
      if (connectionSource.isInitialized) await connectionSource.destroy();
    }
  },
  30000,
);
