import { describe, expect, it } from 'vitest';

import { getSelectedCampaignId } from 'src/front-components/utils/get-selected-campaign-id.util';

describe('getSelectedCampaignId', () => {
  it('returns an ID only for one selected Campaign', () => {
    expect(getSelectedCampaignId([])).toBeNull();
    expect(getSelectedCampaignId(['campaign-1'])).toBe('campaign-1');
    expect(getSelectedCampaignId(['campaign-1', 'campaign-2'])).toBeNull();
  });
});
