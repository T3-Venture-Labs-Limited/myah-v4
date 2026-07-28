import { describe, expect, it, vi } from 'vitest';

import { fetchCampaignOverview } from 'src/front-components/utils/fetch-campaign-overview.util';

const campaignResponse = {
  id: 'campaign-1',
  name: 'Launch',
  objective: 'Grow awareness',
  lifecycleStatus: 'DRAFT',
};

describe('fetchCampaignOverview', () => {
  it('fetches one Campaign plus an aggregate audience count', async () => {
    const query = vi.fn().mockResolvedValue({
      campaign: campaignResponse,
      campaignCreators: { totalCount: 2 },
    });
    const client = { query, mutation: vi.fn() };

    await expect(
      fetchCampaignOverview({ client, campaignId: 'campaign-1' }),
    ).resolves.toEqual({
      ...campaignResponse,
      effectiveAudienceCount: 2,
    });

    expect(query).toHaveBeenCalledWith({
      campaign: {
        __args: { filter: { id: { eq: 'campaign-1' } } },
        id: true,
        name: true,
        objective: true,
        lifecycleStatus: true,
      },
      campaignCreators: {
        __args: {
          filter: {
            campaignId: { eq: 'campaign-1' },
            creatorId: { is: 'NOT_NULL' },
            deletedAt: { is: 'NULL' },
          },
        },
        totalCount: true,
      },
    });
    expect(query.mock.calls[0]?.[0].campaignCreators).not.toHaveProperty(
      'edges',
    );
  });

  it('returns null when the Campaign is absent', async () => {
    const client = {
      query: vi.fn().mockResolvedValue({
        campaign: null,
        campaignCreators: { totalCount: 0 },
      }),
      mutation: vi.fn(),
    };

    await expect(
      fetchCampaignOverview({ client, campaignId: 'campaign-1' }),
    ).resolves.toBeNull();
  });

  it('rejects malformed response data instead of fabricating Campaign facts', async () => {
    const client = {
      query: vi.fn().mockResolvedValue({
        campaign: campaignResponse,
        campaignCreators: { totalCount: '2' },
      }),
      mutation: vi.fn(),
    };

    await expect(
      fetchCampaignOverview({ client, campaignId: 'campaign-1' }),
    ).rejects.toThrow();
  });
});
