import { Command } from 'nest-commander';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { buildOrphanedObjectNavigationCommandRepairPlan } from 'src/database/commands/upgrade-version-command/2-20/utils/build-orphaned-object-navigation-command-repair-plan.util';
import { ApplicationService } from 'src/engine/core-modules/application/application.service';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { isObjectMetadataCommandMenuItemPayload } from 'src/engine/metadata-modules/command-menu-item/utils/is-object-metadata-command-menu-item-payload.util';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { WorkspaceMigrationBuilderException } from 'src/engine/workspace-manager/workspace-migration/exceptions/workspace-migration-builder-exception';
import { WorkspaceMigrationValidateBuildAndRunService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service';

@RegisteredWorkspaceCommand('2.20.0', 1788766265947)
@Command({
  name: 'upgrade:2-20:repair-orphaned-object-navigation-commands',
  description: 'Repair orphaned standard object-navigation command payloads',
})
export class RepairOrphanedObjectNavigationCommandsCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    workspaceIteratorService: WorkspaceIteratorService,
    private readonly applicationService: ApplicationService,
    private readonly workspaceCacheService: WorkspaceCacheService,
    private readonly workspaceMigrationValidateBuildAndRunService: WorkspaceMigrationValidateBuildAndRunService,
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
    const { flatObjectMetadataMaps, flatCommandMenuItemMaps } =
      await this.workspaceCacheService.getOrRecompute(workspaceId, [
        'flatObjectMetadataMaps',
        'flatCommandMenuItemMaps',
      ]);
    const { operations, unclassifiedOrphanCommandUniversalIdentifiers } =
      buildOrphanedObjectNavigationCommandRepairPlan({
        flatObjectMetadataMaps,
        flatCommandMenuItemMaps,
        twentyStandardApplicationId: twentyStandardFlatApplication.id,
      });

    if (unclassifiedOrphanCommandUniversalIdentifiers.length > 0) {
      this.logger.error(
        JSON.stringify({
          event: 'object-navigation-repair.unclassified',
          workspaceId,
          count: unclassifiedOrphanCommandUniversalIdentifiers.length,
          commandUniversalIdentifiers:
            unclassifiedOrphanCommandUniversalIdentifiers,
        }),
      );
      throw new Error(
        `Unclassified orphaned object-navigation commands for workspace ${workspaceId}`,
      );
    }

    if (
      operations.flatEntityToUpdate.length +
        operations.flatEntityToDelete.length ===
      0
    ) {
      this.logger.log(
        `No orphaned object-navigation commands to repair for workspace ${workspaceId}`,
      );
      return;
    }

    const result =
      await this.workspaceMigrationValidateBuildAndRunService.validateBuildAndRunWorkspaceMigration(
        {
          workspaceId,
          applicationUniversalIdentifier:
            twentyStandardFlatApplication.universalIdentifier,
          isSystemBuild: true,
          dryRun: options.dryRun,
          allFlatEntityOperationByMetadataName: { commandMenuItem: operations },
        },
      );

    if (result.status === 'fail') {
      throw new WorkspaceMigrationBuilderException(
        result,
        `Failed to repair orphaned object-navigation commands for workspace ${workspaceId}`,
      );
    }

    if (options.dryRun) {
      const actions = result.workspaceMigration.actions.map((action) => {
        const payload =
          action.metadataName === 'commandMenuItem'
            ? action.type === 'update'
              ? action.update.payload
              : action.type === 'create'
                ? action.flatEntity.payload
                : undefined
            : undefined;

        return {
          type: action.type,
          metadataName: action.metadataName,
          universalIdentifier:
            action.type === 'create'
              ? action.flatEntity.universalIdentifier
              : action.universalIdentifier,
          objectMetadataItemId: isObjectMetadataCommandMenuItemPayload(payload)
            ? payload.objectMetadataItemId
            : null,
        };
      });

      this.logger.log(
        JSON.stringify({
          event: 'object-navigation-repair.validated-dry-run',
          workspaceId,
          actions,
        }),
      );
    }
  }
}
