import { Command } from 'nest-commander';
import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { SynchronizeSourceControlledMyahMetadataService } from 'src/database/commands/upgrade-version-command/2-19/services/synchronize-source-controlled-myah-metadata.service';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { MYAH_CREATOR_LIST_PAGE_LAYOUT_CONFIG } from 'src/engine/workspace-manager/twenty-standard-application/utils/page-layout/myah-brand-brain-page-layout.config';

const creatorListPageLayoutTabs = Object.values(
  MYAH_CREATOR_LIST_PAGE_LAYOUT_CONFIG.tabs,
);
const creatorListPageLayoutWidgets = new Set(
  creatorListPageLayoutTabs.flatMap(({ widgets }) =>
    Object.values(widgets).map(
      ({ universalIdentifier }) => universalIdentifier,
    ),
  ),
);

@RegisteredWorkspaceCommand('2.19.0', 1786155607567)
@Command({
  name: 'upgrade:2-19:synchronize-myah-creator-list-page-layout',
  description: 'Synchronize Creator List record page layout metadata',
})
export class SynchronizeMyahCreatorListPageLayoutCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    workspaceIteratorService: WorkspaceIteratorService,
    private readonly synchronizer: SynchronizeSourceControlledMyahMetadataService,
    private readonly workspaceCacheService: WorkspaceCacheService,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace(args: RunOnWorkspaceArgs): Promise<void> {
    if (args.dataSource === undefined) {
      return;
    }

    const { flatObjectMetadataMaps } =
      await this.workspaceCacheService.getOrRecompute(args.workspaceId, [
        'flatObjectMetadataMaps',
      ]);

    if (
      flatObjectMetadataMaps.byUniversalIdentifier[
        MYAH_STANDARD_OBJECTS.creatorList.universalIdentifier
      ] === undefined
    ) {
      return;
    }

    await this.synchronizer.synchronizeWorkspace(
      args,
      {
        pageLayout: new Set([
          MYAH_CREATOR_LIST_PAGE_LAYOUT_CONFIG.universalIdentifier,
        ]),
        pageLayoutTab: new Set(
          creatorListPageLayoutTabs.map(
            ({ universalIdentifier }) => universalIdentifier,
          ),
        ),
        pageLayoutWidget: creatorListPageLayoutWidgets,
      },
      { synchronizeExistingSelectedMetadata: true },
    );
  }
}
