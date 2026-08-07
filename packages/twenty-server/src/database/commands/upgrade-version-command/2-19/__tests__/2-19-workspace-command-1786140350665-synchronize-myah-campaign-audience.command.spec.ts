import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import type { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { SynchronizeMyahCampaignAudienceCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-workspace-command-1786140350665-synchronize-myah-campaign-audience.command';
import type { SynchronizeSourceControlledMyahMetadataService } from 'src/database/commands/upgrade-version-command/2-19/services/synchronize-source-controlled-myah-metadata.service';
import { getRegisteredWorkspaceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import type { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { MYAH_CAMPAIGN_AUDIENCE_PAGE_LAYOUT_CONFIG } from 'src/engine/workspace-manager/twenty-standard-application/utils/page-layout/myah-brand-brain-page-layout.config';
import {
  MYAH_STANDARD_FIELD_PERMISSION_DEFINITIONS,
  MYAH_STANDARD_OBJECT_PERMISSION_DEFINITIONS,
} from 'src/engine/workspace-manager/twenty-standard-application/utils/role-metadata/myah-standard-role-permission-definitions.constant';

const buildBackfillDataSource = () => {
  const query = jest.fn().mockResolvedValue(undefined);
  const dataSource = { query };

  return { dataSource, query };
};

const args: RunOnWorkspaceArgs = {
  workspaceId: '20202020-0000-0000-0000-000000000001',
  options: { dryRun: false },
  index: 0,
  total: 1,
  dataSource: buildBackfillDataSource().dataSource as never,
};

const normalizeSelection = (selection: Record<string, Set<string>>) =>
  Object.fromEntries(
    Object.entries(selection).map(([type, universalIdentifiers]) => [
      type,
      [...universalIdentifiers].sort(),
    ]),
  );

describe('SynchronizeMyahCampaignAudienceCommand', () => {
  it('registers the audience synchronization in the active version', () => {
    expect(
      getRegisteredWorkspaceCommandMetadata(
        SynchronizeMyahCampaignAudienceCommand,
      ),
    ).toMatchObject({ version: '2.19.0', timestamp: 1786140350665 });
  });

  it('synchronizes the complete canonical audience contract for existing workspaces', async () => {
    const synchronizeWorkspace = jest.fn().mockResolvedValue(undefined);
    const command = new SynchronizeMyahCampaignAudienceCommand(
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
    const audienceObjectUniversalIdentifiers: string[] = [
      MYAH_STANDARD_OBJECTS.creatorList.universalIdentifier,
      MYAH_STANDARD_OBJECTS.campaignCreator.universalIdentifier,
      MYAH_STANDARD_OBJECTS.campaignCreatorList.universalIdentifier,
      MYAH_STANDARD_OBJECTS.creatorListMember.universalIdentifier,
    ];
    const campaignTabs = Object.values(
      MYAH_CAMPAIGN_AUDIENCE_PAGE_LAYOUT_CONFIG.tabs,
    );

    await command.runOnWorkspace(args);

    expect(synchronizeWorkspace).toHaveBeenCalledTimes(1);
    const [actualArgs, actualSelection, actualOptions] =
      synchronizeWorkspace.mock.calls[0];

    expect(actualArgs).toBe(args);
    expect(normalizeSelection(actualSelection)).toEqual({
      objectMetadata: audienceObjectUniversalIdentifiers.sort(),
      fieldMetadata: [
        ...Object.values(MYAH_STANDARD_OBJECTS.campaignCreator.fields),
        ...Object.values(MYAH_STANDARD_OBJECTS.campaignCreatorList.fields),
        ...Object.values(MYAH_STANDARD_OBJECTS.creatorListMember.fields),
      ]
        .map(({ universalIdentifier }) => universalIdentifier)
        .sort(),
      index: [
        MYAH_STANDARD_OBJECTS.campaignCreator.indexes.creatorCampaignUniqueIndex
          .universalIdentifier,
        MYAH_STANDARD_OBJECTS.campaignCreatorList.indexes
          .campaignCreatorListUniqueIndex.universalIdentifier,
      ].sort(),
      view: [
        MYAH_STANDARD_OBJECTS.campaignCreator.views.campaignInfluencers
          .universalIdentifier,
        MYAH_STANDARD_OBJECTS.campaignCreatorList.views.campaignCreatorLists
          .universalIdentifier,
        MYAH_STANDARD_OBJECTS.campaign.views.viewCampaignInformationCreatorLists
          .universalIdentifier,
      ].sort(),
      viewFilter: [
        MYAH_STANDARD_OBJECTS.campaignCreator.views.campaignInfluencers
          .viewFilters.campaignCurrentRecord.universalIdentifier,
        MYAH_STANDARD_OBJECTS.campaignCreatorList.views.campaignCreatorLists
          .viewFilters.campaignCurrentRecord.universalIdentifier,
      ].sort(),
      viewField: [
        ...Object.values(
          MYAH_STANDARD_OBJECTS.campaignCreator.views.campaignInfluencers
            .viewFields,
        ),
        ...Object.values(
          MYAH_STANDARD_OBJECTS.campaignCreatorList.views.campaignCreatorLists
            .viewFields,
        ),
        ...Object.values(
          MYAH_STANDARD_OBJECTS.campaign.views
            .viewCampaignInformationCreatorLists.viewFields,
        ),
      ]
        .map(({ universalIdentifier }) => universalIdentifier)
        .sort(),
      objectPermission: MYAH_STANDARD_OBJECT_PERMISSION_DEFINITIONS.filter(
        ({ objectMetadataUniversalIdentifier }) =>
          audienceObjectUniversalIdentifiers.includes(
            objectMetadataUniversalIdentifier,
          ),
      )
        .map(({ universalIdentifier }) => universalIdentifier)
        .sort(),
      fieldPermission: MYAH_STANDARD_FIELD_PERMISSION_DEFINITIONS.filter(
        ({ objectMetadataUniversalIdentifier }) =>
          audienceObjectUniversalIdentifiers.includes(
            objectMetadataUniversalIdentifier,
          ),
      )
        .map(({ universalIdentifier }) => universalIdentifier)
        .sort(),
      pageLayout: [
        MYAH_CAMPAIGN_AUDIENCE_PAGE_LAYOUT_CONFIG.universalIdentifier,
      ].sort(),
      pageLayoutTab: campaignTabs
        .map(({ universalIdentifier }) => universalIdentifier)
        .sort(),
      pageLayoutWidget: campaignTabs
        .flatMap(({ widgets }) =>
          Object.values(widgets).map(
            ({ universalIdentifier }) => universalIdentifier,
          ),
        )
        .sort(),
    });
    expect(actualOptions).toEqual({
      synchronizeExistingSelectedMetadata: true,
    });
  });
  it('backfills legacy direct Campaign Creator provenance after metadata synchronization', async () => {
    const synchronizeWorkspace = jest.fn().mockResolvedValue(undefined);
    const { dataSource, query } = buildBackfillDataSource();
    const command = new SynchronizeMyahCampaignAudienceCommand(
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

    await command.runOnWorkspace({
      ...args,
      dataSource: dataSource as never,
    });

    expect(synchronizeWorkspace.mock.invocationCallOrder[0]).toBeLessThan(
      query.mock.invocationCallOrder[0],
    );
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain(
      'UPDATE "campaignCreator" AS "campaignCreator"',
    );
    expect(query.mock.calls[0][0]).toContain('NOT EXISTS');
  });

  it('skips synchronization when Campaign metadata is absent', async () => {
    const synchronizeWorkspace = jest.fn().mockResolvedValue(undefined);
    const getOrRecompute = jest.fn().mockResolvedValue({
      flatObjectMetadataMaps: { byUniversalIdentifier: {} },
    });
    const command = new SynchronizeMyahCampaignAudienceCommand(
      {} as WorkspaceIteratorService,
      {
        synchronizeWorkspace,
      } as unknown as SynchronizeSourceControlledMyahMetadataService,
      { getOrRecompute } as unknown as WorkspaceCacheService,
    );

    await command.runOnWorkspace(args);

    expect(getOrRecompute).toHaveBeenCalledWith(args.workspaceId, [
      'flatObjectMetadataMaps',
    ]);
    expect(synchronizeWorkspace).not.toHaveBeenCalled();
  });

  it('skips synchronization without a workspace data source', async () => {
    const synchronizeWorkspace = jest.fn().mockResolvedValue(undefined);
    const getOrRecompute = jest.fn();
    const command = new SynchronizeMyahCampaignAudienceCommand(
      {} as WorkspaceIteratorService,
      {
        synchronizeWorkspace,
      } as unknown as SynchronizeSourceControlledMyahMetadataService,
      { getOrRecompute } as unknown as WorkspaceCacheService,
    );

    await command.runOnWorkspace({ ...args, dataSource: undefined });

    expect(getOrRecompute).not.toHaveBeenCalled();
    expect(synchronizeWorkspace).not.toHaveBeenCalled();
  });
});
