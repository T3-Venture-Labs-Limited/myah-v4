import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import type { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { SynchronizeSourceControlledMyahMetadataService } from 'src/database/commands/upgrade-version-command/2-19/services/synchronize-source-controlled-myah-metadata.service';
import { SynchronizeCampaignReplyAuthorityCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1790000000003-synchronize-campaign-reply-authority.command';
import { getRegisteredWorkspaceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import type { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';

const { campaign, campaignCreator, campaignEmailConversationBinding: binding } =
  MYAH_STANDARD_OBJECTS;
const fields = (object: { fields: Record<string, { universalIdentifier: string }> }) =>
  Object.values(object.fields).map(({ universalIdentifier }) => universalIdentifier);
const controlNames = [
  'replyAgentEnabled',
  'replyAgentMode',
  'replyAgentRevision',
  'replyAgentEnabledAt',
  'replyAgentEnabledByUserWorkspaceId',
  'replyAgentChangedAt',
  'replyAgentChangedByWorkspaceMemberId',
] as const;
const participationNames = [
  'replyAgentPaused',
  'replyAgentRevision',
  'replyAgentMaterialGeneration',
  'replyAgentPauseHistory',
  'replyAgentChangedAt',
  'replyAgentChangedByWorkspaceMemberId',
  'emailConversationBindings',
] as const;
const args = {
  workspaceId: '20202020-0000-0000-0000-000000000001',
  options: { dryRun: false },
  index: 0,
  total: 1,
  dataSource: {} as never,
};

const setup = (objects: string[] = [campaign.universalIdentifier, campaignCreator.universalIdentifier]) => {
  const synchronizeWorkspace = jest.fn().mockResolvedValue(undefined);
  const getOrRecompute = jest.fn().mockResolvedValue({
    flatObjectMetadataMaps: {
      byUniversalIdentifier: Object.fromEntries(objects.map((id) => [id, {}])),
    },
  });
  const command = new SynchronizeCampaignReplyAuthorityCommand(
    {} as WorkspaceIteratorService,
    { synchronizeWorkspace } as unknown as SynchronizeSourceControlledMyahMetadataService,
    { getOrRecompute } as unknown as WorkspaceCacheService,
  );
  return { command, synchronizeWorkspace, getOrRecompute };
};

describe('SynchronizeCampaignReplyAuthorityCommand (dormant source)', () => {
  it('selects only new controls, full binding object/index/fields and inverse; never selects permissions or legacy facts', async () => {
    expect(getRegisteredWorkspaceCommandMetadata(SynchronizeCampaignReplyAuthorityCommand))
      .toMatchObject({ version: '2.20.0', timestamp: 1790000000003 });
    const { command, synchronizeWorkspace, getOrRecompute } = setup();
    await command.runOnWorkspace(args);
    expect(getOrRecompute).toHaveBeenCalledWith(args.workspaceId, ['flatObjectMetadataMaps']);
    expect(synchronizeWorkspace).toHaveBeenCalledTimes(1);
    const [receivedArgs, selection] = synchronizeWorkspace.mock.calls[0];
    expect(receivedArgs).toBe(args);
    expect(Object.keys(selection).sort()).toEqual(['fieldMetadata', 'index', 'objectMetadata']);
    expect(selection.objectMetadata).toEqual(new Set([binding.universalIdentifier]));
    expect(selection.fieldMetadata).toEqual(new Set([
      ...controlNames.map((name) => campaign.fields[name].universalIdentifier),
      ...participationNames.map((name) => campaignCreator.fields[name].universalIdentifier),
      ...fields(binding),
    ]));
    expect(selection.index).toEqual(
      new Set(Object.values(binding.indexes).map(({ universalIdentifier }) => universalIdentifier)),
    );
    for (const forbidden of [
      campaignCreator.fields.stage.universalIdentifier,
      campaignCreator.fields.offerVersions.universalIdentifier,
      campaignCreator.fields.partnershipObligations.universalIdentifier,
      MYAH_STANDARD_OBJECTS.partnershipOfferVersion.universalIdentifier,
      MYAH_STANDARD_OBJECTS.partnershipObligation.universalIdentifier,
    ]) {
      expect(selection.fieldMetadata.has(forbidden)).toBe(false);
      expect(selection.objectMetadata.has(forbidden)).toBe(false);
    }
  });

  it('passes dry-run unchanged to synchronizer, without separate DDL or data adoption', async () => {
    const { command, synchronizeWorkspace } = setup();
    const dryArgs = { ...args, options: { dryRun: true } };
    await command.runOnWorkspace(dryArgs);
    expect(synchronizeWorkspace).toHaveBeenCalledWith(dryArgs, expect.anything());
  });

  it('fails closed on a missing datasource or incomplete/unprovisioned legacy metadata; never records a false successful skip', async () => {
    for (const objects of [[], [campaign.universalIdentifier], [campaignCreator.universalIdentifier]]) {
      const { command, synchronizeWorkspace } = setup(objects);
      await expect(command.runOnWorkspace(args)).rejects.toThrow('prerequisite');
      expect(synchronizeWorkspace).not.toHaveBeenCalled();
    }
    const { command, synchronizeWorkspace } = setup();
    await expect(command.runOnWorkspace({ ...args, dataSource: undefined })).rejects.toThrow('datasource');
    expect(synchronizeWorkspace).not.toHaveBeenCalled();
  });

  it('propagates migration failures for retry and keeps the exact workspace identity', async () => {
    const { command, synchronizeWorkspace } = setup();
    synchronizeWorkspace.mockRejectedValueOnce(new Error('metadata failed'));
    await expect(command.runOnWorkspace(args)).rejects.toThrow('metadata failed');
    await command.runOnWorkspace({ ...args, workspaceId: '20202020-0000-0000-0000-000000000002' });
    expect(synchronizeWorkspace.mock.calls[1][0].workspaceId).toBe('20202020-0000-0000-0000-000000000002');
  });
});
