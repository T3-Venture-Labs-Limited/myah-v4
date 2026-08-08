import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import type { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { SynchronizeMyahCampaignAudienceCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-workspace-command-1786149961997-synchronize-myah-campaign-audience.command';
import { SynchronizeMyahCreatorListPageLayoutCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-workspace-command-1786155607567-synchronize-myah-creator-list-page-layout.command';
import type { SynchronizeSourceControlledMyahMetadataService } from 'src/database/commands/upgrade-version-command/2-19/services/synchronize-source-controlled-myah-metadata.service';
import { getRegisteredWorkspaceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import type { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { MYAH_CREATOR_LIST_PAGE_LAYOUT_CONFIG } from 'src/engine/workspace-manager/twenty-standard-application/utils/page-layout/myah-brand-brain-page-layout.config';

const args: RunOnWorkspaceArgs = {
  workspaceId: '20202020-0000-0000-0000-000000000001',
  options: { dryRun: false },
  index: 0,
  total: 1,
  dataSource: {} as never,
};

const buildCommand = ({
  creatorListExists = true,
}: {
  creatorListExists?: boolean;
} = {}) => {
  const synchronizeWorkspace = jest.fn().mockResolvedValue(undefined);
  const getOrRecompute = jest.fn().mockResolvedValue({
    flatObjectMetadataMaps: {
      byUniversalIdentifier: creatorListExists
        ? { [MYAH_STANDARD_OBJECTS.creatorList.universalIdentifier]: {} }
        : {},
    },
  });
  const command = new SynchronizeMyahCreatorListPageLayoutCommand(
    {} as WorkspaceIteratorService,
    {
      synchronizeWorkspace,
    } as unknown as SynchronizeSourceControlledMyahMetadataService,
    { getOrRecompute } as unknown as WorkspaceCacheService,
  );

  return { command, getOrRecompute, synchronizeWorkspace };
};

describe('SynchronizeMyahCreatorListPageLayoutCommand', () => {
  it('preserves the audience command and registers a distinct layout command', () => {
    expect(
      getRegisteredWorkspaceCommandMetadata(
        SynchronizeMyahCampaignAudienceCommand,
      ),
    ).toMatchObject({ version: '2.19.0', timestamp: 1786149961997 });
    expect(
      getRegisteredWorkspaceCommandMetadata(
        SynchronizeMyahCreatorListPageLayoutCommand,
      ),
    ).toMatchObject({ version: '2.19.0', timestamp: 1786155607567 });
  });

  it('synchronizes only the Creator List page layout contract', async () => {
    const { command, synchronizeWorkspace } = buildCommand();
    const tabs = Object.values(MYAH_CREATOR_LIST_PAGE_LAYOUT_CONFIG.tabs);

    await command.runOnWorkspace(args);

    expect(synchronizeWorkspace).toHaveBeenCalledWith(
      args,
      {
        pageLayout: new Set([
          MYAH_CREATOR_LIST_PAGE_LAYOUT_CONFIG.universalIdentifier,
        ]),
        pageLayoutTab: new Set(
          tabs.map(({ universalIdentifier }) => universalIdentifier),
        ),
        pageLayoutWidget: new Set(
          tabs.flatMap(({ widgets }) =>
            Object.values(widgets).map(
              ({ universalIdentifier }) => universalIdentifier,
            ),
          ),
        ),
      },
      { synchronizeExistingSelectedMetadata: true },
    );
  });

  it('skips synchronization when Creator List metadata is absent', async () => {
    const { command, getOrRecompute, synchronizeWorkspace } = buildCommand({
      creatorListExists: false,
    });

    await command.runOnWorkspace(args);

    expect(getOrRecompute).toHaveBeenCalledWith(args.workspaceId, [
      'flatObjectMetadataMaps',
    ]);
    expect(synchronizeWorkspace).not.toHaveBeenCalled();
  });

  it('skips synchronization without a workspace data source', async () => {
    const { command, getOrRecompute, synchronizeWorkspace } = buildCommand();

    await command.runOnWorkspace({ ...args, dataSource: undefined });

    expect(getOrRecompute).not.toHaveBeenCalled();
    expect(synchronizeWorkspace).not.toHaveBeenCalled();
  });
});
