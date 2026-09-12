import {
  MYAH_CAMPAIGN_CREATOR_DEFAULT_STAGE,
  MYAH_CAMPAIGN_CREATOR_OUTREACH_ELIGIBLE_STAGES,
  MYAH_CAMPAIGN_CREATOR_STAGE_OPTIONS,
  MYAH_CAMPAIGN_CREATOR_STAGES,
} from 'twenty-shared/metadata';

describe('Campaign Creator journey-stage contract', () => {
  it('exposes the approved values, labels, order, and stable retained ids', () => {
    expect(MYAH_CAMPAIGN_CREATOR_STAGE_OPTIONS).toEqual([
      expect.objectContaining({
        id: 'fac8d7a9-7c6e-5864-ba8a-90c4c2d2d50f',
        value: 'READY',
        label: 'Not contacted',
        position: 0,
      }),
      expect.objectContaining({
        id: '8fb20399-c0c6-59ed-b347-06886e4fc305',
        value: 'CONTACTED',
        label: 'Contacted',
        position: 1,
      }),
      expect.objectContaining({
        id: 'dbbee93d-106d-5961-9907-949ac9948844',
        value: 'NEGOTIATING',
        label: 'Negotiating',
        position: 2,
      }),
      expect.objectContaining({
        value: 'ONBOARDED',
        label: 'Onboarded',
        position: 3,
      }),
      expect.objectContaining({
        value: 'PRODUCT_SENT',
        label: 'Product sent',
        position: 4,
      }),
      expect.objectContaining({
        value: 'WAITING_FOR_POST',
        label: 'Waiting on post',
        position: 5,
      }),
      expect.objectContaining({
        value: 'POSTED',
        label: 'Posted',
        position: 6,
      }),
      expect.objectContaining({
        id: 'b03a494e-e909-50a1-8c41-1c7e1644a334',
        value: 'DROPPED',
        label: 'Dropped',
        position: 7,
      }),
    ]);
    expect(
      MYAH_CAMPAIGN_CREATOR_STAGE_OPTIONS.map(({ value }) => value),
    ).toEqual(MYAH_CAMPAIGN_CREATOR_STAGES);
    expect(MYAH_CAMPAIGN_CREATOR_DEFAULT_STAGE).toBe('READY');
  });

  it('allows outreach only from READY and CONTACTED', () => {
    expect([...MYAH_CAMPAIGN_CREATOR_OUTREACH_ELIGIBLE_STAGES]).toEqual([
      'READY',
      'CONTACTED',
    ]);
    expect(
      MYAH_CAMPAIGN_CREATOR_OUTREACH_ELIGIBLE_STAGES.has('NEGOTIATING'),
    ).toBe(false);
  });
});
