import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';

import { type AllMetadataName } from 'twenty-shared/metadata';
import { isDefined } from 'twenty-shared/utils';
import { DataSource, type QueryRunner } from 'typeorm';

import { type FlatApplication } from 'src/engine/core-modules/application/types/flat-application.type';

import { LoggerService } from 'src/engine/core-modules/logger/logger.service';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { WorkspaceManyOrAllFlatEntityMapsCacheService } from 'src/engine/metadata-modules/flat-entity/services/workspace-many-or-all-flat-entity-maps-cache.service';
import { AllFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/all-flat-entity-maps.type';
import { getFlatEntityMapsExceptionContext } from 'src/engine/metadata-modules/flat-entity/utils/get-flat-entity-maps-exception-context.util';
import { getMetadataFlatEntityMapsKey } from 'src/engine/metadata-modules/flat-entity/utils/get-metadata-flat-entity-maps-key.util';
import { getMetadataRelatedMetadataNamesForValidation } from 'src/engine/metadata-modules/flat-entity/utils/get-metadata-related-metadata-names-for-validation.util';
import { getMetadataRelatedMetadataNames } from 'src/engine/metadata-modules/flat-entity/utils/get-metadata-related-metadata-names.util';
import { getMetadataSerializedRelationNames } from 'src/engine/metadata-modules/flat-entity/utils/get-metadata-serialized-relation-names.util';
import { createSearchFieldMetadatasByTsVectorFieldIdAccessor } from 'src/engine/metadata-modules/flat-search-field-metadata/utils/create-search-field-metadatas-by-ts-vector-field-id-accessor.util';
import { FIND_ALL_VIEWS_GRAPHQL_OPERATION } from 'src/engine/metadata-modules/view/constants/find-all-views-graphql-operation.constant';
import { WorkspaceMetadataVersionService } from 'src/engine/metadata-modules/workspace-metadata-version/services/workspace-metadata-version.service';
import { WorkspaceCacheStorageService } from 'src/engine/workspace-cache-storage/workspace-cache-storage.service';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { WorkspaceMigration } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-builder/types/workspace-migration.type';
import {
  WorkspaceMigrationRunnerException,
  WorkspaceMigrationRunnerExceptionCode,
} from 'src/engine/workspace-manager/workspace-migration/workspace-migration-runner/exceptions/workspace-migration-runner.exception';
import { WorkspaceMigrationRunnerActionHandlerRegistryService } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-runner/registry/workspace-migration-runner-action-handler-registry.service';
import { buildPreallocatedIdByUniversalIdentifierFromActions } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-runner/utils/build-preallocated-id-by-universal-identifier-from-actions.util';
import { type AfterCommitSideEffect } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-runner/types/after-commit-side-effect.type';
import { type MetadataEvent } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-runner/types/metadata-event';

@Injectable()
export class WorkspaceMigrationRunnerService {
  constructor(
    private readonly flatEntityMapsCacheService: WorkspaceManyOrAllFlatEntityMapsCacheService,
    @InjectDataSource()
    private readonly coreDataSource: DataSource,
    private readonly workspaceMigrationRunnerActionHandlerRegistry: WorkspaceMigrationRunnerActionHandlerRegistryService,
    private readonly workspaceMetadataVersionService: WorkspaceMetadataVersionService,
    private readonly workspaceCacheStorageService: WorkspaceCacheStorageService,
    private readonly workspaceCacheService: WorkspaceCacheService,
    private readonly logger: LoggerService,
    private readonly twentyConfigService: TwentyConfigService,
  ) {}

  private getLegacyCacheInvalidationPromises({
    allFlatEntityMapsKeys,
    workspaceId,
  }: {
    allFlatEntityMapsKeys: (keyof AllFlatEntityMaps)[];
    workspaceId: string;
  }): Promise<void>[] {
    const asyncOperations: Promise<void>[] = [];
    const flatMapsKeysSet = new Set(allFlatEntityMapsKeys);

    const shouldIncrementMetadataGraphqlSchemaVersion =
      flatMapsKeysSet.has('flatObjectMetadataMaps') ||
      flatMapsKeysSet.has('flatFieldMetadataMaps');

    if (shouldIncrementMetadataGraphqlSchemaVersion) {
      asyncOperations.push(
        this.workspaceMetadataVersionService.incrementMetadataVersion(
          workspaceId,
        ),
      );
    }

    const viewRelatedFlatMapsKeys: (keyof AllFlatEntityMaps)[] = [
      'flatViewMaps',
      'flatViewFilterMaps',
      'flatViewGroupMaps',
      'flatViewFieldMaps',
      'flatViewFilterGroupMaps',
    ];
    const shouldInvalidateFindViewsGraphqlCacheOperation =
      viewRelatedFlatMapsKeys.some((key) => flatMapsKeysSet.has(key));

    if (
      shouldInvalidateFindViewsGraphqlCacheOperation ||
      shouldIncrementMetadataGraphqlSchemaVersion
    ) {
      asyncOperations.push(
        this.workspaceCacheStorageService.flushGraphQLOperation({
          operationName: FIND_ALL_VIEWS_GRAPHQL_OPERATION,
          workspaceId,
        }),
      );
    }

    const shouldInvalidateRoleMapCache =
      flatMapsKeysSet.has('flatRoleMaps') ||
      flatMapsKeysSet.has('flatRoleTargetMaps');

    const shouldInvalidateRolesPermissionsCache =
      flatMapsKeysSet.has('flatObjectPermissionMaps') ||
      flatMapsKeysSet.has('flatFieldPermissionMaps') ||
      flatMapsKeysSet.has('flatRolePermissionFlagMaps');

    if (shouldIncrementMetadataGraphqlSchemaVersion) {
      asyncOperations.push(
        this.workspaceCacheService.invalidateAndRecompute(workspaceId, [
          'ORMEntityMetadatas',
          'graphQLResolverNameMap',
        ]),
      );
    }

    if (shouldInvalidateRoleMapCache || shouldInvalidateRolesPermissionsCache) {
      asyncOperations.push(
        this.workspaceCacheService.invalidateAndRecompute(workspaceId, [
          'rolesPermissions',
          'userWorkspaceRoleMap',
          'flatRoleTargetMaps',
          'apiKeyRoleMap',
          'flatRoleTargetByAgentIdMaps',
        ]),
      );
    }

    if (flatMapsKeysSet.has('flatApplicationVariableMaps')) {
      asyncOperations.push(
        this.workspaceCacheService.invalidateAndRecompute(workspaceId, [
          'applicationVariableMaps',
        ]),
      );
    }

    return asyncOperations;
  }

  async invalidateCache({
    allFlatEntityMapsKeys,
    workspaceId,
  }: {
    allFlatEntityMapsKeys: (keyof AllFlatEntityMaps)[];
    workspaceId: string;
  }): Promise<void> {
    this.logger.perfTime(
      'Runner',
      `Cache invalidation ${allFlatEntityMapsKeys.join()}`,
    );

    await this.flatEntityMapsCacheService.invalidateFlatEntityMaps({
      workspaceId,
      flatMapsKeys: allFlatEntityMapsKeys,
    });

    const invalidationResults = await Promise.allSettled(
      this.getLegacyCacheInvalidationPromises({
        allFlatEntityMapsKeys,
        workspaceId,
      }),
    );

    const invalidationFailures = invalidationResults.filter(
      (result) => result.status === 'rejected',
    );

    if (invalidationFailures.length > 0) {
      invalidationFailures.forEach((err) =>
        this.logger.error(
          `Failed to invalidate a legacy cache ${err.reason}`,
          'Runner',
        ),
      );
      throw new Error(
        `Failed to invalidate ${invalidationFailures.length} cache operations`,
      );
    }

    this.logger.perfTimeEnd(
      'Runner',
      `Cache invalidation ${allFlatEntityMapsKeys.join()}`,
    );
  }

  private async logBlockingDbActivity(): Promise<void> {
    try {
      // Metadata only (no query text) to avoid logging literals from other sessions.
      const rows = await this.coreDataSource.query(
        `SELECT pid, state, wait_event_type, wait_event,
                now() - query_start AS running_for, pg_blocking_pids(pid) AS blocked_by
         FROM pg_stat_activity
         WHERE datname = current_database()
           AND state <> 'idle'
           AND pid <> pg_backend_pid()
         ORDER BY query_start ASC`,
      );

      this.logger.error(
        `[install-perf] active DB sessions at failure: ${JSON.stringify(rows)}`,
        'Runner',
      );
    } catch (snapshotError) {
      this.logger.error(
        `[install-perf] could not snapshot pg_stat_activity: ${
          snapshotError instanceof Error
            ? snapshotError.message
            : String(snapshotError)
        }`,
        'Runner',
      );
    }
  }

  /** Executes only native actions on the caller-owned active transaction. The caller owns commit, receipts and publication. */
  async executeActionsInTransaction({
    queryRunner,
    workspaceId,
    workspaceMigration,
    allFlatEntityMaps,
    flatApplication,
  }: {
    queryRunner: QueryRunner;
    workspaceId: string;
    workspaceMigration: WorkspaceMigration;
    allFlatEntityMaps: AllFlatEntityMaps;
    flatApplication: FlatApplication;
  }): Promise<{
    allFlatEntityMaps: AllFlatEntityMaps;
    metadataEvents: MetadataEvent[];
    afterCommitSideEffects: AfterCommitSideEffect[];
  }> {
    const state = {
      allFlatEntityMaps,
      actionCount: 0,
      slowestActionMs: 0,
      slowestActionLabel: 'n/a',
    };

    return this.executeActionLoop({
      queryRunner,
      workspaceId,
      workspaceMigration,
      state,
      flatApplication,
      transactionSafeCreateActionsOnly: true,
    });
  }

  private async executeActionLoop({
    queryRunner,
    workspaceId,
    workspaceMigration: { actions },
    state,
    flatApplication,
    transactionSafeCreateActionsOnly,
  }: {
    queryRunner: QueryRunner;
    workspaceId: string;
    workspaceMigration: WorkspaceMigration;
    state: {
      allFlatEntityMaps: AllFlatEntityMaps;
      actionCount: number;
      slowestActionMs: number;
      slowestActionLabel: string;
    };
    flatApplication: FlatApplication;
    transactionSafeCreateActionsOnly: boolean;
  }): Promise<{
    allFlatEntityMaps: AllFlatEntityMaps;
    metadataEvents: MetadataEvent[];
    afterCommitSideEffects: AfterCommitSideEffect[];
  }> {
    if (this.twentyConfigService.get('WORKSPACE_SCHEMA_DDL_LOCKED')) {
      throw new WorkspaceMigrationRunnerException({
        message:
          'Workspace schema DDL changes are locked. This is typically set during hot upgrades.',
        code: WorkspaceMigrationRunnerExceptionCode.DDL_LOCKED,
      });
    }
    if (
      !queryRunner ||
      queryRunner.isReleased ||
      !queryRunner.isTransactionActive
    ) {
      throw new Error(
        'Workspace migration actions require an active, connected caller-owned QueryRunner transaction',
      );
    }

    // The new caller-owned transaction API cannot execute handlers with external effects.
    // Check the whole plan before the first action so an unsafe tail cannot follow writes.
    if (
      transactionSafeCreateActionsOnly &&
      actions.some(
        (action) =>
          action.type !== 'create' ||
          !(
            action.metadataName === 'objectMetadata' ||
            action.metadataName === 'fieldMetadata' ||
            action.metadataName === 'index' ||
            action.metadataName === 'objectPermission'
          ),
      )
    ) {
      throw new Error(
        'Caller-owned workspace migration requires transaction-safe create actions only: objectMetadata, fieldMetadata, index, objectPermission',
      );
    }

    const preallocatedIdByUniversalIdentifierByMetadataName =
      buildPreallocatedIdByUniversalIdentifierFromActions(actions);
    const metadataEvents: MetadataEvent[] = [];
    const afterCommitSideEffects: AfterCommitSideEffect[] = [];
    const searchFieldMetadatasByTsVectorFieldIdAccessor =
      createSearchFieldMetadatasByTsVectorFieldIdAccessor(
        () => state.allFlatEntityMaps.flatSearchFieldMetadataMaps,
      );

    for (const action of actions) {
      const actionStart = performance.now();
      const result =
        await this.workspaceMigrationRunnerActionHandlerRegistry.executeActionHandler(
          {
            action,
            context: {
              flatApplication,
              action,
              allFlatEntityMaps: state.allFlatEntityMaps,
              queryRunner,
              workspaceId,
              preallocatedIdByUniversalIdentifierByMetadataName,
              getSearchFieldMetadatasByTsVectorFieldId:
                searchFieldMetadatasByTsVectorFieldIdAccessor.get,
            },
          },
        );

      const actionMs = performance.now() - actionStart;
      state.actionCount += 1;
      if (actionMs > state.slowestActionMs) {
        state.slowestActionMs = actionMs;
        state.slowestActionLabel = `${action.type}:${action.metadataName}`;
      }
      if (actionMs > 50) {
        this.logger.perf(
          `[install-perf] slow action ${action.type}:${action.metadataName} took ${actionMs.toFixed(1)}ms`,
          'Runner',
        );
      }
      state.allFlatEntityMaps = {
        ...state.allFlatEntityMaps,
        ...result.partialOptimisticCache,
      } as typeof state.allFlatEntityMaps;
      if (action.metadataName === 'searchFieldMetadata') {
        searchFieldMetadatasByTsVectorFieldIdAccessor.invalidate();
      }
      metadataEvents.push(...result.metadataEvents);
      afterCommitSideEffects.push(...result.afterCommitSideEffects);
    }

    return {
      allFlatEntityMaps: state.allFlatEntityMaps,
      metadataEvents,
      afterCommitSideEffects,
    };
  }

  run = async ({
    workspaceMigration: { actions, applicationUniversalIdentifier },
    workspaceId,
  }: {
    workspaceMigration: WorkspaceMigration;
    workspaceId: string;
  }): Promise<{
    allFlatEntityMaps: AllFlatEntityMaps;
    metadataEvents: MetadataEvent[];
    hasSchemaMetadataChanged: boolean;
  }> => {
    if (this.twentyConfigService.get('WORKSPACE_SCHEMA_DDL_LOCKED')) {
      throw new WorkspaceMigrationRunnerException({
        message:
          'Workspace schema DDL changes are locked. This is typically set during hot upgrades.',
        code: WorkspaceMigrationRunnerExceptionCode.DDL_LOCKED,
      });
    }

    this.logger.perfTime('Runner', 'Total execution');
    this.logger.perfTime('Runner', 'Initial cache retrieval');

    const initialCacheRetrievalStart = performance.now();

    const queryRunner = this.coreDataSource.createQueryRunner();

    const actionMetadataNames = [
      ...new Set(actions.flatMap((action) => action.metadataName)),
    ];

    const hasSearchVectorRebuildAction = actions.some(
      (action) =>
        action.metadataName === 'fieldMetadata' &&
        action.type === 'update' &&
        action.rebuildSearchVector === true,
    );

    const searchVectorRebuildMetadataNames: AllMetadataName[] =
      hasSearchVectorRebuildAction ? ['index'] : [];

    const actionsMetadataAndRelatedMetadataNames: AllMetadataName[] = [
      ...new Set([
        ...actionMetadataNames,
        ...actionMetadataNames.flatMap(getMetadataRelatedMetadataNames),
        ...actionMetadataNames.flatMap(getMetadataSerializedRelationNames),
        ...actionMetadataNames.flatMap(
          getMetadataRelatedMetadataNamesForValidation,
        ),
        ...searchVectorRebuildMetadataNames,
      ]),
    ];
    const allFlatEntityMapsKeys = actionsMetadataAndRelatedMetadataNames.map(
      getMetadataFlatEntityMapsKey,
    );

    let allFlatEntityMaps: AllFlatEntityMaps =
      await this.flatEntityMapsCacheService.getOrRecomputeManyOrAllFlatEntityMaps<
        typeof allFlatEntityMapsKeys
      >({
        workspaceId,
        flatMapsKeys: allFlatEntityMapsKeys,
      });

    this.logger.perfTimeEnd('Runner', 'Initial cache retrieval');

    const initialCacheRetrievalMs =
      performance.now() - initialCacheRetrievalStart;

    this.logger.perf(
      `[install-perf] Runner initial cache retrieval (getOrRecomputeManyOrAllFlatEntityMaps) took ${initialCacheRetrievalMs.toFixed(1)}ms for ${allFlatEntityMapsKeys.length} flat-maps keys`,
      'Runner',
    );

    const { flatApplicationMaps } =
      await this.workspaceCacheService.getOrRecompute(workspaceId, [
        'flatApplicationMaps',
      ]);

    const applicationId =
      flatApplicationMaps.idByUniversalIdentifier[
        applicationUniversalIdentifier
      ];
    const flatApplication = isDefined(applicationId)
      ? flatApplicationMaps.byId[applicationId]
      : undefined;

    if (!isDefined(applicationId) || !isDefined(flatApplication)) {
      throw new WorkspaceMigrationRunnerException({
        message: `Could not find application for application with universal identifier: ${applicationUniversalIdentifier}`,
        code: WorkspaceMigrationRunnerExceptionCode.APPLICATION_NOT_FOUND,
      });
    }

    this.logger.perfTime('Runner', 'Transaction execution');

    await queryRunner.connect();
    await queryRunner.startTransaction();

    const state = {
      allFlatEntityMaps,
      actionCount: 0,
      slowestActionMs: 0,
      slowestActionLabel: 'n/a',
    };
    let allMetadataEvents: MetadataEvent[] = [];
    let allAfterCommitSideEffects: AfterCommitSideEffect[] = [];
    const transactionStart = performance.now();

    try {
      await queryRunner.query(`SET LOCAL lock_timeout = '8s'`);

      const result = await this.executeActionLoop({
        queryRunner,
        workspaceId,
        workspaceMigration: { actions, applicationUniversalIdentifier },
        state,
        flatApplication,
        transactionSafeCreateActionsOnly: false,
      });
      allFlatEntityMaps = result.allFlatEntityMaps;
      allMetadataEvents = result.metadataEvents;
      allAfterCommitSideEffects = result.afterCommitSideEffects;

      const commitStart = performance.now();

      await queryRunner.commitTransaction();

      const commitMs = performance.now() - commitStart;
      const transactionMs = performance.now() - transactionStart;

      this.logger.perf(
        `[install-perf] Runner transaction summary: ${state.actionCount} actions, total transaction ${transactionMs.toFixed(1)}ms (commit ${commitMs.toFixed(1)}ms), slowest action ${state.slowestActionLabel} ${state.slowestActionMs.toFixed(1)}ms`,
        'Runner',
      );

      this.logger.perfTimeEnd('Runner', 'Transaction execution');
    } catch (error) {
      this.logger.error(
        `[install-perf] migration failed after ${state.actionCount} action(s): ${
          error instanceof Error ? error.message : String(error)
        }`,
        'Runner',
      );
      await this.logBlockingDbActivity();

      if (queryRunner.isTransactionActive && !queryRunner.isReleased) {
        await queryRunner
          .rollbackTransaction()
          .catch((rollbackError) =>
            this.logger.error(
              `[install-perf] rollback failed: ${rollbackError.message}`,
              'Runner',
            ),
          );
      } else {
        this.logger.error(
          `[install-perf] skipping rollback (txnActive=${queryRunner.isTransactionActive} released=${queryRunner.isReleased})`,
          'Runner',
        );
      }

      allFlatEntityMaps = state.allFlatEntityMaps;
      const invertedActions = [...actions].reverse();

      for (const invertedAction of invertedActions) {
        await this.workspaceMigrationRunnerActionHandlerRegistry.executeActionRollbackHandler(
          {
            action: invertedAction,
            context: {
              flatApplication,
              action: invertedAction,
              allFlatEntityMaps,
              workspaceId,
            },
          },
        );
      }

      try {
        await this.invalidateCache({
          allFlatEntityMapsKeys,
          workspaceId,
        });
      } catch (cacheError) {
        this.logger.error(
          `Cache invalidation failed after rollback: ${cacheError}`,
          'Runner',
        );
      }

      if (error instanceof WorkspaceMigrationRunnerException) {
        throw error;
      }

      throw new WorkspaceMigrationRunnerException({
        message: error.message,
        code: WorkspaceMigrationRunnerExceptionCode.INTERNAL_SERVER_ERROR,
        context: getFlatEntityMapsExceptionContext(error),
      });
    } finally {
      await queryRunner.release();
    }

    const postCommitInvalidateStart = performance.now();

    try {
      await this.invalidateCache({
        allFlatEntityMapsKeys,
        workspaceId,
      });
    } catch (cacheError) {
      this.logger.error(
        `Cache invalidation failed after committed transaction: ${cacheError}`,
        'Runner',
      );
    }

    const postCommitInvalidateMs =
      performance.now() - postCommitInvalidateStart;

    this.logger.perf(
      `[install-perf] Runner post-commit invalidateCache took ${postCommitInvalidateMs.toFixed(1)}ms for ${allFlatEntityMapsKeys.length} flat-maps keys`,
      'Runner',
    );

    const sideEffectResults = await Promise.allSettled(
      allAfterCommitSideEffects.map((sideEffect) =>
        Promise.resolve().then(() => sideEffect.run()),
      ),
    );

    sideEffectResults.forEach((result, index) => {
      if (result.status === 'rejected') {
        this.logger.warn(
          `After-commit side effect failed (${allAfterCommitSideEffects[index].description}): ${
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason)
          }`,
          'Runner',
        );
      }
    });

    const hasSchemaMetadataChanged =
      allFlatEntityMapsKeys.includes('flatObjectMetadataMaps') ||
      allFlatEntityMapsKeys.includes('flatFieldMetadataMaps');

    this.logger.perfTimeEnd('Runner', 'Total execution');

    return {
      allFlatEntityMaps,
      metadataEvents: allMetadataEvents,
      hasSchemaMetadataChanged,
    };
  };
}
