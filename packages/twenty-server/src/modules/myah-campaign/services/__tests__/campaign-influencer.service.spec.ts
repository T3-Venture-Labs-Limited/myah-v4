import { type GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import {
  type ORMWorkspaceContext,
  withWorkspaceContext,
} from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import {
  buildEffectiveCampaignCreators,
  CampaignInfluencerService,
  getCampaignListSyncChanges,
  getSourceRemovalImpact,
} from 'src/modules/myah-campaign/services/campaign-influencer.service';

describe('CampaignInfluencerService audience invariants', () => {
  it('deduplicates overlapping lists and preserves direct provenance', () => {
    expect(
      buildEffectiveCampaignCreators({
        campaignId: 'campaign-1',
        directCreatorIds: ['creator-1'],
        listMembersByListId: {
          'list-a': ['creator-1', 'creator-2'],
          'list-b': ['creator-1'],
        },
      }),
    ).toEqual([
      {
        campaignId: 'campaign-1',
        creatorId: 'creator-1',
        isDirectlyAdded: true,
        sourceListIds: ['list-a', 'list-b'],
      },
      {
        campaignId: 'campaign-1',
        creatorId: 'creator-2',
        isDirectlyAdded: false,
        sourceListIds: ['list-a'],
      },
    ]);
  });

  it('returns only new list members for explicit add-only review', () => {
    expect(
      getCampaignListSyncChanges({
        attachedListIds: ['list-a'],
        existingCreators: [
          { campaignId: 'campaign-1', creatorId: 'creator-1' },
        ],
        listMembersByListId: { 'list-a': ['creator-1', 'creator-2'] },
      }),
    ).toEqual({ additions: ['creator-2'], preserved: ['creator-1'] });
  });

  it('keeps a campaign creator when one of several sources is removed', () => {
    expect(
      buildEffectiveCampaignCreators({
        campaignId: 'campaign-1',
        directCreatorIds: ['creator-1'],
        listMembersByListId: { 'list-b': ['creator-1'] },
      }),
    ).toEqual([
      {
        campaignId: 'campaign-1',
        creatorId: 'creator-1',
        isDirectlyAdded: true,
        sourceListIds: ['list-b'],
      },
    ]);
  });
  it('requires confirmation only when a removed List was the final source', () => {
    expect(
      getSourceRemovalImpact({
        removedListId: 'list-a',
        directCreatorIds: ['creator-1'],
        listMembersByListId: {
          'list-a': ['creator-1', 'creator-2'],
          'list-b': ['creator-1'],
        },
      }),
    ).toEqual({
      affectedCreatorIds: ['creator-2'],
      requiresConfirmation: true,
    });
  });
});
describe('CampaignInfluencerService generic membership guard', () => {
  const authContext = {
    type: 'system',
    workspace: { id: 'workspace-1' },
  } as never;
  const workspaceContext = {
    authContext,
    userWorkspaceRoleMap: {},
    apiKeyRoleMap: {},
  } as unknown as ORMWorkspaceContext;

  it.each([
    [false, 'allows generic membership writes for unattached lists'],
    [true, 'rejects generic membership writes for attached lists'],
  ])('%s', async (attached) => {
    const attachments = { exists: jest.fn().mockResolvedValue(attached) };
    const manager = {
      executeInWorkspaceContext: jest.fn(async (callback: () => unknown) =>
        withWorkspaceContext(workspaceContext, callback),
      ),
      getRepository: jest.fn().mockResolvedValue(attachments),
    } as unknown as GlobalWorkspaceOrmManager;
    const service = new CampaignInfluencerService(manager);

    const mutation = service.assertGenericMembershipMutationAllowed(
      'list-1',
      authContext,
    );

    if (attached) {
      await expect(mutation).rejects.toThrow(
        'Use the creator-list membership intent for attached lists',
      );
    } else {
      await expect(mutation).resolves.toBeUndefined();
    }
    expect(attachments.exists).toHaveBeenCalledWith({
      where: { creatorListId: 'list-1' },
    });
  });
});
