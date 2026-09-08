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

const StyledSequence = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  min-width: 0;
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
  padding: ${themeCssVariables.spacing[3]};
`;

const StyledRow = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledDelay = styled.fieldset`
  border: 0;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
  margin: 0;
  padding: ${themeCssVariables.spacing[2]} 0;
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
      <StyledRow>
        <button
          disabled={!editable}
          onClick={() => addMessage('EMAIL')}
          type="button"
        >
          Add email
        </button>
        <button
          disabled={!editable}
          onClick={() => addMessage('INSTAGRAM')}
          type="button"
        >
          Add Instagram
        </button>
      </StyledRow>
      <StyledList aria-label="Campaign sequence">
        {sequence.messages.map((message, index) => {
          const delay = sequence.delaysSeconds[index];
          const delayParts = splitDelay(delay ?? null);
          const delayIssue = issues.find(
            ({ path }) => path === `delaysSeconds.${index}`,
          );
          const locallyInvalidDelay =
            delay !== null &&
            (delay <= 0 ||
              !Number.isSafeInteger(delay) ||
              !Number.isSafeInteger(delay * 1000));

          return (
            <StyledCard key={message.id}>
              <button
                aria-label={`Edit message ${index + 1}`}
                aria-pressed={selectedMessageId === message.id}
                onClick={() => onSelectMessage(message.id)}
                type="button"
              >
                {index + 1}.{' '}
                {message.channel === 'EMAIL' ? 'Email' : 'Instagram'} —{' '}
                {getMessageSummary(message)}
              </button>
              <StyledRow>
                <button
                  aria-label={`Move message ${index + 1} up`}
                  disabled={!editable || index === 0}
                  onClick={() => {
                    onChange(
                      moveCampaignSequenceMessage(sequence, index, index - 1),
                    );
                  }}
                  type="button"
                >
                  Move up
                </button>
                <button
                  aria-label={`Move message ${index + 1} down`}
                  disabled={!editable || index === sequence.messages.length - 1}
                  onClick={() => {
                    onChange(
                      moveCampaignSequenceMessage(sequence, index, index + 1),
                    );
                  }}
                  type="button"
                >
                  Move down
                </button>
                <button
                  aria-label={`Remove message ${index + 1}`}
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
                >
                  Remove
                </button>
              </StyledRow>
              {index < sequence.messages.length - 1 ? (
                <StyledDelay>
                  <legend>Estimated elapsed delay {index + 1}</legend>
                  {delayUnits.map((unit) => (
                    <label key={unit.key}>
                      {unit.key}
                      <input
                        aria-label={`Delay ${index + 1} ${unit.key}`}
                        disabled={!editable}
                        min={0}
                        onChange={(event) =>
                          changeDelayPart(index, unit.key, event.target.value)
                        }
                        step={1}
                        type="number"
                        value={delayParts[unit.key]}
                      />
                    </label>
                  ))}
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
