import { render, screen } from '@testing-library/react';

import { EventRowCampaign } from '@/activities/timeline-activities/rows/campaign/components/EventRowCampaign';
import { type TimelineActivity } from '@/activities/timeline-activities/types/TimelineActivity';

it('attributes global Creator timeline evidence to its Campaign', () => {
  render(
    <EventRowCampaign
      event={
        {
          properties: {
            campaignEvent: {
              eventKind: 'STAGE_CHANGED',
              stageLabel: 'Contacted',
            },
          },
          targetCampaign: { name: 'Fall Launch' },
        } as unknown as TimelineActivity
      }
      createdAt="today"
    />,
  );

  expect(screen.getByText(/Campaign stage changed/)).toHaveTextContent(
    'Campaign stage changed · Fall Launch · Contacted · today',
  );
});
