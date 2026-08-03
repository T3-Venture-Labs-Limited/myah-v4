import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import type { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { SynchronizeMyahCampaignInstructionsMetadataCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-workspace-command-1785497244000-synchronize-myah-campaign-instructions-metadata.command';
import type { SynchronizeSourceControlledMyahMetadataService } from 'src/database/commands/upgrade-version-command/2-19/services/synchronize-source-controlled-myah-metadata.service';
import type { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { getRegisteredWorkspaceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';

describe('SynchronizeMyahCampaignInstructionsMetadataCommand', () => {
  const args: RunOnWorkspaceArgs = {
    workspaceId: '20202020-0000-0000-0000-000000000001',
    options: { dryRun: false },
    index: 0,
    total: 1,
    dataSource: {} as never,
  };

  it('registers the Campaign Instructions metadata synchronization in the active version', () => {
    expect(
      getRegisteredWorkspaceCommandMetadata(
        SynchronizeMyahCampaignInstructionsMetadataCommand,
      ),
    ).toMatchObject({
      version: '2.19.0',
      timestamp: 1785497244000,
    });
  });

  it('delegates only Campaign Instructions metadata to the active source-controlled synchronizer', async () => {
    const synchronizeWorkspace = jest.fn().mockResolvedValue(undefined);
    const command = new SynchronizeMyahCampaignInstructionsMetadataCommand(
      {} as WorkspaceIteratorService,
      {
        synchronizeWorkspace,
      } as unknown as SynchronizeSourceControlledMyahMetadataService,
      {
        getOrRecompute: jest.fn().mockResolvedValue({
          flatObjectMetadataMaps: {
            byUniversalIdentifier: {
              [MYAH_STANDARD_OBJECTS.campaign.universalIdentifier]: {},
            },
          },
        }),
      } as unknown as WorkspaceCacheService,
    );

    await command.runOnWorkspace(args);

    expect(synchronizeWorkspace).toHaveBeenCalledWith(args, {
      fieldMetadata: new Set([
        MYAH_STANDARD_OBJECTS.campaign.fields.campaignBrief.universalIdentifier,
        MYAH_STANDARD_OBJECTS.campaign.fields.communicationGuidelines
          .universalIdentifier,
        MYAH_STANDARD_OBJECTS.campaign.fields.replyRules.universalIdentifier,
        MYAH_STANDARD_OBJECTS.campaign.fields.escalationBoundaries
          .universalIdentifier,
        MYAH_STANDARD_OBJECTS.campaign.fields.additionalNotes.universalIdentifier,
      ]),
      view: new Set([
        MYAH_STANDARD_OBJECTS.campaign.views.vieweb4da94a.universalIdentifier,
      ]),
      viewField: new Set(
        Object.values(
          MYAH_STANDARD_OBJECTS.campaign.views.vieweb4da94a.viewFields,
        ).map(({ universalIdentifier }) => universalIdentifier),
      ),
    });
  });

  it('skips Campaign Instructions synchronization when Campaign metadata is absent', async () => {
    const synchronizeWorkspace = jest.fn().mockResolvedValue(undefined);
    const getOrRecompute = jest.fn().mockResolvedValue({
      flatObjectMetadataMaps: {
        byUniversalIdentifier: {},
      },
    });
    const command = Reflect.construct(
      SynchronizeMyahCampaignInstructionsMetadataCommand,
      [
        {} as WorkspaceIteratorService,
        {
          synchronizeWorkspace,
        } as unknown as SynchronizeSourceControlledMyahMetadataService,
        {
          getOrRecompute,
        } as unknown as WorkspaceCacheService,
      ],
    ) as SynchronizeMyahCampaignInstructionsMetadataCommand;

    await command.runOnWorkspace(args);

    expect(getOrRecompute).toHaveBeenCalledWith(args.workspaceId, [
      'flatObjectMetadataMaps',
    ]);
    expect(synchronizeWorkspace).not.toHaveBeenCalled();
  });
});
