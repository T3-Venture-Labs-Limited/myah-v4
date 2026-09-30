import { Command } from 'nest-commander';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { ApplicationService } from 'src/engine/core-modules/application/application.service';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { WorkspaceMigrationValidateBuildAndRunService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service';
import { STANDARD_COMMAND_MENU_ITEMS } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-command-menu-item.constant';

const LEGACY_INSTAGRAM_AVAILABILITY =
  'permissionFlags.SEND_INSTAGRAM_FIRST_MESSAGE_TOOL or permissionFlags.SEND_INSTAGRAM_REPLY_TOOL';
const outreachDefaults = [
  [STANDARD_COMMAND_MENU_ITEMS.composeEmail, 46],
  [STANDARD_COMMAND_MENU_ITEMS.messageOnInstagram, 68],
  [STANDARD_COMMAND_MENU_ITEMS.composeCampaign, 66],
] as const;

@RegisteredWorkspaceCommand('2.20.0', 1790553600427)
@Command({
  name: 'upgrade:2-20:prioritize-outreach-compose',
  description: 'Prioritize default manual outreach commands in existing workspaces',
})
export class PrioritizeOutreachComposeWorkspaceCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
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
    const { flatCommandMenuItemMaps } =
      await this.workspaceCacheService.getOrRecompute(workspaceId, [
        'flatCommandMenuItemMaps',
      ]);
    const updates = outreachDefaults.flatMap(([definition, oldPosition]) => {
      const existing =
        flatCommandMenuItemMaps.byUniversalIdentifier[
          definition.universalIdentifier
        ];
      if (
        !existing ||
        existing.applicationId !== twentyStandardFlatApplication.id
      )
        return [];
      const position =
        existing.position === oldPosition
          ? definition.position
          : existing.position;
      const conditionalAvailabilityExpression =
        definition === STANDARD_COMMAND_MENU_ITEMS.messageOnInstagram &&
        existing.conditionalAvailabilityExpression ===
          LEGACY_INSTAGRAM_AVAILABILITY
          ? null
          : existing.conditionalAvailabilityExpression;
      return position === existing.position &&
        conditionalAvailabilityExpression ===
          existing.conditionalAvailabilityExpression
        ? []
        : [
            {
              ...existing,
              position,
              conditionalAvailabilityExpression,
              updatedAt: new Date().toISOString(),
            },
          ];
    });
    if (updates.length === 0 || options.dryRun) return;
    const result =
      await this.workspaceMigrationValidateBuildAndRunService.validateBuildAndRunWorkspaceMigration(
        {
          workspaceId,
          applicationUniversalIdentifier:
            twentyStandardFlatApplication.universalIdentifier,
          isSystemBuild: true,
          allFlatEntityOperationByMetadataName: {
            commandMenuItem: {
              flatEntityToCreate: [],
              flatEntityToUpdate: updates,
              flatEntityToDelete: [],
            },
          },
        },
      );
    if (result.status === 'fail')
      throw new Error(
        `Failed to prioritize outreach compose for workspace ${workspaceId}`,
      );
  }
}
