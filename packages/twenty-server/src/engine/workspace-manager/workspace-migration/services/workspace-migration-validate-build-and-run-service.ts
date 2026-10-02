import { Injectable } from '@nestjs/common';

import {
  AllMetadataName,
  WorkspaceMigrationV2ExceptionCode,
} from 'twenty-shared/metadata';
import { isValidUuid } from 'twenty-shared/utils';

import { LoggerService } from 'src/engine/core-modules/logger/logger.service';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { AllFlatEntityOperationRecordByMetadataName } from 'src/engine/metadata-modules/flat-entity/types/all-flat-entity-operation-record-by-metadata-name.type';
import { AllFlatEntityOperationByMetadataName } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-to-create-delete-update.type';
import { getFlatEntityMapsExceptionContext } from 'src/engine/metadata-modules/flat-entity/utils/get-flat-entity-maps-exception-context.util';
import { transpileFlatEntityOperationArrayToRecord } from 'src/engine/metadata-modules/flat-entity/utils/transpile-flat-entity-operation-array-to-record.util';
import { MetadataSideEffectEngineService } from 'src/engine/metadata-modules/metadata-side-effect/services/metadata-side-effect-engine.service';
import { MetadataEventEmitter } from 'src/engine/subscriptions/metadata-event/metadata-event-emitter';
import { WorkspaceMigrationV2Exception } from 'src/engine/workspace-manager/workspace-migration.exception';
import {
  enrichCreateWorkspaceMigrationActionsWithIds,
  IdByUniversalIdentifierByMetadataName,
} from 'src/engine/workspace-manager/workspace-migration/services/utils/enrich-create-workspace-migration-action-with-ids.util';
import { WorkspaceMigrationBuildOrchestratorService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-build-orchestrator.service';
import { WorkspaceMigrationFlatEntityMapsService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-flat-entity-maps.service';
import {
  WorkspaceMigrationOrchestratorBuildArgs,
  WorkspaceMigrationOrchestratorFailedResult,
  WorkspaceMigrationOrchestratorSuccessfulResult,
} from 'src/engine/workspace-manager/workspace-migration/types/workspace-migration-orchestrator.type';
import { WorkspaceMigrationRunnerService } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-runner/services/workspace-migration-runner.service';
import type { UpgradeWorkspaceTransaction } from 'src/engine/workspace-manager/workspace-migration/types/upgrade-workspace-transaction.type';
import type { PinnedWorkspaceMetadataSnapshot } from 'src/engine/workspace-manager/workspace-migration/types/pinned-workspace-metadata-snapshot.type';
import type { WorkspaceMigration } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-builder/types/workspace-migration.type';

type ValidateBuildAndRunWorkspaceMigrationFromMatriceArgs = {
  workspaceId: string;
  allFlatEntityOperationByMetadataName: AllFlatEntityOperationByMetadataName;
  isSystemBuild?: boolean;
  applicationUniversalIdentifier: string;
  dryRun?: boolean;
  upgradeTransaction?: UpgradeWorkspaceTransaction;
};

type ValidateBuildAndRunWorkspaceMigrationFromRecordArgs = {
  workspaceId: string;
  allFlatEntityOperationRecordByMetadataName: AllFlatEntityOperationRecordByMetadataName;
  isSystemBuild?: boolean;
  applicationUniversalIdentifier: string;
  dryRun?: boolean;
  upgradeTransaction?: UpgradeWorkspaceTransaction;
};

@Injectable()
export class WorkspaceMigrationValidateBuildAndRunService {
  private readonly isDebugEnabled: boolean;

  constructor(
    private readonly workspaceMigrationRunnerService: WorkspaceMigrationRunnerService,
    private readonly workspaceMigrationBuildOrchestratorService: WorkspaceMigrationBuildOrchestratorService,
    private readonly workspaceMigrationFlatEntityMapsService: WorkspaceMigrationFlatEntityMapsService,
    private readonly metadataEventEmitter: MetadataEventEmitter,
    private readonly metadataSideEffectEngineService: MetadataSideEffectEngineService,
    private readonly logger: LoggerService,
    twentyConfigService: TwentyConfigService,
  ) {
    const logLevels = twentyConfigService.get('LOG_LEVELS');

    this.isDebugEnabled = logLevels.includes('debug');
  }

  public async validateBuildAndRunWorkspaceMigrationFromTo(
    args: WorkspaceMigrationOrchestratorBuildArgs & {
      idByUniversalIdentifierByMetadataName?: IdByUniversalIdentifierByMetadataName;
      dryRun?: boolean;
      upgradeTransaction?: UpgradeWorkspaceTransaction;
      pinnedSnapshot?: PinnedWorkspaceMetadataSnapshot;
      assertBeforeRun?: (migration: WorkspaceMigration) => void;
    },
  ): Promise<
    | WorkspaceMigrationOrchestratorFailedResult
    | (WorkspaceMigrationOrchestratorSuccessfulResult & {
        hasSchemaMetadataChanged: boolean;
      })
  > {
    const {
      idByUniversalIdentifierByMetadataName,
      dryRun,
      upgradeTransaction,
      pinnedSnapshot,
      assertBeforeRun,
      ...buildArgs
    } = args;

    if (pinnedSnapshot) {
      const runner = upgradeTransaction?.queryRunner;
      if (
        !isValidUuid(args.workspaceId) ||
        pinnedSnapshot.workspaceId !== args.workspaceId ||
        pinnedSnapshot.workspace.id !== args.workspaceId ||
        !runner ||
        pinnedSnapshot.queryRunner !== runner ||
        runner.isReleased ||
        !runner.isTransactionActive ||
        runner.manager?.queryRunner !== runner ||
        typeof upgradeTransaction?.afterCommit !== 'function'
      ) {
        throw new Error(
          'Pinned migration snapshot requires a matching active upgrade transaction',
        );
      }
    }

    const buildStart = performance.now();
    const validateAndBuildResult =
      await this.workspaceMigrationBuildOrchestratorService
        .buildWorkspaceMigration(
          pinnedSnapshot
            ? {
                ...buildArgs,
                additionalCacheDataMaps: {
                  ...buildArgs.additionalCacheDataMaps,
                  featureFlagsMap: structuredClone(
                    pinnedSnapshot.featureFlagsMap,
                  ),
                },
              }
            : buildArgs,
        )
        .catch((error) => {
          this.logger.error(
            error,
            WorkspaceMigrationValidateBuildAndRunService.name,
          );
          throw new WorkspaceMigrationV2Exception(
            error.message,
            WorkspaceMigrationV2ExceptionCode.BUILDER_INTERNAL_SERVER_ERROR,
            { context: getFlatEntityMapsExceptionContext(error) },
          );
        });
    const buildMs = performance.now() - buildStart;

    this.logger.perf(
      `[install-perf] buildWorkspaceMigration took ${buildMs.toFixed(1)}ms (status=${validateAndBuildResult.status})`,
      WorkspaceMigrationValidateBuildAndRunService.name,
    );

    if (validateAndBuildResult.status === 'fail') {
      if (this.isDebugEnabled) {
        this.logger.debug?.(
          JSON.stringify(validateAndBuildResult, null, 2),
          WorkspaceMigrationValidateBuildAndRunService.name,
        );
      }

      return validateAndBuildResult;
    }

    const workspaceMigration = enrichCreateWorkspaceMigrationActionsWithIds({
      idByUniversalIdentifierByMetadataName:
        idByUniversalIdentifierByMetadataName ?? {},
      workspaceMigration: validateAndBuildResult.workspaceMigration,
    });

    // A pinned command can reject the *enriched* native plan before a single
    // runner write, without rebuilding a possibly different second plan.
    assertBeforeRun?.(workspaceMigration);

    if (dryRun === true || workspaceMigration.actions.length === 0) {
      return {
        status: 'success',
        workspaceMigration,
        hasSchemaMetadataChanged: false,
      };
    }

    const actionCountsByTypeAndMetadataName: Record<string, number> = {};

    for (const action of workspaceMigration.actions) {
      const key = `${action.type}:${action.metadataName}`;

      actionCountsByTypeAndMetadataName[key] =
        (actionCountsByTypeAndMetadataName[key] ?? 0) + 1;
    }

    this.logger.perf(
      `[install-perf] validateBuildAndRunWorkspaceMigrationFromTo running ${workspaceMigration.actions.length} actions: ${JSON.stringify(actionCountsByTypeAndMetadataName)}`,
      WorkspaceMigrationValidateBuildAndRunService.name,
    );

    const runStart = performance.now();
    const { hasSchemaMetadataChanged, metadataEvents } =
      await this.workspaceMigrationRunnerService.run({
        workspaceId: args.workspaceId,
        workspaceMigration,
        upgradeTransaction,
        pinnedSnapshot,
      });
    const runMs = performance.now() - runStart;

    this.logger.perf(
      `[install-perf] workspaceMigrationRunnerService.run took ${runMs.toFixed(1)}ms for ${workspaceMigration.actions.length} actions`,
      WorkspaceMigrationValidateBuildAndRunService.name,
    );

    const eventBatch = {
      metadataEvents,
      workspaceId: args.workspaceId,
    };
    if (upgradeTransaction)
      upgradeTransaction.afterCommit(() =>
        this.metadataEventEmitter.emitMetadataEventsAsync(eventBatch),
      );
    else this.metadataEventEmitter.emitMetadataEvents(eventBatch);

    return {
      status: 'success',
      workspaceMigration,
      hasSchemaMetadataChanged,
    };
  }

  public async validateBuildAndRunWorkspaceMigration({
    allFlatEntityOperationByMetadataName,
    workspaceId,
    isSystemBuild = false,
    applicationUniversalIdentifier,
    dryRun,
    upgradeTransaction,
  }: ValidateBuildAndRunWorkspaceMigrationFromMatriceArgs): Promise<
    | WorkspaceMigrationOrchestratorFailedResult
    | (WorkspaceMigrationOrchestratorSuccessfulResult & {
        hasSchemaMetadataChanged: boolean;
      })
  > {
    return await this.validateBuildAndRunWorkspaceMigrationFromRecord({
      allFlatEntityOperationRecordByMetadataName:
        transpileFlatEntityOperationArrayToRecord(
          allFlatEntityOperationByMetadataName,
        ),
      workspaceId,
      isSystemBuild,
      applicationUniversalIdentifier,
      dryRun,
      upgradeTransaction,
    });
  }

  public async validateBuildAndRunWorkspaceMigrationFromRecord({
    allFlatEntityOperationRecordByMetadataName,
    workspaceId,
    isSystemBuild = false,
    applicationUniversalIdentifier,
    dryRun,
    upgradeTransaction,
  }: ValidateBuildAndRunWorkspaceMigrationFromRecordArgs): Promise<
    | WorkspaceMigrationOrchestratorFailedResult
    | (WorkspaceMigrationOrchestratorSuccessfulResult & {
        hasSchemaMetadataChanged: boolean;
      })
  > {
    const callerMetadataNames = Object.keys(
      allFlatEntityOperationRecordByMetadataName,
    ) as AllMetadataName[];

    const {
      flatApplicationMaps,
      allRelatedFlatEntityMaps,
      allMetadataNameCacheToCompute,
    } =
      await this.workspaceMigrationFlatEntityMapsService.getOrRecomputeAllRelatedFlatEntityMaps(
        {
          workspaceId,
          callerMetadataNames,
        },
      );

    const sideEffectExpansionResult =
      this.metadataSideEffectEngineService.expandWithSideEffects({
        allFlatEntityOperationRecordByMetadataName,
        sideEffectRelatedFlatEntityMaps: allRelatedFlatEntityMaps,
        context: {
          buildOptions: { isSystemBuild, applicationUniversalIdentifier },
        },
      });

    if (sideEffectExpansionResult.status === 'fail') {
      return sideEffectExpansionResult;
    }

    const {
      fromToAllFlatEntityMaps,
      inferDeletionFromMissingEntities,
      dependencyAllFlatEntityMaps,
      additionalCacheDataMaps,
      idByUniversalIdentifierByMetadataName,
    } =
      this.workspaceMigrationFlatEntityMapsService.computeFromToAllFlatEntityMapsAndBuildOptions(
        {
          allFlatEntityOperationRecordByMetadataName:
            sideEffectExpansionResult.allFlatEntityOperationRecordByMetadataName,
          applicationUniversalIdentifier,
          flatApplicationMaps,
          allRelatedFlatEntityMaps,
          allMetadataNameCacheToCompute,
        },
      );

    return await this.validateBuildAndRunWorkspaceMigrationFromTo({
      buildOptions: {
        isSystemBuild,
        inferDeletionFromMissingEntities,
        applicationUniversalIdentifier,
      },
      fromToAllFlatEntityMaps,
      workspaceId,
      dependencyAllFlatEntityMaps,
      additionalCacheDataMaps,
      idByUniversalIdentifierByMetadataName,
      dryRun,
      upgradeTransaction,
    });
  }
}
