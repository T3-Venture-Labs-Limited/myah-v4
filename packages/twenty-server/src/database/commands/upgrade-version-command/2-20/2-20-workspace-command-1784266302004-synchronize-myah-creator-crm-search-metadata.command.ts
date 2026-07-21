import { Command } from 'nest-commander';
import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { isDefined } from 'twenty-shared/utils';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { ApplicationService } from 'src/engine/core-modules/application/application.service';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { computeTwentyStandardApplicationAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/utils/twenty-standard-application-all-flat-entity-maps.constant';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { WorkspaceMigrationValidateBuildAndRunService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service';

const IS_CREATOR_CRM_OBJECT_BY_UNIVERSAL_IDENTIFIER: Record<string, true> = {
  [MYAH_STANDARD_OBJECTS.creator.universalIdentifier]: true,
  [MYAH_STANDARD_OBJECTS.creatorList.universalIdentifier]: true,
  [MYAH_STANDARD_OBJECTS.campaign.universalIdentifier]: true,
};

@RegisteredWorkspaceCommand('2.20.0', 1784266302004)
@Command({
  name: 'upgrade:2-20:synchronize-myah-creator-crm-search-metadata',
  description:
    'Synchronize Creator CRM search metadata for existing workspaces',
})
export class SynchronizeMyahCreatorCrmSearchMetadataCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    private readonly applicationService: ApplicationService,
    private readonly workspaceMigrationValidateBuildAndRunService: WorkspaceMigrationValidateBuildAndRunService,
    private readonly workspaceCacheService: WorkspaceCacheService,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace({
    workspaceId,
    options,
  }: RunOnWorkspaceArgs): Promise<void> {
    const { twentyStandardFlatApplication } =
      await this.applicationService.findWorkspaceTwentyStandardAndCustomApplicationOrThrow(
        { workspaceId },
      );
    const { flatSearchFieldMetadataMaps } =
      await this.workspaceCacheService.getOrRecompute(workspaceId, [
        'flatSearchFieldMetadataMaps',
      ]);
    const { allFlatEntityMaps } =
      computeTwentyStandardApplicationAllFlatEntityMaps({
        now: new Date().toISOString(),
        workspaceId,
        twentyStandardApplicationId: twentyStandardFlatApplication.id,
      });
    const existingSearchFieldMetadataKeys = new Set(
      Object.values(
        flatSearchFieldMetadataMaps.byUniversalIdentifier,
      )
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
      .filter(
        ({
          objectMetadataUniversalIdentifier,
          fieldMetadataUniversalIdentifier,
        }) =>
          IS_CREATOR_CRM_OBJECT_BY_UNIVERSAL_IDENTIFIER[
            objectMetadataUniversalIdentifier
          ] === true &&
          !existingSearchFieldMetadataKeys.has(
            `${objectMetadataUniversalIdentifier}:${fieldMetadataUniversalIdentifier}`,
          ),
      );

    if (missingSearchFieldMetadatas.length === 0) {
      return;
    }

    if (options.dryRun) {
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
  }
}
