import { styled } from '@linaria/react';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { useIcons } from 'twenty-ui/icon';
import { Button } from 'twenty-ui/input';
import { AppTooltip, TooltipDelay, TooltipPosition } from 'twenty-ui/surfaces';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledActionGroup = styled.div<{ $alignEnd?: boolean }>`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[0.5]};
  margin-left: ${({ $alignEnd }) => ($alignEnd ? 'auto' : '0')};
  max-width: 100%;
  min-width: 0;
  overflow-wrap: anywhere;
`;

const StyledStatus = styled.span`
  font-size: ${themeCssVariables.font.size.xs};
  white-space: nowrap;
`;

const StyledAccessibleDescription = styled.span`
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  height: 1px;
  overflow: hidden;
  position: absolute;
  white-space: nowrap;
  width: 1px;
`;

export type MyahInboxReplyAiActionsProps = {
  disabled?: boolean;
  onOpenAiGuidance?: () => void | Promise<void>;
  guidanceUnavailableReason?: string;
  // Feedback is local, reversible preview state. It resets whenever this key
  // changes, e.g. a combination of the draft body and the exact target scope.
  feedbackResetKey?: string;
  status?: ReactNode;
};

// Shared by the Email and Instagram reply boxes so both channels present the
// exact same accessible Open AI guidance and thumbs feedback controls.
export const MyahInboxReplyAiActions = ({
  disabled = false,
  onOpenAiGuidance,
  guidanceUnavailableReason,
  feedbackResetKey = '',
  status,
}: MyahInboxReplyAiActionsProps) => {
  const instanceId = useId();
  const { getIcon } = useIcons();
  const thumbsUpIcon = getIcon('IconThumbUp');
  const thumbsDownIcon = getIcon('IconThumbDown');
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);
  const guidanceDescriptionId = `${instanceId}-guidance-description`;
  const feedbackDescriptionId = `${instanceId}-feedback-description`;
  const guidanceAnchorTestId = `myah-inbox-guidance-tooltip-anchor-${instanceId}`;
  const feedbackAnchorTestIdPrefix = `myah-inbox-feedback-tooltip-${instanceId}`;

  useEffect(() => {
    setFeedback(null);
  }, [feedbackResetKey]);

  return (
    <StyledActionGroup $alignEnd role="group" aria-label="AI actions">
      <div data-testid={guidanceAnchorTestId}>
        <Button
          title="Guidance"
          ariaLabel="Open AI guidance"
          variant="tertiary"
          size="small"
          disabled={disabled}
          aria-disabled={
            Boolean(guidanceUnavailableReason || !onOpenAiGuidance) || undefined
          }
          aria-describedby={
            guidanceUnavailableReason ? guidanceDescriptionId : undefined
          }
          onClick={guidanceUnavailableReason ? undefined : onOpenAiGuidance}
        />
      </div>
      <Button
        Icon={thumbsUpIcon}
        ariaLabel="Thumbs up"
        aria-pressed={feedback === 'up'}
        aria-describedby={feedbackDescriptionId}
        data-selected={feedback === 'up' || undefined}
        dataTestId={`${feedbackAnchorTestIdPrefix}-up`}
        variant={feedback === 'up' ? 'secondary' : 'tertiary'}
        accent={feedback === 'up' ? 'brand' : 'default'}
        size="small"
        disabled={disabled}
        onClick={() =>
          setFeedback((selection) => (selection === 'up' ? null : 'up'))
        }
      />
      <Button
        Icon={thumbsDownIcon}
        ariaLabel="Thumbs down"
        aria-pressed={feedback === 'down'}
        aria-describedby={feedbackDescriptionId}
        data-selected={feedback === 'down' || undefined}
        dataTestId={`${feedbackAnchorTestIdPrefix}-down`}
        variant={feedback === 'down' ? 'secondary' : 'tertiary'}
        accent={feedback === 'down' ? 'brand' : 'default'}
        size="small"
        disabled={disabled}
        onClick={() =>
          setFeedback((selection) => (selection === 'down' ? null : 'down'))
        }
      />
      {status === undefined || status === null ? null : (
        <StyledStatus>{status}</StyledStatus>
      )}
      {guidanceUnavailableReason && (
        <>
          <StyledAccessibleDescription id={guidanceDescriptionId}>
            {guidanceUnavailableReason}
          </StyledAccessibleDescription>
          <AppTooltip
            anchorSelect={`[data-testid='${guidanceAnchorTestId}']`}
            content={guidanceUnavailableReason}
            delay={TooltipDelay.shortDelay}
            place={TooltipPosition.Top}
          />
        </>
      )}
      <StyledAccessibleDescription id={feedbackDescriptionId}>
        Feedback is a local preview and is not saved.
      </StyledAccessibleDescription>
      <AppTooltip
        anchorSelect={`[data-testid^='${feedbackAnchorTestIdPrefix}']`}
        content="Feedback is a local preview and is not saved."
        delay={TooltipDelay.shortDelay}
        place={TooltipPosition.Top}
      />
    </StyledActionGroup>
  );
};
