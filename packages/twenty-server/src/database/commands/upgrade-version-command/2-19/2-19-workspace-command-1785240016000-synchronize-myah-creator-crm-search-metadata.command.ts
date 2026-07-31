import { Command } from 'nest-commander';
import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { FieldMetadataType } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { ApplicationService } from 'src/engine/core-modules/application/application.service';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { computeTwentyStandardApplicationAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/utils/twenty-standard-application-all-flat-entity-maps.constant';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { WorkspaceMigrationValidateBuildAndRunService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service';
import { WorkspaceMigrationRunnerService } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-runner/services/workspace-migration-runner.service';
import { WORKSPACE_MIGRATION_ACTION_TYPE } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-builder/constants/workspace-migration-action-type.constant';
import type { UniversalUpdateFieldAction } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-builder/builders/field/types/workspace-migration-field-action';

const CREATOR_CRM_SEARCH_SOURCE_FIELD_UNIVERSAL_IDENTIFIER_BY_OBJECT_UNIVERSAL_IDENTIFIER: Record<string, string> = {
  [MYAH_STANDARD_OBJECTS.creator.universalIdentifier]:
    MYAH_STANDARD_OBJECTS.creator.fields.name.universalIdentifier,
  [MYAH_STANDARD_OBJECTS.creatorList.universalIdentifier]:
    MYAH_STANDARD_OBJECTS.creatorList.fields.name.universalIdentifier,
  [MYAH_STANDARD_OBJECTS.campaign.universalIdentifier]:
    MYAH_STANDARD_OBJECTS.campaign.fields.name.universalIdentifier,
};

@RegisteredWorkspaceCommand('2.19.0', 1785240016000)
@Command({
  name: 'upgrade:2-19:synchronize-myah-creator-crm-search-metadata',
  description:
    'Synchronize Creator CRM search metadata for existing workspaces',
})
export class SynchronizeMyahCreatorCrmSearchMetadataCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    private readonly applicationService: ApplicationService,
    private readonly workspaceMigrationValidateBuildAndRunService: WorkspaceMigrationValidateBuildAndRunService,
    private readonly workspaceCacheService: WorkspaceCacheService,
    private readonly workspaceMigrationRunnerService: WorkspaceMigrationRunnerService,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace({
    workspaceId,
    options,
  }: RunOnWorkspaceArgs): Promise<void> {
    if (options.dryRun) {
      return;
    }

    const { twentyStandardFlatApplication } =
      await this.applicationService.findWorkspaceTwentyStandardAndCustomApplicationOrThrow(
        { workspaceId },
      );
    await this.workspaceCacheService.invalidateAndRecompute(workspaceId, [
      'flatFieldMetadataMaps',
      'flatSearchFieldMetadataMaps',
    ]);
    const { flatFieldMetadataMaps, flatSearchFieldMetadataMaps } =
      await this.workspaceCacheService.getOrRecompute(workspaceId, [
        'flatFieldMetadataMaps',
        'flatSearchFieldMetadataMaps',
      ]);
    const { allFlatEntityMaps } =
      computeTwentyStandardApplicationAllFlatEntityMaps({
        now: new Date().toISOString(),
        workspaceId,
        twentyStandardApplicationId: twentyStandardFlatApplication.id,
      });
    const existingSearchFieldMetadataKeys = new Set(
      Object.values(flatSearchFieldMetadataMaps.byUniversalIdentifier)
        .filter(isDefined)
        .map(
          ({
            objectMetadataUniversalIdentifier,
            fieldMetadataUniversalIdentifier,
          }) =>
            `${objectMetadataUniversalIdentifier}:${fieldMetadataUniversalIdentifier}`,
        ),
    );
    const missingSearchFieldMetadatas = Object.values(
      allFlatEntityMaps.flatSearchFieldMetadataMaps.byUniversalIdentifier,
    )
      .filter(isDefined)
      .filter(({ fieldMetadataUniversalIdentifier }) =>
        isDefined(
          flatFieldMetadataMaps.byUniversalIdentifier[
            fieldMetadataUniversalIdentifier
          ],
        ),
      )
      .filter(
        ({
          objectMetadataUniversalIdentifier,
          fieldMetadataUniversalIdentifier,
        }) =>
          isDefined(
            CREATOR_CRM_SEARCH_SOURCE_FIELD_UNIVERSAL_IDENTIFIER_BY_OBJECT_UNIVERSAL_IDENTIFIER[
              objectMetadataUniversalIdentifier
            ],
          ) &&
          !existingSearchFieldMetadataKeys.has(
            `${objectMetadataUniversalIdentifier}:${fieldMetadataUniversalIdentifier}`,
          ),
      );

    if (missingSearchFieldMetadatas.length === 0) {
      return;
    }

    const result =
      await this.workspaceMigrationValidateBuildAndRunService.validateBuildAndRunWorkspaceMigration(
        {
          workspaceId,
          applicationUniversalIdentifier:
            twentyStandardFlatApplication.universalIdentifier,
          isSystemBuild: true,
          allFlatEntityOperationByMetadataName: {
            searchFieldMetadata: {
              flatEntityToCreate: missingSearchFieldMetadatas,
              flatEntityToDelete: [],
              flatEntityToUpdate: [],
            },
          },
        },
      );

    if (result.status === 'fail') {
      throw new Error(
        `Failed to synchronize Creator CRM search metadata for workspace ${workspaceId}`,
      );
    }

    const creatorCrmTsVectorFlatFieldMetadatas = Object.values(
      allFlatEntityMaps.flatFieldMetadataMaps.byUniversalIdentifier,
    )
      .filter(isDefined)
      .filter(
        (flatFieldMetadata) =>
          flatFieldMetadata.type === FieldMetadataType.TS_VECTOR &&
          isDefined(
            flatFieldMetadataMaps.byUniversalIdentifier[
              CREATOR_CRM_SEARCH_SOURCE_FIELD_UNIVERSAL_IDENTIFIER_BY_OBJECT_UNIVERSAL_IDENTIFIER[
                flatFieldMetadata.objectMetadataUniversalIdentifier
              ]
            ],
          ),
      )

    await this.workspaceMigrationRunnerService.run({
      workspaceMigration: {
        applicationUniversalIdentifier:
          twentyStandardFlatApplication.universalIdentifier,
        actions: creatorCrmTsVectorFlatFieldMetadatas.map(
          (flatFieldMetadata): UniversalUpdateFieldAction => ({
            type: WORKSPACE_MIGRATION_ACTION_TYPE.update,
            metadataName: 'fieldMetadata',
            universalIdentifier: flatFieldMetadata.universalIdentifier,
            update: { universalSettings: null },
            rebuildSearchVector: true,
          }),
        ),
      },
      workspaceId,
    });

    await this.workspaceCacheService.invalidateAndRecompute(workspaceId, [
      'flatFieldMetadataMaps',
      'flatSearchFieldMetadataMaps',
    ]);
  }
}
