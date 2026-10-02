import { randomUUID } from 'node:crypto';

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
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { WorkspaceEventEmitter } from 'src/engine/workspace-event-emitter/workspace-event-emitter';
import { CampaignEmailInboundHeldWorkService } from 'src/modules/campaign-partnership/services/campaign-email-inbound-held-work.service';
import { MatchParticipantService } from 'src/modules/match-participant/match-participant.service';
import { MessagingMessageService } from 'src/modules/messaging/message-import-manager/services/messaging-message.service';
import { MessagingMessageParticipantService } from 'src/modules/messaging/message-participant-manager/services/messaging-message-participant.service';
import { MessagingSaveMessagesAndEnqueueContactCreationService } from 'src/modules/messaging/message-import-manager/services/messaging-save-messages-and-enqueue-contact-creation.service';
import { MessagingEmailBaselineService } from 'src/modules/messaging/message-import-manager/services/messaging-email-baseline.service';

const phase = process.env.MYAH334_NATIVE_IMPORT_PHASE;
const enabled = phase === 'DRY_RUN' || phase === 'COMMIT';
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
  'imports one native canonical Gmail reply into HELD after READY, rollback first',
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
      const [ready] = await inspection.query(
        `SELECT g."id" "generationId",g."workspaceId",g."messageChannelId" "channelId",
          g."connectedAccountId" "accountId",g."accountIncarnationId" "incarnationId",
          g."completedAt",g."status",g."isCurrent",a."campaignEmailIncarnationId" "actualIncarnationId",
          lower(a."handle") recipient,a."provider",ch."messageFolderImportPolicy" policy,ch."type" "channelType"
         FROM core."campaignEmailBaselineGeneration" g
         JOIN core."connectedAccount" a ON a."id"=g."connectedAccountId" AND a."workspaceId"=g."workspaceId"
         JOIN core."messageChannel" ch ON ch."id"=g."messageChannelId" AND ch."connectedAccountId"=a."id"
           AND ch."workspaceId"=g."workspaceId"
         WHERE g."isCurrent"=true AND g."status"='READY' AND g."workspaceId"=$1`,
        [workspace.id],
      );
      if (
        !ready?.generationId ||
        !ready.recipient ||
        !ready.completedAt ||
        ready.incarnationId !== ready.actualIncarnationId ||
        ready.provider !== 'google' ||
        ready.policy !== 'ALL_FOLDERS' ||
        ready.channelType !== 'EMAIL' ||
        ready.workspaceId !== workspace.id
      )
        throw new Error(
          'Refusing import: exact synthetic READY incarnation unavailable',
        );
      const [original] = await inspection.query(
        `SELECT w."id",w."state",w."reason",w."contextGeneration",c."id" "collisionId"
         FROM core."campaignPartnershipWorkItem" w JOIN core."campaignEmailWorkCollision" c
           ON c."originalWorkId"=w."id" WHERE w."workspaceId"=$1`,
        [workspace.id],
      );
      if (
        !original?.id ||
        !original.collisionId ||
        original.state !== 'HELD' ||
        original.reason !== 'PROVIDER_ID_COLLISION' ||
        original.contextGeneration !== 1
      )
        throw new Error('Refusing import: original quarantine changed');
      const providerId = `myah334-native-${randomUUID()}`;
      const providerThread = `myah334-native-thread-${randomUUID()}`;
      const headerMessageId = `<${randomUUID()}@myah334.example.test>`;
      const sender = `native-${randomUUID()}@example.test`;
      const receivedAt = new Date(Date.now() - 1000);
      const occurredAt = new Date(Date.now() - 2000);
      if (occurredAt <= ready.completedAt || receivedAt <= ready.completedAt)
        throw new Error('Refusing import: source predates READY');
      const channel = {
        id: ready.channelId,
        connectedAccountId: ready.accountId,
        connectedAccount: { provider: 'google' },
        messageFolderImportPolicy: 'ALL_FOLDERS',
        isContactAutoCreationEnabled: false,
        excludeNonProfessionalEmails: false,
        contactAutoCreationPolicy: 'NONE',
      };
      const account = {
        id: ready.accountId,
        handle: ready.recipient,
        handleAliases: [],
      };
      const message = {
        externalId: providerId,
        messageThreadExternalId: providerThread,
        headerMessageId,
        subject: 'Synthetic native fixture',
        text: 'Synthetic fixture only',
        receivedAt,
        providerOccurredAt: occurredAt.toISOString(),
        direction: 'INCOMING',
        isDraft: false,
        attachments: [],
        participants: [
          { role: 'FROM', handle: sender, displayName: null },
          { role: 'TO', handle: ready.recipient, displayName: null },
        ],
      };
      const source = {
        mode: 'LIVE',
        generationId: randomUUID(),
        liveBaselineGenerationId: ready.generationId,
        liveMessageExternalIds: [providerId],
      };
      const [freshSource] = await inspection.query(
        `SELECT
           (SELECT count(*)::integer FROM core."campaignEmailBaselineItem" WHERE "generationId"=$1 AND "providerMessageId"=$2) "baselineItems",
           (SELECT count(*)::integer FROM core."campaignPartnershipWorkItem" WHERE "workspaceId"=$3 AND "providerMessageId"=$2) works,
           (SELECT count(*)::integer FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."messageChannelMessageAssociation"
             WHERE "messageChannelId"=$4 AND "messageExternalId"=$2) associations,
           (SELECT count(*)::integer FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."message"
             WHERE "headerMessageId"=$5) headers`,
        [
          ready.generationId,
          providerId,
          workspace.id,
          ready.channelId,
          headerMessageId,
        ],
      );
      if (
        freshSource?.baselineItems !== 0 ||
        freshSource.works !== 0 ||
        freshSource.associations !== 0 ||
        freshSource.headers !== 0
      )
        throw new Error('Refusing import: synthetic source is not fresh');
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
      // This test's emitter is private. AppModule and production participant
      // listeners are never initialized; check both named/wildcard and onAny
      // registrations before the first transaction can write.
      const isolatedEmitter = new EventEmitter2();
      const workspaceEmitter = new WorkspaceEventEmitter(isolatedEmitter);
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
            useValue: workspaceEmitter,
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
        const baseline = new MessagingEmailBaselineService(orm);
        const queueCalls: unknown[] = [];
        const messageService = new MessagingMessageService(orm);
        const matcher = new MatchParticipantService(
          module.get(WorkspaceEventEmitter),
          orm,
        );
        const participantService = new MessagingMessageParticipantService(
          orm,
          matcher,
        );
        // Triage deliberately OFF: false marker return prevents triage persistence
        // and source-contact work. Actual canonical import, participants, READY
        // verification and HELD producer remain real; no real queue/provider.
        const importer =
          new MessagingSaveMessagesAndEnqueueContactCreationService(
            {
              add: async (...args: unknown[]) => {
                queueCalls.push(args);
              },
            } as never,
            messageService,
            participantService,
            { saveMessageFolderAssociations: async () => undefined } as never,
            orm,
            {} as never,
            {
              lockMigrationMarkerForSourcePersistenceInTransaction: async () =>
                false,
            } as never,
            undefined,
            baseline,
            new CampaignEmailInboundHeldWorkService(),
          );
        const dataSource = await orm.getGlobalWorkspaceDataSource();
        if (!dataSource) throw new Error('Workspace datasource unavailable');
        if (module.get(WorkspaceEventEmitter) !== workspaceEmitter)
          throw new Error('Refusing import: unexpected event emitter provider');
        const assertNoPrivateListeners = () => {
          if (
            isolatedEmitter.eventNames().length !== 0 ||
            isolatedEmitter.listenersAny().length !== 0 ||
            isolatedEmitter.hasListeners()
          )
            throw new Error('Refusing import: private emitter has listeners');
        };
        let failureStage = 'transaction-start';
        const importOnce = async () => {
          // Also reject registrations that appeared after the first import.
          assertNoPrivateListeners();
          const runner = dataSource.createQueryRunner();
          await runner.connect();
          try {
            await runner.startTransaction();
            // All other pooled sessions remain server-side read-only. The only
            // write capability is local to this explicitly owned transaction.
            await runner.query('SET TRANSACTION READ WRITE');
            const [transactionMode] = await runner.query(
              'SHOW transaction_read_only',
            );
            if (transactionMode?.transaction_read_only !== 'off')
              throw new Error(
                'Marked import transaction did not become read-write',
              );
            failureStage = 'ready-lock';
            const [current] = await runner.query(
              `SELECT "status","isCurrent","accountIncarnationId","completedAt" FROM core."campaignEmailBaselineGeneration" WHERE "id"=$1 FOR SHARE`,
              [ready.generationId],
            );
            if (
              current?.status !== 'READY' ||
              current.isCurrent !== true ||
              current.accountIncarnationId !== ready.incarnationId ||
              current.completedAt.getTime() !== ready.completedAt.getTime()
            )
              throw new Error(
                'Refusing import: READY changed under transaction',
              );
            failureStage = 'live-verification';
            const live = await baseline.verifyLiveInTransaction(
              runner.manager,
              workspace.id,
              channel as never,
              ready.generationId,
              [providerId],
            );
            if (!live.has(providerId))
              throw new Error(
                'Refusing import: native per-ID READY proof failed',
              );
            failureStage = 'native-orchestration';
            const result = await importer.saveMessagesAndEnqueueContactCreation(
              [message] as never,
              channel as never,
              account as never,
              workspace.id,
              source as never,
              runner.manager,
            );
            const canonicalId =
              result?.messageExternalIdsAndIdsMap.get(providerId);
            const threadId =
              result?.messageExternalIdToMessageThreadIdMap.get(providerId);
            if (!canonicalId || !threadId)
              throw new Error('Native canonical persistence missing');
            failureStage = 'held-read';
            const [work] = await runner.query(
              `SELECT "id","state","reason","canonicalMessageId","messageThreadId","baselineGenerationId"
               FROM core."campaignPartnershipWorkItem" WHERE "workspaceId"=$1 AND "providerMessageId"=$2`,
              [workspace.id, providerId],
            );
            if (
              work?.state !== 'HELD' ||
              work.reason !== 'NO_EXACT_BINDING' ||
              work.canonicalMessageId !== canonicalId ||
              work.messageThreadId !== threadId ||
              work.baselineGenerationId !== ready.generationId
            )
              throw new Error(
                'Native importer did not produce exact neutral HELD',
              );
            failureStage = 'canonical-row-read';
            const [physical] = await runner.query(
              `SELECT (SELECT count(*)::integer FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."message" WHERE "id"=$1) messages,
                (SELECT count(*)::integer FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."messageParticipant" WHERE "messageId"=$1) participants,
                (SELECT count(*)::integer FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."messageChannelMessageAssociation"
                  WHERE "messageId"=$1 AND "messageChannelId"=$2 AND "messageExternalId"=$3) associations`,
              [canonicalId, ready.channelId, providerId],
            );
            if (
              physical.messages !== 1 ||
              physical.participants !== 2 ||
              physical.associations !== 1
            )
              throw new Error(
                'Native canonical metadata-backed row graph incomplete',
              );
            if (queueCalls.length)
              throw new Error('Queue called before commit');
            failureStage = 'transaction-finalize';
            if (phase === 'DRY_RUN') await runner.rollbackTransaction();
            else await runner.commitTransaction();
            return { canonicalId, threadId, workId: work.id };
          } finally {
            if (runner.isTransactionActive) await runner.rollbackTransaction();
            await runner.release();
          }
        };
        // Query a different connection after COMMIT, never the writer's
        // transaction snapshot. Every predicate is source-bound, and errors
        // intentionally contain neither provider IDs nor payloads.
        const assertCommittedReadBack = async (saved: {
          canonicalId: string;
          threadId: string;
          workId: string;
        }) => {
          const reader = inspection.createQueryRunner();
          try {
            await reader.connect();
            await reader.startTransaction('REPEATABLE READ');
            await reader.query('SET TRANSACTION READ ONLY');
            const [readMode] = await reader.query('SHOW transaction_read_only');
            if (readMode?.transaction_read_only !== 'on')
              throw new Error(
                'Committed readback transaction is not read-only',
              );
            const [proof] = await reader.query(
              `SELECT
                (SELECT count(*)::integer FROM core."campaignPartnershipWorkItem" WHERE "workspaceId"=$1 AND "providerMessageId"=$2) "sourceWork",
                (SELECT count(*)::integer FROM core."campaignPartnershipWorkItem" WHERE "state"='PENDING') pending,
                (SELECT count(*)::integer FROM core."campaignEmailWorkCollision") collisions,
                (SELECT count(*)::integer FROM core."upgradeMigration") receipts,
                (SELECT count(*)::integer FROM core."campaignEmailBaselineGeneration") generations`,
              [workspace.id, providerId],
            );
            const [work] = await reader.query(
              `SELECT "id","workspaceId","state","purpose","reason","canonicalMessageId",
                "messageThreadId","messageChannelId","connectedAccountId","accountIncarnationId",
                "providerMessageId","providerThreadId","creatorSender","accountRecipient",
                "baselineGenerationId","providerOccurredAt"
               FROM core."campaignPartnershipWorkItem" WHERE "id"=$1`,
              [saved.workId],
            );
            const [canonical] = await reader.query(
              `SELECT "id","messageThreadId","headerMessageId","subject","text","receivedAt","isDraft"
               FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."message" WHERE "id"=$1`,
              [saved.canonicalId],
            );
            const [association] = await reader.query(
              `SELECT count(*)::integer total,
                 bool_and("messageId"=$1 AND "messageChannelId"=$2 AND "messageExternalId"=$3
                   AND "messageThreadExternalId"=$4
                   AND "direction"='INCOMING' AND "deletedAt" IS NULL) exact
               FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."messageChannelMessageAssociation"
               WHERE "messageId"=$1`,
              [saved.canonicalId, ready.channelId, providerId, providerThread],
            );
            const [participants] = await reader.query(
              `SELECT count(*)::integer total,
                 count(*) FILTER (WHERE "role"='FROM' AND "handle"=$2 AND "deletedAt" IS NULL)::integer fromCount,
                 count(*) FILTER (WHERE "role"='TO' AND "handle"=$3 AND "deletedAt" IS NULL)::integer toCount
               FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."messageParticipant" WHERE "messageId"=$1`,
              [saved.canonicalId, sender, ready.recipient],
            );
            const [currentReady] = await reader.query(
              `SELECT "status","isCurrent","accountIncarnationId","completedAt" FROM core."campaignEmailBaselineGeneration" WHERE "id"=$1`,
              [ready.generationId],
            );
            const [old] = await reader.query(
              `SELECT w."state",w."reason",w."contextGeneration",c."id" "collisionId"
               FROM core."campaignPartnershipWorkItem" w JOIN core."campaignEmailWorkCollision" c
                 ON c."originalWorkId"=w."id" WHERE w."id"=$1`,
              [original.id],
            );
            if (
              proof?.sourceWork !== 1 ||
              proof.pending !== 0 ||
              proof.collisions !== 1 ||
              proof.receipts !== 143 ||
              proof.generations !== 1 ||
              work?.id !== saved.workId ||
              work.workspaceId !== workspace.id ||
              work.state !== 'HELD' ||
              work.purpose !== 'REPLY_AMBIGUITY' ||
              work.reason !== 'NO_EXACT_BINDING' ||
              work.canonicalMessageId !== saved.canonicalId ||
              work.messageThreadId !== saved.threadId ||
              work.messageChannelId !== ready.channelId ||
              work.connectedAccountId !== ready.accountId ||
              work.accountIncarnationId !== ready.incarnationId ||
              work.providerMessageId !== providerId ||
              work.providerThreadId !== providerThread ||
              work.creatorSender !== sender ||
              work.accountRecipient !== ready.recipient ||
              work.baselineGenerationId !== ready.generationId ||
              work.providerOccurredAt?.getTime() !== occurredAt.getTime() ||
              canonical?.id !== saved.canonicalId ||
              canonical.messageThreadId !== saved.threadId ||
              canonical.headerMessageId !== headerMessageId ||
              canonical.subject !== message.subject ||
              canonical.text !== message.text ||
              canonical.isDraft !== false ||
              canonical.receivedAt?.getTime() !== receivedAt.getTime() ||
              association?.total !== 1 ||
              association.exact !== true ||
              participants?.total !== 2 ||
              participants.fromcount !== 1 ||
              participants.tocount !== 1 ||
              currentReady?.status !== 'READY' ||
              currentReady.isCurrent !== true ||
              currentReady.accountIncarnationId !== ready.incarnationId ||
              currentReady.completedAt?.getTime() !==
                ready.completedAt.getTime() ||
              old?.state !== original.state ||
              old.reason !== original.reason ||
              old.contextGeneration !== original.contextGeneration ||
              old.collisionId !== original.collisionId ||
              queueCalls.length !== 0
            )
              throw new Error(
                'Committed canonical source/readback contract failed',
              );
          } finally {
            try {
              if (reader.isTransactionActive)
                await reader.rollbackTransaction();
            } finally {
              await reader.release();
            }
          }
        };
        let committed:
          | { canonicalId: string; threadId: string; workId: string }
          | undefined;
        try {
          committed = await importOnce();
          if (phase === 'COMMIT') {
            failureStage = 'committed-readback';
            await assertCommittedReadBack(committed);
            failureStage = 'replay';
            const replay = await importOnce();
            // Never print ID-bearing objects in failing Jest assertions.
            if (
              replay.canonicalId !== committed.canonicalId ||
              replay.threadId !== committed.threadId ||
              replay.workId !== committed.workId
            )
              throw new Error('Exact native replay changed canonical identity');
            failureStage = 'replayed-readback';
            await assertCommittedReadBack(committed);
          }
        } catch (error) {
          // The Jest log must not expose SQL parameter values or synthetic IDs.
          const code =
            (error as { code?: string; driverError?: { code?: string } })
              ?.code ??
            (error as { driverError?: { code?: string } })?.driverError?.code;
          throw new Error(
            `Native import ${phase} failed at ${failureStage}: ${error instanceof Error ? error.name : 'unknown'}${code ? ` code ${code}` : ''}`,
          );
        }
        expect(committed?.canonicalId).toBeDefined();
        expect(queueCalls).toHaveLength(0);
        expect(cacheOps.reads).toBeGreaterThan(0);
        const [after] = await inspection.query(`SELECT
        (SELECT count(*)::integer FROM core."upgradeMigration") receipts,
        (SELECT count(*)::integer FROM core."upgradeMigration" WHERE "status" <> 'completed') failed,
        (SELECT count(*)::integer FROM core."campaignPartnershipWorkItem") work,
        (SELECT count(*)::integer FROM core."campaignEmailWorkCollision") collision,
        (SELECT count(*)::integer FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname IN ('core','public') OR n.nspname LIKE 'workspace_%') objects`);
        expect(after).toEqual(
          phase === 'DRY_RUN'
            ? before
            : {
                ...before,
                work: before.work + 1,
              },
        );
        const [unchangedOriginal] = await inspection.query(
          `SELECT w."state",w."reason",w."contextGeneration",c."id" "collisionId"
           FROM core."campaignPartnershipWorkItem" w JOIN core."campaignEmailWorkCollision" c
             ON c."originalWorkId"=w."id" WHERE w."id"=$1`,
          [original.id],
        );
        expect(unchangedOriginal).toEqual({
          state: original.state,
          reason: original.reason,
          contextGeneration: original.contextGeneration,
          collisionId: original.collisionId,
        });
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
