import {
  buildEffectiveCampaignCreators,
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
