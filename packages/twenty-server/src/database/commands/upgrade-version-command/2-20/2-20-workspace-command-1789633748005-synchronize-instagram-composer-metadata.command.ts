import { Command } from 'nest-commander';
import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { isDefined } from 'twenty-shared/utils';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { SynchronizeMyahStandardMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1784266302001-synchronize-myah-standard-metadata.command';
import { ApplicationService } from 'src/engine/core-modules/application/application.service';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { STANDARD_COMMAND_MENU_ITEMS } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-command-menu-item.constant';
import { computeTwentyStandardApplicationAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/utils/twenty-standard-application-all-flat-entity-maps.constant';
import { WorkspaceMigrationValidateBuildAndRunService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service';

@RegisteredWorkspaceCommand('2.20.0', 1789633748005)
@Command({
  name: 'upgrade:2-20:synchronize-instagram-composer-metadata',
  description: 'Install the Instagram command and Creator search metadata',
})
export class SynchronizeInstagramComposerMetadataCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    private readonly applicationService: ApplicationService,
    private readonly workspaceMigrationValidateBuildAndRunService: WorkspaceMigrationValidateBuildAndRunService,
    private readonly workspaceCacheService: WorkspaceCacheService,
    private readonly synchronizeMyahStandardMetadataCommand: SynchronizeMyahStandardMetadataCommand,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace({
    workspaceId,
    options,
  }: RunOnWorkspaceArgs): Promise<void> {
    if (
      !(await this.synchronizeMyahStandardMetadataCommand.workspaceSchemaExists(
        workspaceId,
      ))
    )
      return;
    const { twentyStandardFlatApplication } =
      await this.applicationService.findWorkspaceTwentyStandardAndCustomApplicationOrThrow(
        { workspaceId },
      );
    const { flatSearchFieldMetadataMaps, flatCommandMenuItemMaps } =
      await this.workspaceCacheService.getOrRecompute(workspaceId, [
        'flatSearchFieldMetadataMaps',
        'flatCommandMenuItemMaps',
      ]);
    const { allFlatEntityMaps } =
      computeTwentyStandardApplicationAllFlatEntityMaps({
        now: new Date().toISOString(),
        workspaceId,
        twentyStandardApplicationId: twentyStandardFlatApplication.id,
      });
    const existingSearchKeys = new Set(
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
    const missingSearchFields = Object.values(
      allFlatEntityMaps.flatSearchFieldMetadataMaps.byUniversalIdentifier,
    )
      .filter(isDefined)
      .filter(
        ({
          objectMetadataUniversalIdentifier,
          fieldMetadataUniversalIdentifier,
        }) =>
          objectMetadataUniversalIdentifier ===
            MYAH_STANDARD_OBJECTS.creator.universalIdentifier &&
          !existingSearchKeys.has(
            `${objectMetadataUniversalIdentifier}:${fieldMetadataUniversalIdentifier}`,
          ),
      );
    const missingCommands = Object.values(
      allFlatEntityMaps.flatCommandMenuItemMaps.byUniversalIdentifier,
    )
      .filter(isDefined)
      .filter(
        ({ universalIdentifier }) =>
          universalIdentifier ===
            STANDARD_COMMAND_MENU_ITEMS.messageOnInstagram
              .universalIdentifier &&
          !isDefined(
            flatCommandMenuItemMaps.byUniversalIdentifier[universalIdentifier],
          ),
      );
    if (
      options.dryRun ||
      (missingCommands.length === 0 && missingSearchFields.length === 0)
    )
      return;
    // App-owned draft installation is a separate rollout gate, never part of this upgrade.
    const result =
      await this.workspaceMigrationValidateBuildAndRunService.validateBuildAndRunWorkspaceMigration(
        {
          workspaceId,
          applicationUniversalIdentifier:
            twentyStandardFlatApplication.universalIdentifier,
          isSystemBuild: true,
          allFlatEntityOperationByMetadataName: {
            commandMenuItem: {
              flatEntityToCreate: missingCommands,
              flatEntityToUpdate: [],
              flatEntityToDelete: [],
            },
            searchFieldMetadata: {
              flatEntityToCreate: missingSearchFields,
              flatEntityToUpdate: [],
              flatEntityToDelete: [],
            },
          },
        },
      );
    if (result.status === 'fail')
      throw new Error(
        `Failed to synchronize Instagram composer metadata for workspace ${workspaceId}`,
      );
  }
}
