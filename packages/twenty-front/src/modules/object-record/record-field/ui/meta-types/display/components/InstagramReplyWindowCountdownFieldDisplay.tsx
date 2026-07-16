import { useCurrentMinute } from '@/object-record/record-field/ui/hooks/useCurrentMinute';
import { useDateTimeFieldDisplay } from '@/object-record/record-field/ui/meta-types/hooks/useDateTimeFieldDisplay';
import { getInstagramReplyWindowCountdown } from '@/object-record/record-field/ui/utils/getInstagramReplyWindowCountdown';
import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledCountdown = styled.span<{ status: string }>`
  color: ${({ status }) =>
    status === 'closed' || status === 'urgent'
      ? themeCssVariables.color.red
      : status === 'warning'
        ? themeCssVariables.color.orange
        : themeCssVariables.font.color.primary};
`;

export const InstagramReplyWindowCountdownFieldDisplay = () => {
  const { fieldValue } = useDateTimeFieldDisplay();
  const currentMinute = useCurrentMinute();
  const countdown = getInstagramReplyWindowCountdown({
    deadline: fieldValue,
    now: currentMinute,
  });
  const accessibleLabel = fieldValue
    ? `${countdown.label}. Reply window ends at ${fieldValue}`
    : countdown.label;

  return (
    <StyledCountdown
      aria-label={accessibleLabel}
      status={countdown.status}
      title={accessibleLabel}
    >
      {countdown.label}
    </StyledCountdown>
  );
};
