import { Injectable } from '@nestjs/common';

type Occurrence = { campaignId: string; occurrenceId: string };
type Accepted = Occurrence & { sentAt: Date };
type Projection = Occurrence & { estimatedSendAt: Date };

@Injectable()
export class CampaignMessageOverviewRowService {
  buildRows(input: {
    accepted: Accepted[];
    occurrences: Occurrence[];
    projections: Projection[];
  }) {
    const accepted = new Map(
      input.accepted.map((item) => [item.occurrenceId, item]),
    );
    const projections = new Map(
      input.projections.map((item) => [item.occurrenceId, item]),
    );

    return input.occurrences.map((occurrence) => {
      const actual = accepted.get(occurrence.occurrenceId);

      return {
        ...occurrence,
        estimatedSendAt:
          actual === undefined
            ? (projections.get(occurrence.occurrenceId)?.estimatedSendAt ??
              null)
            : null,
        sentAt: actual?.sentAt ?? null,
        status: actual === undefined ? ('QUEUED' as const) : ('SENT' as const),
      };
    });
  }
}
