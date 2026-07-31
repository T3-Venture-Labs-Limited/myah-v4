import { Command } from 'nest-commander';
import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { SynchronizeSourceControlledMyahMetadataService } from 'src/database/commands/upgrade-version-command/2-19/services/synchronize-source-controlled-myah-metadata.service';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { MYAH_CREATOR_PAGE_LAYOUT_CONFIG } from 'src/engine/workspace-manager/twenty-standard-application/utils/page-layout/myah-brand-brain-page-layout.config';

const creatorPageLayoutTabs = Object.values(
  MYAH_CREATOR_PAGE_LAYOUT_CONFIG.tabs,
);
const creatorRecordPageFieldsView =
  MYAH_STANDARD_OBJECTS.creator.views.creatorRecordPageFields;
const creatorRecordPageFieldsViewFieldUniversalIdentifiers = new Set(
  Object.values(creatorRecordPageFieldsView.viewFields).map(
    ({ universalIdentifier }) => universalIdentifier,
  ),
);
const creatorNativeRelationFieldMetadataUniversalIdentifiers = new Set([
  '5e98bbca-0761-5945-bbe6-c441e3fb831b',
  '81c0d29d-abc3-5b58-a15d-e573ea52de57',
  '68ea5fd3-32b0-542f-ae42-9162331b53e8',
  '179b4088-ecec-5113-8397-5b85ffd3d542',
]);

@RegisteredWorkspaceCommand('2.19.0', 1785470249827)
@Command({
  name: 'upgrade:2-19:synchronize-myah-creator-page-layout-metadata',
  description: 'Synchronize Creator page layout metadata for existing workspaces',
})
export class SynchronizeMyahCreatorPageLayoutMetadataCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    private readonly synchronizeSourceControlledMyahMetadataService: SynchronizeSourceControlledMyahMetadataService,
  ) {
    super(workspaceIteratorService);
  }

  override runOnWorkspace(args: RunOnWorkspaceArgs): Promise<void> {
    return this.synchronizeSourceControlledMyahMetadataService.synchronizeWorkspace(
      args,
      {
        fieldMetadata: creatorNativeRelationFieldMetadataUniversalIdentifiers,
        view: new Set([creatorRecordPageFieldsView.universalIdentifier]),
        viewField: creatorRecordPageFieldsViewFieldUniversalIdentifiers,
        pageLayout: new Set([
          MYAH_CREATOR_PAGE_LAYOUT_CONFIG.universalIdentifier,
        ]),
        pageLayoutTab: new Set(
          creatorPageLayoutTabs.map(({ universalIdentifier }) =>
            universalIdentifier,
          ),
        ),
        pageLayoutWidget: new Set(
          creatorPageLayoutTabs.flatMap(({ widgets }) =>
            Object.values(widgets).map(({ universalIdentifier }) =>
              universalIdentifier,
            ),
          ),
        ),
      },
    );
  }
}
