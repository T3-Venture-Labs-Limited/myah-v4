import { buildEffectiveCampaignCreators } from 'src/modules/myah-campaign/services/campaign-influencer.service';

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
});
