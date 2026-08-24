import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import type { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { RemoveMyahCampaignCreatorListsWidgetCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1787298665000-remove-myah-campaign-creator-lists-widget.command';
import type { SynchronizeSourceControlledMyahMetadataService } from 'src/database/commands/upgrade-version-command/2-19/services/synchronize-source-controlled-myah-metadata.service';
import { getRegisteredWorkspaceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import type { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';

const args: RunOnWorkspaceArgs = {
  workspaceId: '20202020-0000-0000-0000-000000000001',
  options: { dryRun: false },
  index: 0,
  total: 1,
};

const createCommand = ({
  campaignExists = true,
  synchronizeWorkspace = jest.fn().mockResolvedValue(undefined),
}: {
  campaignExists?: boolean;
  synchronizeWorkspace?: jest.Mock;
} = {}) => {
  const getOrRecompute = jest.fn().mockResolvedValue({
    flatObjectMetadataMaps: {
      byUniversalIdentifier: campaignExists
        ? { [MYAH_STANDARD_OBJECTS.campaign.universalIdentifier]: {} }
        : {},
    },
  });

  return {
    command: new RemoveMyahCampaignCreatorListsWidgetCommand(
      {} as WorkspaceIteratorService,
      { synchronizeWorkspace } as unknown as SynchronizeSourceControlledMyahMetadataService,
      { getOrRecompute } as unknown as WorkspaceCacheService,
    ),
    getOrRecompute,
    synchronizeWorkspace,
  };
};

describe('RemoveMyahCampaignCreatorListsWidgetCommand', () => {
  it('registers the removal in the active version', () => {
    expect(
      getRegisteredWorkspaceCommandMetadata(
        RemoveMyahCampaignCreatorListsWidgetCommand,
      ),
    ).toMatchObject({ version: '2.20.0', timestamp: 1787298665000 });
  });

  it('deletes only the retired Creator Lists widget', async () => {
    const { command, synchronizeWorkspace } = createCommand();
    const argsWithDataSource = { ...args, dataSource: {} as never };

    await command.runOnWorkspace(argsWithDataSource);

    expect(synchronizeWorkspace).toHaveBeenCalledWith(
      argsWithDataSource,
      {},
      {
        synchronizeExistingSelectedMetadata: true,
        deletionSelection: {
          pageLayoutWidget: new Set([
            'a4f1aa45-0be4-4c75-bd2a-0f3a1d75d46c',
          ]),
        },
      },
    );
  });

  it('does not synchronize when Campaign metadata is absent', async () => {
    const { command, getOrRecompute, synchronizeWorkspace } = createCommand({
      campaignExists: false,
    });
    const argsWithDataSource = { ...args, dataSource: {} as never };

    await command.runOnWorkspace(argsWithDataSource);

    expect(getOrRecompute).toHaveBeenCalledWith(args.workspaceId, [
      'flatObjectMetadataMaps',
    ]);
    expect(synchronizeWorkspace).not.toHaveBeenCalled();
  });
});
