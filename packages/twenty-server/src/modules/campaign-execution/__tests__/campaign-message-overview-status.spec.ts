import {
  campaignMessageOverviewStatusSql,
  deriveCampaignMessageOverviewStatus,
} from 'src/modules/campaign-execution/services/campaign-message-overview-status';

describe('campaign message overview status', () => {
  it.each(['RESERVED', 'PROCESSING'])(
    '%s protected attempts need attention',
    (attemptState) => {
      expect(
        deriveCampaignMessageOverviewStatus({
          attemptState,
          occurrenceState: 'IN_FLIGHT',
          projectedMessageThreadId: null,
          providerAcceptedAt: null,
        }),
      ).toBe('NEEDS_ATTENTION');
    },
  );

  it('maps terminal unsent SKIPPED occurrences to historical cancellation', () => {
    expect(
      deriveCampaignMessageOverviewStatus({
        attemptState: null,
        occurrenceState: 'SKIPPED',
        projectedMessageThreadId: null,
        providerAcceptedAt: null,
      }),
    ).toBe('CANCELLED');
  });

  it('keeps a SUCCEEDED occurrence without accepted immutable evidence out of Scheduled', () => {
    const malformedSucceededOccurrence = {
      attemptState: null,
      occurrenceState: 'SUCCEEDED',
      projectedMessageThreadId: null,
      providerAcceptedAt: null,
    };

    expect(
      deriveCampaignMessageOverviewStatus(malformedSucceededOccurrence),
    ).toBe('NEEDS_ATTENTION');
    expect(
      deriveCampaignMessageOverviewStatus({
        ...malformedSucceededOccurrence,
        occurrenceState: 'PENDING',
      }),
    ).toBe('SCHEDULED');
  });

  it('preserves accepted sent and skipped cancelled terminal status', () => {
    expect(
      deriveCampaignMessageOverviewStatus({
        attemptState: 'ACCEPTED',
        occurrenceState: 'SUCCEEDED',
        projectedMessageThreadId: 'thread',
        providerAcceptedAt: new Date(),
      }),
    ).toBe('SENT');
    expect(
      deriveCampaignMessageOverviewStatus({
        attemptState: null,
        occurrenceState: 'SKIPPED',
        projectedMessageThreadId: null,
        providerAcceptedAt: null,
      }),
    ).toBe('CANCELLED');
  });

  it('uses identical terminal and malformed-occurrence classifications in SQL', () => {
    expect(campaignMessageOverviewStatusSql()).toContain(
      "IN ('RESERVED','PROCESSING','UNKNOWN','BLOCKED')",
    );
    expect(campaignMessageOverviewStatusSql()).toContain(
      "IN ('CANCELLED','SKIPPED') THEN 'CANCELLED'",
    );
    expect(campaignMessageOverviewStatusSql()).toContain(
      "o.state IN ('HELD','UNKNOWN','IN_FLIGHT','SUCCEEDED')",
    );
    expect(campaignMessageOverviewStatusSql()).toContain(
      'attempt."attemptState"=\'ACCEPTED\'',
    );
    expect(campaignMessageOverviewStatusSql()).not.toContain(
      "'SUCCEEDED','ACCEPTED'",
    );
  });
});
