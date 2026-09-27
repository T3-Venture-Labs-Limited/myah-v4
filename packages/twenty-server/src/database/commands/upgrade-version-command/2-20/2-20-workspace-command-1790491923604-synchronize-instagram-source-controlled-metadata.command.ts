import { Command } from 'nest-commander';

import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { SynchronizeMyahStandardMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1784266302001-synchronize-myah-standard-metadata.command';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';

const LEGACY_INSTAGRAM_APPLICATION_UNIVERSAL_IDENTIFIER =
  '4738ebcd-6662-4ecc-a190-374fa0525951';

const INSTAGRAM_OBJECT_UNIVERSAL_IDENTIFIERS = new Set<string>([
  MYAH_STANDARD_OBJECTS.myahInstagramAccount.universalIdentifier,
  MYAH_STANDARD_OBJECTS.myahSocialConversation.universalIdentifier,
  MYAH_STANDARD_OBJECTS.myahSocialMessage.universalIdentifier,
  MYAH_STANDARD_OBJECTS.myahInstagramReplyDraft.universalIdentifier,
]);

@RegisteredWorkspaceCommand('2.20.0', 1790491923604)
@Command({
  name: 'upgrade:2-20:synchronize-instagram-source-controlled-metadata',
  description:
    'Synchronize and safely adopt source-controlled Instagram metadata',
})
export class SynchronizeInstagramSourceControlledMetadataCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    private readonly synchronizeMyahStandardMetadataCommand: SynchronizeMyahStandardMetadataCommand,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace(args: RunOnWorkspaceArgs): Promise<void> {
    await this.synchronizeMyahStandardMetadataCommand.synchronizeWorkspace(
      args,
      {
        targetObjectUniversalIdentifiers: INSTAGRAM_OBJECT_UNIVERSAL_IDENTIFIERS,
        additionalAvailableObjectUniversalIdentifiers: new Set([
          MYAH_STANDARD_OBJECTS.creator.universalIdentifier,
        ]),
        migrateLegacyMyahApplication: false,
        legacyInstagramApplicationUniversalIdentifier:
          LEGACY_INSTAGRAM_APPLICATION_UNIVERSAL_IDENTIFIER,
      },
    );
  }
}
