import { CampaignMessageForecastService } from 'src/modules/campaign-execution/services/campaign-message-forecast.service';

const account = {
  acceptedByLocalDate: { '2026-09-21': 1 },
  capacityTimeZone: 'UTC',
  connectedAccountId: '11111111-1111-4111-8111-111111111111',
  dailySendLimit: 10,
  minimumSendIntervalMs: 300_000,
  nextEligibleAt: null,
  reservedByLocalDate: { '2026-09-21': 1 },
};

const window = {
  endLocalTime: '17:00:00',
  startLocalTime: '09:00:00',
  timeZone: 'UTC',
};

describe('CampaignMessageForecastService', () => {
  const service = new CampaignMessageForecastService();

  it('preserves exact eligibility and applies real mailbox spacing', () => {
    const dueAt = new Date('2026-09-21T10:00:40.123Z');
    const result = service.forecast({
      accounts: [account],
      generatedAt: new Date('2026-09-21T09:00:00.000Z'),
      maxItems: 10,
      occurrences: [
        {
          campaignId: 'campaign-a',
          dueAt,
          occurrenceId: 'occurrence-a',
          sender: {
            kind: 'ROTATE',
            connectedAccountIds: [account.connectedAccountId],
          },
          window,
        },
        {
          campaignId: 'campaign-b',
          dueAt,
          occurrenceId: 'occurrence-b',
          sender: {
            kind: 'ROTATE',
            connectedAccountIds: [account.connectedAccountId],
          },
          window,
        },
      ],
    });

    expect(result.projections).toEqual([
      {
        campaignId: 'campaign-a',
        connectedAccountId: account.connectedAccountId,
        estimatedSendAt: dueAt,
        occurrenceId: 'occurrence-a',
      },
      {
        campaignId: 'campaign-b',
        connectedAccountId: account.connectedAccountId,
        estimatedSendAt: new Date('2026-09-21T10:05:40.123Z'),
        occurrenceId: 'occurrence-b',
      },
    ]);
    expect(result.coverage).toEqual({ complete: true, evaluatedCount: 2 });
  });

  it('moves work after protected quota without mutating actual usage', () => {
    const protectedAccount = {
      ...account,
      dailySendLimit: 2,
    };
    const result = service.forecast({
      accounts: [protectedAccount],
      generatedAt: new Date('2026-09-21T09:00:00.000Z'),
      maxItems: 10,
      occurrences: [
        {
          campaignId: 'campaign-a',
          dueAt: new Date('2026-09-21T16:00:00.000Z'),
          occurrenceId: 'occurrence-a',
          sender: {
            kind: 'PINNED',
            connectedAccountId: protectedAccount.connectedAccountId,
          },
          window,
        },
      ],
    });

    expect(result.projections[0]?.estimatedSendAt).toEqual(
      new Date('2026-09-22T09:00:00.000Z'),
    );
    expect(protectedAccount.acceptedByLocalDate).toEqual({ '2026-09-21': 1 });
    expect(protectedAccount.reservedByLocalDate).toEqual({ '2026-09-21': 1 });
  });

  it('uses runtime rotation ordering and never falls back from a missing pinned sender', () => {
    const accountB = {
      ...account,
      connectedAccountId: '22222222-2222-4222-8222-222222222222',
      acceptedByLocalDate: {},
      reservedByLocalDate: {},
    };
    const result = service.forecast({
      accounts: [
        { ...account, acceptedByLocalDate: {}, reservedByLocalDate: {} },
        accountB,
      ],
      generatedAt: new Date('2026-09-21T09:00:00.000Z'),
      maxItems: 10,
      occurrences: [
        {
          campaignId: 'campaign-a',
          dueAt: new Date('2026-09-21T10:00:00.000Z'),
          occurrenceId: 'rotate',
          sender: {
            kind: 'ROTATE',
            connectedAccountIds: [
              accountB.connectedAccountId,
              account.connectedAccountId,
            ],
          },
          window,
        },
        {
          campaignId: 'campaign-a',
          dueAt: new Date('2026-09-21T10:00:00.000Z'),
          occurrenceId: 'pinned-missing',
          sender: {
            kind: 'PINNED',
            connectedAccountId: '33333333-3333-4333-8333-333333333333',
          },
          window,
        },
      ],
    });

    expect(result.projections).toEqual([
      expect.objectContaining({
        occurrenceId: 'rotate',
        connectedAccountId: account.connectedAccountId,
      }),
    ]);
  });

  it('keeps a 48 elapsed-hour horizon across daylight-saving changes', () => {
    const generatedAt = new Date('2026-10-31T16:00:00.123Z');
    const result = service.forecast({
      accounts: [{ ...account, capacityTimeZone: 'America/New_York' }],
      generatedAt,
      maxItems: 10,
      occurrences: [
        {
          campaignId: 'campaign-a',
          dueAt: generatedAt,
          occurrenceId: 'occurrence-a',
          sender: {
            kind: 'PINNED',
            connectedAccountId: account.connectedAccountId,
          },
          window: { ...window, timeZone: 'America/New_York' },
        },
      ],
    });

    expect(result.horizonEndsAt.getTime() - generatedAt.getTime()).toBe(
      48 * 60 * 60 * 1_000,
    );
    expect(result.horizonEndsAt.getUTCMilliseconds()).toBe(123);
  });

  it('bounds dense and distant queues before simulation work', () => {
    const generatedAt = new Date('2026-09-21T09:00:00.000Z');
    const occurrences = Array.from({ length: 10_000 }, (_, index) => ({
      campaignId: 'campaign-a',
      dueAt: new Date(generatedAt.getTime() + index),
      occurrenceId: `occurrence-${String(index).padStart(5, '0')}`,
      sender: {
        kind: 'PINNED' as const,
        connectedAccountId: account.connectedAccountId,
      },
      window,
    }));
    const startedAt = performance.now();
    const result = service.forecast({
      accounts: [account],
      generatedAt,
      maxItems: 1_000,
      occurrences,
    });

    expect(result.coverage).toEqual({ complete: false, evaluatedCount: 1_000 });
    expect(performance.now() - startedAt).toBeLessThan(2_000);
  });

  it('forecasts only materialized occurrences supplied by the indexed reader', () => {
    const result = service.forecast({
      accounts: [account],
      generatedAt: new Date('2026-09-21T09:00:00.000Z'),
      maxItems: 10,
      occurrences: [
        {
          campaignId: 'campaign-a',
          dueAt: new Date('2026-09-21T10:00:00.000Z'),
          occurrenceId: 'current-occurrence',
          sender: {
            kind: 'PINNED',
            connectedAccountId: account.connectedAccountId,
          },
          window,
        },
      ],
    });

    expect(result.projections.map(({ occurrenceId }) => occurrenceId)).toEqual([
      'current-occurrence',
    ]);
  });
});
