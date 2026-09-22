import { Command } from 'nest-commander';
import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { SynchronizeMyahStandardMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1784266302001-synchronize-myah-standard-metadata.command';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';

export const RETIRED_BRAND_BRAIN_OBJECT_UNIVERSAL_IDENTIFIERS = new Set([
  MYAH_STANDARD_OBJECTS.brandBrainPage.universalIdentifier,
  MYAH_STANDARD_OBJECTS.brandBrainLink.universalIdentifier,
  MYAH_STANDARD_OBJECTS.brandBrainUpdateProposal.universalIdentifier,
]);

// Existing views remain as recovery metadata because Link and Update Proposal each
// require a view. Object and role flags make all three objects non-authorable.
export const RETIRED_BRAND_BRAIN_PRESENTATION_UNIVERSAL_IDENTIFIERS = {
  navigationMenuItem: new Set(['43f7a291-b0a4-481d-a5e4-b557e1a8f65d']),
  pageLayout: new Set(['c8e159f8-1815-4138-9203-c29f59703386']),
  pageLayoutTab: new Set([
    '221532a5-ac54-4a46-ae75-88e095f4633f',
    '74e295f0-ea2e-4c47-b1b4-6d9a77f8ebc9',
    '14a3d605-51dc-4197-99b6-1f8415316ac1',
  ]),
  pageLayoutWidget: new Set([
    'ca066d67-d7a5-4951-9674-8a25d5710387',
    '10aef0fb-a7dd-49d2-b818-5f167ba29091',
    '8c7fb069-9866-4333-895b-5e5ad5d2d835',
  ]),
} as const;

@RegisteredWorkspaceCommand('2.20.0', 1790000000410)
@Command({
  name: 'upgrade:2-20:retire-brand-brain-metadata',
  description:
    'Make preserved Brand Brain content read-only and remove its presentation metadata',
})
export class RetireBrandBrainMetadataCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    workspaceIteratorService: WorkspaceIteratorService,
    private readonly standardMetadataCommand: SynchronizeMyahStandardMetadataCommand,
  ) {
    super(workspaceIteratorService);
  }

  override runOnWorkspace(args: RunOnWorkspaceArgs): Promise<void> {
    return this.standardMetadataCommand.synchronizeWorkspace(args, {
      targetObjectUniversalIdentifiers:
        RETIRED_BRAND_BRAIN_OBJECT_UNIVERSAL_IDENTIFIERS,
      migrateLegacyMyahApplication: false,
      explicitObsoleteUniversalIdentifiersByMetadataName:
        RETIRED_BRAND_BRAIN_PRESENTATION_UNIVERSAL_IDENTIFIERS,
    });
  }
}
