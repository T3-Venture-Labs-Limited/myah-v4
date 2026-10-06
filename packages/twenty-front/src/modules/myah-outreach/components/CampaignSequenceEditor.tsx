import { useTextFieldFocusProps } from '@/ui/utilities/focus/hooks/useTextFieldFocusProps';
import { styled } from '@linaria/react';
import { v4 as uuidv4 } from 'uuid';
import {
  insertCampaignSequenceMessage,
  moveCampaignSequenceMessage,
  removeCampaignSequenceMessage,
  type CampaignSequence,
  type CampaignSequenceIssue,
  type CampaignSequenceMessage,
} from 'twenty-shared/workflow';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { Button } from 'twenty-ui/input';

const StyledSequence = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  min-width: 0;
`;

const StyledHeading = styled.h2`
  font-size: ${themeCssVariables.font.size.md};
  margin: 0;
`;

const StyledList = styled.ol`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  list-style: none;
  margin: 0;
  padding: 0;
`;

const StyledCard = styled.li`
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  min-width: 0;
  padding: ${themeCssVariables.spacing[3]};

  &[data-selected='true'] {
    background: ${themeCssVariables.background.primary};
    border-color: ${themeCssVariables.color.pink};
  }
`;

const StyledStep = styled.button`
  background: transparent;
  border: 0;
  color: inherit;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  min-width: 0;
  overflow-wrap: anywhere;
  padding: 0;
  text-align: left;
  white-space: normal;
`;

const StyledSummary = styled.span`
  color: ${themeCssVariables.font.color.secondary};
`;

const StyledMeta = styled.small`
  color: ${themeCssVariables.font.color.secondary};
`;

const StyledRow = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledDelay = styled.fieldset`
  border: 0;
  border-top: 1px solid ${themeCssVariables.border.color.medium};
  margin: 0;
  min-width: 0;
  padding: ${themeCssVariables.spacing[2]} 0 0;

  input {
    background-color: ${themeCssVariables.background.transparent.lighter};
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: ${themeCssVariables.border.radius.sm};
    box-sizing: border-box;
    color: ${themeCssVariables.font.color.primary};
    font: inherit;
    margin: 0 ${themeCssVariables.spacing[2]};
    padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
    width: 64px;
  }
  details {
    color: ${themeCssVariables.font.color.secondary};
    font-size: ${themeCssVariables.font.size.sm};
    margin-top: ${themeCssVariables.spacing[2]};
  }
  summary {
    cursor: pointer;
  }
`;

const StyledIssue = styled.div`
  color: ${themeCssVariables.color.red};
`;

const delayUnits = [
  { key: 'days', seconds: 86400 },
  { key: 'hours', seconds: 3600 },
  { key: 'minutes', seconds: 60 },
  { key: 'seconds', seconds: 1 },
] as const;

type DelayPart = (typeof delayUnits)[number]['key'];

const splitDelay = (delay: number | null): Record<DelayPart, string> => {
  if (delay === null || !Number.isSafeInteger(delay) || delay < 0) {
    return { days: '', hours: '', minutes: '', seconds: '' };
  }

  let remaining = delay;
  const days = Math.floor(remaining / 86400);
  remaining %= 86400;
  const hours = Math.floor(remaining / 3600);
  remaining %= 3600;
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  return {
    days: String(days),
    hours: String(hours),
    minutes: String(minutes),
    seconds: String(seconds),
  };
};

const getMessageSummary = (message: CampaignSequenceMessage): string => {
  if (message.channel === 'INSTAGRAM') {
    return message.text.trim() || 'Untitled Instagram message';
  }

  return message.subject.trim() || 'Untitled email';
};

type CampaignSequenceEditorProps = {
  editable: boolean;
  issues: CampaignSequenceIssue[];
  onChange: (sequence: CampaignSequence) => void;
  onSelectMessage: (messageId: string | null) => void;
  selectedMessageId: string | null;
  sequence: CampaignSequence;
};

export const CampaignSequenceEditor = ({
  editable,
  issues,
  onChange,
  onSelectMessage,
  selectedMessageId,
  sequence,
}: CampaignSequenceEditorProps) => {
  const textFieldFocus = useTextFieldFocusProps();
  const addMessage = (channel: CampaignSequenceMessage['channel']) => {
    const message: CampaignSequenceMessage =
      channel === 'EMAIL'
        ? {
            id: uuidv4(),
            channel,
            subject: '',
            body: '',
            files: [],
            replyToThread: false,
          }
        : { id: uuidv4(), channel, text: '' };
    const next = insertCampaignSequenceMessage(
      sequence,
      sequence.messages.length,
      message,
    );

    onChange(next);
    onSelectMessage(message.id);
  };

  const changeDelayPart = (
    delayIndex: number,
    changedPart: DelayPart,
    rawValue: string,
  ) => {
    const currentParts = splitDelay(sequence.delaysSeconds[delayIndex]);
    const nextParts = { ...currentParts, [changedPart]: rawValue };
    const hasAnyValue = Object.values(nextParts).some((value) => value !== '');
    let nextDelay: number | null = null;

    if (hasAnyValue) {
      nextDelay = delayUnits.reduce((total, unit) => {
        const value =
          nextParts[unit.key] === '' ? 0 : Number(nextParts[unit.key]);

        return total + value * unit.seconds;
      }, 0);
    }

    const delaysSeconds = [...sequence.delaysSeconds];
    delaysSeconds[delayIndex] = nextDelay;
    onChange({ ...sequence, delaysSeconds });
  };

  return (
    <StyledSequence aria-label="Sequence messages">
      <StyledHeading>Ordered steps</StyledHeading>
      <StyledRow role="group" aria-label="Add sequence step">
        <Button
          accent="brand"
          disabled={!editable}
          onClick={() => addMessage('EMAIL')}
          size="small"
          title="Add email"
          type="button"
          variant="primary"
        />
        <Button
          disabled={!editable}
          onClick={() => addMessage('INSTAGRAM')}
          size="small"
          title="Add Instagram"
          type="button"
          variant="secondary"
        />
      </StyledRow>
      <StyledList aria-label="Campaign sequence">
        {sequence.messages.map((message, index) => {
          const delay = sequence.delaysSeconds[index];
          const delayParts = splitDelay(delay ?? null);
          const primaryUnit =
            delay === null || delay % 86400 === 0
              ? delayUnits[0]
              : delay % 3600 === 0
                ? delayUnits[1]
                : delay % 60 === 0
                  ? delayUnits[2]
                  : delayUnits[3];
          const delayIssue = issues.find(
            ({ path }) => path === `delaysSeconds.${index}`,
          );
          const locallyInvalidDelay =
            delay !== null &&
            (delay <= 0 ||
              !Number.isSafeInteger(delay) ||
              !Number.isSafeInteger(delay * 1000));

          return (
            <StyledCard
              data-selected={selectedMessageId === message.id}
              key={message.id}
            >
              <StyledStep
                aria-label={`Edit message ${index + 1}`}
                aria-pressed={selectedMessageId === message.id}
                onClick={() => onSelectMessage(message.id)}
                type="button"
              >
                <strong>
                  {index + 1}.{' '}
                  {message.channel === 'EMAIL' ? 'Email' : 'Instagram'}
                </strong>
                <StyledSummary>{getMessageSummary(message)}</StyledSummary>
                <StyledMeta>
                  {message.channel === 'INSTAGRAM'
                    ? sequence.messages
                        .slice(0, index)
                        .some(({ channel }) => channel === 'INSTAGRAM')
                      ? '⚠ Second Instagram DM'
                      : 'Instagram DM'
                    : message.replyToThread
                      ? 'Reply to earlier email'
                      : 'New conversation'}
                </StyledMeta>
              </StyledStep>
              <StyledRow
                role="group"
                aria-label={`Message ${index + 1} actions`}
              >
                <Button
                  ariaLabel={`Move message ${index + 1} up`}
                  title="Move up"
                  size="small"
                  variant="tertiary"
                  disabled={!editable || index === 0}
                  onClick={() => {
                    onChange(
                      moveCampaignSequenceMessage(sequence, index, index - 1),
                    );
                  }}
                  type="button"
                />
                <Button
                  ariaLabel={`Move message ${index + 1} down`}
                  title="Move down"
                  size="small"
                  variant="tertiary"
                  disabled={!editable || index === sequence.messages.length - 1}
                  onClick={() => {
                    onChange(
                      moveCampaignSequenceMessage(sequence, index, index + 1),
                    );
                  }}
                  type="button"
                />
                <Button
                  ariaLabel={`Remove message ${index + 1}`}
                  title="Remove"
                  size="small"
                  variant="tertiary"
                  accent="danger"
                  disabled={!editable}
                  onClick={() => {
                    const next = removeCampaignSequenceMessage(sequence, index);
                    onChange(next);
                    if (selectedMessageId === message.id) {
                      onSelectMessage(
                        next.messages[Math.min(index, next.messages.length - 1)]
                          ?.id ?? null,
                      );
                    }
                  }}
                  type="button"
                />
              </StyledRow>
              {index < sequence.messages.length - 1 ? (
                <StyledDelay>
                  <legend>Wait before step {index + 2}</legend>
                  <label>
                    Wait
                    <input
                      onFocus={textFieldFocus.onFocus}
                      onBlur={textFieldFocus.onBlur}
                      aria-label={`Wait before step ${index + 2}`}
                      disabled={!editable}
                      min={1}
                      step={1}
                      type="number"
                      value={delay === null ? '' : delay / primaryUnit.seconds}
                      onChange={(event) => {
                        const rawValue = event.target.value;
                        const delaysSeconds = [...sequence.delaysSeconds];
                        delaysSeconds[index] =
                          rawValue === ''
                            ? null
                            : Number(rawValue) * primaryUnit.seconds;
                        onChange({ ...sequence, delaysSeconds });
                      }}
                    />
                    {delay === primaryUnit.seconds
                      ? primaryUnit.key.replace(/s$/, '')
                      : primaryUnit.key}
                  </label>
                  <details>
                    <summary>Edit precise delay</summary>
                    <StyledRow>
                      {delayUnits.map((unit) => (
                        <label key={unit.key}>
                          {unit.key}
                          <input
                            onFocus={textFieldFocus.onFocus}
                            onBlur={textFieldFocus.onBlur}
                            aria-label={`Delay ${index + 1} ${unit.key}`}
                            disabled={!editable}
                            min={0}
                            onChange={(event) =>
                              changeDelayPart(
                                index,
                                unit.key,
                                event.target.value,
                              )
                            }
                            step={1}
                            type="number"
                            value={delayParts[unit.key]}
                          />
                        </label>
                      ))}
                    </StyledRow>
                  </details>
                  {delay === null ? (
                    <StyledIssue>Set a delay between messages</StyledIssue>
                  ) : locallyInvalidDelay ? (
                    <StyledIssue>
                      {delay <= 0
                        ? 'Delay must be greater than zero'
                        : 'Delay is too large'}
                    </StyledIssue>
                  ) : delayIssue ? (
                    <StyledIssue>{delayIssue.message}</StyledIssue>
                  ) : null}
                </StyledDelay>
              ) : null}
            </StyledCard>
          );
        })}
      </StyledList>
    </StyledSequence>
  );
};
