import { type MyahInboxThread } from '@/myah/inbox/hooks/useMyahInboxThreads';
import { useOpenRecordInSidePanel } from '@/side-panel/hooks/useOpenRecordInSidePanel';
import { styled } from '@linaria/react';
import { type KeyboardEvent } from 'react';
import { Tag } from 'twenty-ui/data-display';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledThreadRow = styled.div<{ isSelected: boolean }>`
  background: ${({ isSelected }) =>
    isSelected
      ? themeCssVariables.background.transparent.light
      : 'transparent'};
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  color: ${themeCssVariables.font.color.primary};
  display: flex;
  flex-direction: column;
  font-family: ${themeCssVariables.font.family};

  &:hover {
    background: ${themeCssVariables.background.transparent.lighter};
  }
`;

const StyledThreadSelectButton = styled.button`
  background: transparent;
  border: 0;
  color: inherit;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  font: inherit;
  gap: ${themeCssVariables.spacing[1]};
  padding: ${themeCssVariables.spacing[3]} ${themeCssVariables.spacing[3]} 0;
  text-align: left;
  width: 100%;

  &:focus-visible {
    outline: 2px solid ${themeCssVariables.border.color.medium};
    outline-offset: -2px;
  }
`;

const StyledRowHeader = styled.span`
  align-items: baseline;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: space-between;
  width: 100%;
`;

const StyledSubject = styled.span`
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledTimestamp = styled.time`
  color: ${themeCssVariables.font.color.tertiary};
  flex-shrink: 0;
  font-size: ${themeCssVariables.font.size.xs};
`;

const StyledMeta = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};
  overflow: hidden;
  padding: 0 ${themeCssVariables.spacing[3]};
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
`;

const StyledCreatorLink = styled.button`
  background: transparent;
  border: 0;
  color: inherit;
  cursor: pointer;
  font: inherit;
  overflow: hidden;
  padding: 0;
  text-align: left;
  text-decoration: underline;
  text-overflow: ellipsis;
  white-space: nowrap;

  &:focus-visible {
    outline: 2px solid ${themeCssVariables.border.color.medium};
    outline-offset: 2px;
  }
`;

const StyledCampaignTag = styled.div`
  align-self: flex-start;
`;

const StyledPreview = styled.span`
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  color: ${themeCssVariables.font.color.tertiary};
  display: -webkit-box;
  font-size: ${themeCssVariables.font.size.xs};
  line-clamp: 2;
  overflow: hidden;
`;

const StyledState = styled.span<{ isAttentionNeeded: boolean }>`
  color: ${({ isAttentionNeeded }) =>
    isAttentionNeeded
      ? themeCssVariables.font.color.danger
      : themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: ${({ isAttentionNeeded }) =>
    isAttentionNeeded ? themeCssVariables.font.weight.medium : 'inherit'};
`;

export type MyahInboxThreadRowProps = {
  thread: MyahInboxThread;
  isSelected: boolean;
  tabIndex: number;
  rowRef: (element: HTMLButtonElement | null) => void;
  onSelect: (threadId: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
};

export const MyahInboxThreadRow = ({
  thread,
  isSelected,
  tabIndex,
  rowRef,
  onSelect,
  onKeyDown,
}: MyahInboxThreadRowProps) => {
  const { openRecordInSidePanel } = useOpenRecordInSidePanel();
  const creator = thread.creator;
  const isSnoozeDue =
    thread.state === 'SNOOZED' &&
    thread.snoozedUntil !== null &&
    Date.parse(thread.snoozedUntil) <= Date.now();

  return (
    <StyledThreadRow isSelected={isSelected}>
      <StyledThreadSelectButton
        ref={rowRef}
        role="option"
        aria-selected={isSelected}
        tabIndex={tabIndex}
        onClick={() => onSelect(thread.id)}
        onKeyDown={onKeyDown}
      >
        <StyledRowHeader>
          <StyledSubject>{thread.subject || 'No subject'}</StyledSubject>
          <StyledTimestamp dateTime={thread.lastActivityAt}>
            {new Date(thread.lastActivityAt).toLocaleDateString()}
          </StyledTimestamp>
        </StyledRowHeader>
        {thread.campaign?.name ? (
          <StyledCampaignTag aria-label={`Campaign: ${thread.campaign.name}`}>
            <Tag color="blue" text={thread.campaign.name} />
          </StyledCampaignTag>
        ) : null}
        <StyledPreview>
          {thread.lastMessagePreview || 'No message preview'}
        </StyledPreview>
        <StyledState isAttentionNeeded={isSnoozeDue}>
          {isSnoozeDue
            ? 'Snooze due · Attention needed'
            : thread.state.replaceAll('_', ' ').toLowerCase()}
        </StyledState>
      </StyledThreadSelectButton>
      <StyledMeta>
        {creator ? (
          <StyledCreatorLink
            type="button"
            onClick={() =>
              openRecordInSidePanel({
                recordId: creator.id,
                objectNameSingular: 'creator',
                resetNavigationStack: true,
              })
            }
          >
            {creator.name}
          </StyledCreatorLink>
        ) : (
          (thread.lastMessageSender ?? 'Unlinked sender')
        )}
      </StyledMeta>
    </StyledThreadRow>
  );
};
