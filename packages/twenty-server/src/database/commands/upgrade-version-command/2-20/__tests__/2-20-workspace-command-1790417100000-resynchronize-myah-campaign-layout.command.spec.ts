import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { ResynchronizeMyahCampaignLayoutCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1790417100000-resynchronize-myah-campaign-layout.command';
import { MYAH_CAMPAIGN_AUDIENCE_PAGE_LAYOUT_CONFIG } from 'src/engine/workspace-manager/twenty-standard-application/utils/page-layout/myah-brand-brain-page-layout.config';

const args = {
  workspaceId: '11111111-1111-4111-8111-111111111111',
  options: { dryRun: false },
  dataSource: { query: jest.fn() },
} as unknown as RunOnWorkspaceArgs;
const CommandConstructor =
  ResynchronizeMyahCampaignLayoutCommand as unknown as new (
    ...dependencies: unknown[]
  ) => ResynchronizeMyahCampaignLayoutCommand;

const setup = (campaignExists = true) => {
  const synchronizeWorkspace = jest.fn().mockResolvedValue(undefined);
  const getOrRecompute = jest.fn().mockResolvedValue({
    flatObjectMetadataMaps: {
      byUniversalIdentifier: campaignExists
        ? { [MYAH_STANDARD_OBJECTS.campaign.universalIdentifier]: {} }
        : {},
    },
  });
  const command = new CommandConstructor(
    {},
    { synchronizeWorkspace },
    { getOrRecompute },
  );
  return { command, synchronizeWorkspace, getOrRecompute };
};

describe('ResynchronizeMyahCampaignLayoutCommand', () => {
  it('resynchronizes only source-defined Campaign layout and tabs including existing selected IDs', async () => {
    const { command, synchronizeWorkspace } = setup();

    await command.runOnWorkspace(args);

    expect(synchronizeWorkspace).toHaveBeenCalledTimes(1);
    const [actualArgs, selection, options] = synchronizeWorkspace.mock.calls[0];
    expect(actualArgs).toBe(args);
    expect(Object.keys(selection).sort()).toEqual([
      'pageLayout',
      'pageLayoutTab',
    ]);
    expect(selection.pageLayout).toEqual(
      new Set([MYAH_CAMPAIGN_AUDIENCE_PAGE_LAYOUT_CONFIG.universalIdentifier]),
    );
    expect(selection.pageLayoutTab).toEqual(
      new Set(
        Object.values(MYAH_CAMPAIGN_AUDIENCE_PAGE_LAYOUT_CONFIG.tabs).map(
          ({ universalIdentifier }) => universalIdentifier,
        ),
      ),
    );
    expect(options).toEqual({ synchronizeExistingSelectedMetadata: true });
    expect(args.dataSource?.query).not.toHaveBeenCalled();
  });

  it('skips absent data source and missing Campaign metadata', async () => {
    const { command, synchronizeWorkspace, getOrRecompute } = setup(false);
    await command.runOnWorkspace({ ...args, dataSource: undefined });
    expect(getOrRecompute).not.toHaveBeenCalled();
    await command.runOnWorkspace(args);
    expect(synchronizeWorkspace).not.toHaveBeenCalled();
  });

  it('does not synchronize in dry-run', async () => {
    const { command, synchronizeWorkspace } = setup();
    await command.runOnWorkspace({ ...args, options: { dryRun: true } });
    expect(synchronizeWorkspace).not.toHaveBeenCalled();
  });
});
