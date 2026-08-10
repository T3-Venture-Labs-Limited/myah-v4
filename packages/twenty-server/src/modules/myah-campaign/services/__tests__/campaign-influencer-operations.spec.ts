import {
  buildEffectiveCampaignCreators,
  getSourceRemovalImpact,
} from 'src/modules/myah-campaign/services/campaign-influencer.service';

describe('campaign influencer operation invariants', () => {
  it('deduplicates concurrent-equivalent direct and list sources', () => {
    const rows = buildEffectiveCampaignCreators({
      campaignId: 'c',
      directCreatorIds: ['a', 'a'],
      listMembersByListId: { one: ['a', 'b'], two: ['a'] },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ creatorId: 'a', isDirectlyAdded: true });
  });

  it('preserves a creator when a removed list is not the only source', () => {
    expect(
      getSourceRemovalImpact({
        removedListId: 'one',
        directCreatorIds: [],
        listMembersByListId: { one: ['a'], two: ['a'] },
      }),
    ).toEqual({ affectedCreatorIds: [], requiresConfirmation: false });
  });

  it('requires exact confirmation for every final-source creator', () => {
    const impact = getSourceRemovalImpact({
      removedListId: 'one',
      directCreatorIds: [],
      listMembersByListId: { one: ['a', 'b'] },
    });
    expect(impact).toEqual({
      affectedCreatorIds: ['a', 'b'],
      requiresConfirmation: true,
    });
    expect(new Set(['a'])).not.toEqual(new Set(impact.affectedCreatorIds));
  });
});
