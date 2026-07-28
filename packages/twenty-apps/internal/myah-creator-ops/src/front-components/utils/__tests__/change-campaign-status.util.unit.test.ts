import { describe, expect, it, vi } from 'vitest';

import { changeCampaignStatus } from 'src/front-components/utils/change-campaign-status.util';

const actualCampaign = {
  id: 'campaign-1',
  name: 'Launch',
  objective: 'Grow awareness',
  status: 'COMPLETED',
};

describe('changeCampaignStatus', () => {
  it('returns the one updated Campaign without refetching', async () => {
    const mutation = vi.fn().mockResolvedValue({
      updateCampaigns: [{ id: 'campaign-1', status: 'ACTIVE' }],
    });
    const query = vi.fn();
    const client = { query, mutation };

    await expect(
      changeCampaignStatus({
        client,
        campaignId: 'campaign-1',
        targetStatus: 'ACTIVE',
      }),
    ).resolves.toEqual({
      kind: 'updated',
      campaign: { id: 'campaign-1', status: 'ACTIVE' },
    });

    expect(mutation).toHaveBeenCalledOnce();
    expect(mutation).toHaveBeenCalledWith({
      updateCampaigns: {
        __args: {
          filter: { id: { in: ['campaign-1'] } },
          data: { status: 'ACTIVE' },
        },
        id: true,
        status: true,
      },
    });
    expect(query).not.toHaveBeenCalled();
  });

  it('refetches the actual Campaign when the compare-and-set matches no row', async () => {
    const mutation = vi.fn().mockResolvedValue({ updateCampaigns: [] });
    const query = vi.fn().mockResolvedValue({
      campaign: actualCampaign,
      campaignCreators: { totalCount: 3 },
    });
    const client = { query, mutation };

    await expect(
      changeCampaignStatus({
        client,
        campaignId: 'campaign-1',
        targetStatus: 'ACTIVE',
      }),
    ).resolves.toEqual({
      kind: 'conflict',
      campaign: { ...actualCampaign, effectiveAudienceCount: 3 },
    });

    expect(mutation).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledOnce();
  });

  it('rethrows mutation errors without fabricating a status', async () => {
    const serverError = new Error(
      'Change Campaign status from Campaign Overview.',
    );
    const mutation = vi.fn().mockRejectedValue(serverError);
    const query = vi.fn();

    await expect(
      changeCampaignStatus({
        client: { query, mutation },
        campaignId: 'campaign-1',
        targetStatus: 'ACTIVE',
      }),
    ).rejects.toBe(serverError);

    expect(mutation).toHaveBeenCalledOnce();
    expect(query).not.toHaveBeenCalled();
  });
});
