import { Command } from 'nest-commander';
import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';


import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { SynchronizeMyahStandardMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1784266302001-synchronize-myah-standard-metadata.command';
import {
  MigrateMyahCreatorSocialLinksService,
  OBSOLETE_SOURCE_CONTROLLED_CREATOR_VIEW_FIELD_UNIVERSAL_IDENTIFIERS,
} from 'src/database/commands/upgrade-version-command/2-20/services/migrate-myah-creator-social-links.service';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';

const CREATOR_IMPORT_SYNC_OPTIONS = {
  targetObjectUniversalIdentifiers: new Set([
    MYAH_STANDARD_OBJECTS.creator.universalIdentifier,
  ]),
  migrateLegacyMyahApplication: false,
};

@RegisteredWorkspaceCommand('2.19.0', 1785283200000)
@Command({
  name: 'upgrade:2-19:migrate-myah-creator-import-metadata',
  description:
    'Migrate Myah Creator social links and import metadata for existing workspaces',
})
export class MigrateMyahCreatorImportMetadataCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    private readonly synchronizeMyahStandardMetadataCommand: SynchronizeMyahStandardMetadataCommand,
    private readonly migrateMyahCreatorSocialLinksService: MigrateMyahCreatorSocialLinksService,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace(args: RunOnWorkspaceArgs): Promise<void> {
    if (args.dataSource === undefined) {
      return;
    }

    await this.synchronizeMyahStandardMetadataCommand.synchronizeWorkspace(
      args,
      CREATOR_IMPORT_SYNC_OPTIONS,
    );

    const { canDeleteOldFields } =
      await this.migrateMyahCreatorSocialLinksService.migrate({
        workspaceId: args.workspaceId,
        workspaceDataSource: args.dataSource,
        dryRun: args.options.dryRun === true,
      });

    if (!canDeleteOldFields) {
      throw new Error(
        `Creator social link migration verification failed for workspace ${args.workspaceId}`,
      );
    }

    if (args.options.dryRun) {
      return;
    }

    await this.synchronizeMyahStandardMetadataCommand.synchronizeWorkspace(
      args,
      {
        ...CREATOR_IMPORT_SYNC_OPTIONS,
        explicitObsoleteUniversalIdentifiersByMetadataName: {
          viewField:
            OBSOLETE_SOURCE_CONTROLLED_CREATOR_VIEW_FIELD_UNIVERSAL_IDENTIFIERS,
        },
      },
    );
  }
}
