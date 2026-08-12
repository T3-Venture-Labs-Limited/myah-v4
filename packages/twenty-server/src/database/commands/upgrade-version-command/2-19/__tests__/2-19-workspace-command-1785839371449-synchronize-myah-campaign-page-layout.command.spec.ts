import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import type { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { SynchronizeMyahCampaignPageLayoutCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-workspace-command-1785839371449-synchronize-myah-campaign-page-layout.command';
import type { SynchronizeSourceControlledMyahMetadataService } from 'src/database/commands/upgrade-version-command/2-19/services/synchronize-source-controlled-myah-metadata.service';
import { getRegisteredWorkspaceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import type { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';

describe('SynchronizeMyahCampaignPageLayoutCommand', () => {
  const args: RunOnWorkspaceArgs = {
    workspaceId: '20202020-0000-0000-0000-000000000001',
    options: { dryRun: false },
    index: 0,
    total: 1,
    dataSource: {} as never,
  };

  it('registers the Campaign page-layout synchronization in the active version', () => {
    expect(
      getRegisteredWorkspaceCommandMetadata(
        SynchronizeMyahCampaignPageLayoutCommand,
      ),
    ).toMatchObject({ version: '2.19.0', timestamp: 1785839371449 });
  });

  it('materializes the Campaign page layout before its child metadata', async () => {
    const synchronizeWorkspace = jest.fn().mockResolvedValue(undefined);
    const command = new SynchronizeMyahCampaignPageLayoutCommand(
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
    const expectedChildSelection = {
      pageLayoutTab: [
        '8482a6bc-bc2a-4f2d-8296-6d951f681c4f',
        '37c7d06e-5dc5-4e9e-938e-7fbaa7daf3d0',
        'cd78ad8c-883a-4ce1-9b74-526adadb751d',
        '0d213a1a-e001-496c-970e-e692968cf17c',
        '8d749a63-24d8-481b-9a10-d98d9b959db1',
        'a62c90d6-08dc-4f2c-9b06-c7c10d3d12ba',
      ].sort(),
      pageLayoutWidget: [
        '6845e3c3-3a1a-42d8-afcd-71ff885c8f20',
        'e81ab303-f402-45df-8257-d91172ecc435',
        '9a05fd06-cf91-47a2-bbee-06cb4292f44d',
        '23f43b7f-5d8b-4fa8-ba79-9b39ea1ca392',
        'cdb1ad36-fcd3-4c6d-9b64-1df8d1c02a80',
        'c8e6d1ae-8fa4-43df-95b4-94009c524632',
      ].sort(),
      view: [
        '6bfee1b9-d36a-4e41-9fc6-d413b4e8b746',
        'eb4da94a-d3da-4354-bb39-7478ac12bd35',
        '9c4f90c5-2a03-436b-8130-93d50a4d0e3e',
      ].sort(),
      viewField: [
        ...Object.values(
          MYAH_STANDARD_OBJECTS.campaign.views.view6bfee1b9.viewFields,
        ).map(({ universalIdentifier }) => universalIdentifier),
        ...Object.values(
          MYAH_STANDARD_OBJECTS.campaign.views.vieweb4da94a.viewFields,
        ).map(({ universalIdentifier }) => universalIdentifier),
        ...Object.values(
          MYAH_STANDARD_OBJECTS.campaign.views.view9c4f90c5.viewFields,
        ).map(({ universalIdentifier }) => universalIdentifier),
      ].sort(),
    };
    const expectedMaterializationSelection = {
      pageLayout: ['ad261155-3c89-436d-8898-3e52d8b37632'].sort(),
      ...expectedChildSelection,
    };
    const expectedCompleteSelection = expectedMaterializationSelection;

    await command.runOnWorkspace(args);

    expect(synchronizeWorkspace).toHaveBeenCalledTimes(2);

    const [materializeLayoutCall, synchronizeCompleteLayoutCall] =
      synchronizeWorkspace.mock.calls;
    expect(materializeLayoutCall).toHaveLength(2);
    expect(materializeLayoutCall[0]).toBe(args);
    expect(
      Object.fromEntries(
        Object.entries(materializeLayoutCall[1]).map(
          ([type, universalIdentifiers]) => [
            type,
            [...(universalIdentifiers as Set<string>)].sort(),
          ],
        ),
      ),
    ).toEqual(expectedMaterializationSelection);

    expect(synchronizeCompleteLayoutCall).toHaveLength(3);
    expect(synchronizeCompleteLayoutCall[0]).toBe(args);
    expect(
      Object.fromEntries(
        Object.entries(synchronizeCompleteLayoutCall[1]).map(
          ([type, universalIdentifiers]) => [
            type,
            [...(universalIdentifiers as Set<string>)].sort(),
          ],
        ),
      ),
    ).toEqual(expectedCompleteSelection);
    expect({
      ...synchronizeCompleteLayoutCall[2],
      deletionSelection: Object.fromEntries(
        Object.entries(
          synchronizeCompleteLayoutCall[2].deletionSelection,
        ).map(([type, universalIdentifiers]) => [
          type,
          [...(universalIdentifiers as Set<string>)].sort(),
        ]),
      ),
    }).toEqual({
      synchronizeExistingSelectedMetadata: true,
      deletionSelection: {
        pageLayoutTab: ['1c137df3-a23f-477c-a890-fb40aecc40f7'],
        pageLayoutWidget: [
          '368b8c66-435d-4e5b-94b8-4d3f08fc283b',
          '833783c1-7cc0-4993-a856-977f95e1e3b4',
        ],
      },
    });
  });

  it('skips Campaign page-layout synchronization when Campaign metadata is absent', async () => {
    const synchronizeWorkspace = jest.fn().mockResolvedValue(undefined);
    const getOrRecompute = jest.fn().mockResolvedValue({
      flatObjectMetadataMaps: {
        byUniversalIdentifier: {},
      },
    });
    const command = new SynchronizeMyahCampaignPageLayoutCommand(
      {} as WorkspaceIteratorService,
      {
        synchronizeWorkspace,
      } as unknown as SynchronizeSourceControlledMyahMetadataService,
      {
        getOrRecompute,
      } as unknown as WorkspaceCacheService,
    );

    await command.runOnWorkspace(args);

    expect(getOrRecompute).toHaveBeenCalledWith(args.workspaceId, [
      'flatObjectMetadataMaps',
    ]);
    expect(synchronizeWorkspace).not.toHaveBeenCalled();
  });
});
