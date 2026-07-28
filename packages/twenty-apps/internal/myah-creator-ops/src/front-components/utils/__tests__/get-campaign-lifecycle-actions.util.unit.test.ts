import { describe, expect, it } from 'vitest';

import { getCampaignLifecycleActions } from 'src/front-components/utils/get-campaign-lifecycle-actions.util';

describe('getCampaignLifecycleActions', () => {
  it('returns only allowed actions for each canonical status', () => {
    expect(getCampaignLifecycleActions('DRAFT')).toEqual([
      { label: 'Activate', targetStatus: 'ACTIVE' },
    ]);
    expect(getCampaignLifecycleActions('ACTIVE')).toEqual([
      { label: 'Pause', targetStatus: 'PAUSED' },
      { label: 'Complete', targetStatus: 'COMPLETED' },
    ]);
    expect(getCampaignLifecycleActions('PAUSED')).toEqual([
      { label: 'Resume', targetStatus: 'ACTIVE' },
      { label: 'Complete', targetStatus: 'COMPLETED' },
    ]);
    expect(getCampaignLifecycleActions('COMPLETED')).toEqual([]);
  });
});
