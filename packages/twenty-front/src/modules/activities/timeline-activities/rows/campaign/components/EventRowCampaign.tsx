import { styled } from '@linaria/react';

import { type TimelineActivity } from '@/activities/timeline-activities/types/TimelineActivity';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledEvent = styled.span`
  color: ${themeCssVariables.font.color.secondary};
`;

const LABELS: Record<string, string> = {
  ACTIVATED: 'Campaign started',
  PAUSED: 'Campaign paused',
  COMPLETED: 'Campaign completed',
  ENROLLED: 'Creator enrolled',
  SCHEDULED: 'Message planned',
  EXCLUDED: 'Creator excluded',
  HELD: 'Email held',
  HOLD_RECOVERED: 'Email hold recovered',
  UNKNOWN: 'Provider outcome unknown',
  UNKNOWN_RECOVERED_ACCEPTED: 'Unknown send recovered as accepted',
  UNKNOWN_RECOVERED_UNACCEPTED: 'Unknown send recovered as not accepted',
  DEFINITELY_UNACCEPTED: 'Email was not accepted',
  PROVIDER_SUBMITTED: 'Email submitted to provider',
  MESSAGE_ACCEPTED: 'Email accepted by provider',
  REPLIED: 'Creator replied',
  STAGE_CHANGED: 'Campaign stage changed',
  TERMINAL: 'Campaign work ended',
};

export const EventRowCampaign = ({
  event,
  createdAt,
}: {
  event: TimelineActivity;
  createdAt?: string;
}) => {
  const properties = event.properties as {
    campaignEvent?: {
      eventKind?: string;
      reason?: string;
      stageLabel?: string;
    };
  } | null;
  const campaignEvent = properties?.campaignEvent;
  const label = LABELS[campaignEvent?.eventKind ?? ''] ?? 'Campaign activity';
  const targetCampaign = event.targetCampaign as { name?: unknown } | null;
  const campaignName =
    typeof targetCampaign?.name === 'string' ? targetCampaign.name : null;

  return (
    <StyledEvent>
      {label}
      {campaignName ? ` · ${campaignName}` : ''}
      {campaignEvent?.stageLabel ? ` · ${campaignEvent.stageLabel}` : ''}
      {campaignEvent?.reason ? ` · ${campaignEvent.reason}` : ''}
      {createdAt ? ` · ${createdAt}` : ''}
    </StyledEvent>
  );
};
