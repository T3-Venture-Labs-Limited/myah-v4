import { CampaignMessageOverviewRowService } from 'src/modules/campaign-execution/services/campaign-message-overview-row.service';

const firstOccurrence = {
  campaignId: 'campaign-a',
  occurrenceId: 'occurrence-1',
};

const secondOccurrence = {
  campaignId: 'campaign-a',
  occurrenceId: 'occurrence-2',
};

describe('CampaignMessageOverviewRowService', () => {
  const service = new CampaignMessageOverviewRowService();

  it('keeps estimates separate from actual Sent evidence as progression materializes the next occurrence', () => {
    const estimatedSendAt = new Date('2026-09-21T10:00:40.123Z');
    expect(
      service.buildRows({
        accepted: [],
        occurrences: [firstOccurrence],
        projections: [{ ...firstOccurrence, estimatedSendAt }],
      }),
    ).toEqual([
      {
        ...firstOccurrence,
        estimatedSendAt,
        sentAt: null,
        status: 'QUEUED',
      },
    ]);

    const sentAt = new Date('2026-09-21T10:01:02.456Z');
    const nextEstimatedSendAt = new Date('2026-09-21T10:06:02.456Z');
    expect(
      service.buildRows({
        accepted: [{ ...firstOccurrence, sentAt }],
        occurrences: [firstOccurrence, secondOccurrence],
        projections: [
          { ...firstOccurrence, estimatedSendAt },
          { ...secondOccurrence, estimatedSendAt: nextEstimatedSendAt },
        ],
      }),
    ).toEqual([
      {
        ...firstOccurrence,
        estimatedSendAt: null,
        sentAt,
        status: 'SENT',
      },
      {
        ...secondOccurrence,
        estimatedSendAt: nextEstimatedSendAt,
        sentAt: null,
        status: 'QUEUED',
      },
    ]);
  });

  it('keeps queued work visible when no estimate was published', () => {
    expect(
      service.buildRows({
        accepted: [],
        occurrences: [firstOccurrence],
        projections: [],
      }),
    ).toEqual([
      {
        ...firstOccurrence,
        estimatedSendAt: null,
        sentAt: null,
        status: 'QUEUED',
      },
    ]);
  });
});
