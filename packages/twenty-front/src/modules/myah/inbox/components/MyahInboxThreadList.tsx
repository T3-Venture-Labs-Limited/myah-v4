import { FormSingleRecordPicker } from '@/object-record/record-field/ui/form-types/components/FormSingleRecordPicker';
import { TextInput } from '@/ui/input/components/TextInput';
import { styled } from '@linaria/react';
import { useRef, type KeyboardEvent } from 'react';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { type MyahInboxThread } from '@/myah/inbox/hooks/useMyahInboxThreads';
import {
  type MyahInboxFilters,
  type MyahInboxQueueFilter,
  type MyahInboxStateFilter,
} from '@/myah/inbox/states/myahInboxSelectionState';
import { Select } from '@/ui/input/components/Select';

const StyledListPanel = styled.section`
  background: ${themeCssVariables.background.primary};
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
`;

const StyledFilters = styled.div`
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: grid;
  gap: ${themeCssVariables.spacing[2]};
  grid-template-columns: repeat(2, minmax(0, 1fr));
  padding: ${themeCssVariables.spacing[3]};
`;

const StyledSearch = styled.div`
  grid-column: 1 / -1;
`;

const StyledList = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
`;

const StyledThreadRow = styled.button<{ isSelected: boolean }>`
  background: ${({ isSelected }) =>
    isSelected
      ? themeCssVariables.background.transparent.light
      : 'transparent'};
  border: 0;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  display: flex;
  flex-direction: column;
  font-family: ${themeCssVariables.font.family};
  gap: ${themeCssVariables.spacing[1]};
  padding: ${themeCssVariables.spacing[3]};
  text-align: left;

  &:hover {
    background: ${themeCssVariables.background.transparent.lighter};
  }

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

const StyledMeta = styled.span`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
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

const StyledStatus = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: center;
  padding: ${themeCssVariables.spacing[6]};
  text-align: center;
`;

const StyledStatusTitle = styled.strong`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.sm};
`;

const StyledLoadMore = styled.div`
  display: flex;
  justify-content: center;
  padding: ${themeCssVariables.spacing[3]};
`;

const QUEUE_OPTIONS = [
  { label: 'Inbox', value: 'CREATOR_LINKED' },
  { label: 'Unmatched', value: 'UNMATCHED' },
] satisfies Array<{ label: string; value: MyahInboxQueueFilter }>;

const OWNER_OPTIONS = [
  { label: 'Me', value: 'ME' },
  { label: 'Unassigned', value: 'UNASSIGNED' },
];

const STATE_OPTIONS = [
  { label: 'Needs reply', value: 'NEEDS_REPLY' },
  { label: 'Waiting on creator', value: 'WAITING_ON_CREATOR' },
  { label: 'Snoozed', value: 'SNOOZED' },
  { label: 'Closed', value: 'CLOSED' },
] satisfies Array<{ label: string; value: MyahInboxStateFilter }>;

type MyahInboxThreadListProps = {
  threads: MyahInboxThread[];
  filters: MyahInboxFilters;
  selectedThreadId: string | null;
  loading: boolean;
  loadingMore: boolean;
  error: { message: string } | undefined;
  hasNextPage: boolean;
  onSelectThread: (threadId: string) => void;
  onFiltersChange: (filters: MyahInboxFilters) => void;
  onLoadMore: () => void;
  onRetry: () => void;
};

export const MyahInboxThreadList = ({
  threads,
  filters,
  selectedThreadId,
  loading,
  loadingMore,
  error,
  hasNextPage,
  onSelectThread,
  onFiltersChange,
  onLoadMore,
  onRetry,
}: MyahInboxThreadListProps) => {
  // oxlint-disable-next-line twenty/no-state-useref -- DOM refs coordinate roving keyboard focus.
  const rowRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const handleRowKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    rowIndex: number,
  ) => {
    let nextIndex: number | null = null;

    if (event.key === 'ArrowDown') {
      nextIndex = Math.min(rowIndex + 1, threads.length - 1);
    } else if (event.key === 'ArrowUp') {
      nextIndex = Math.max(rowIndex - 1, 0);
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = threads.length - 1;
    }

    if (nextIndex === null || nextIndex === rowIndex) {
      return;
    }

    event.preventDefault();
    onSelectThread(threads[nextIndex].id);
    rowRefs.current[nextIndex]?.focus();
  };

  const renderBody = () => {
    if (loading) {
      return <StyledStatus role="status">Loading conversations</StyledStatus>;
    }

    if (error) {
      return (
        <StyledStatus role="alert">
          <StyledStatusTitle>Could not load the Inbox</StyledStatusTitle>
          <span>{error.message}</span>
          <Button
            title="Try again"
            variant="secondary"
            size="small"
            onClick={onRetry}
          />
        </StyledStatus>
      );
    }

    if (threads.length === 0) {
      const isUnmatched = filters.queue === 'UNMATCHED';

      return (
        <StyledStatus>
          <StyledStatusTitle>
            {isUnmatched ? 'No unmatched conversations' : 'Inbox is clear'}
          </StyledStatusTitle>
          <span>
            {isUnmatched
              ? 'Threads without a creator match will appear here.'
              : 'New creator conversations will appear here.'}
          </span>
        </StyledStatus>
      );
    }

    return (
      <StyledList role="listbox" aria-label="Inbox conversations">
        {threads.map((thread, index) => {
          const isSelected = selectedThreadId === thread.id;
          const isSnoozeDue =
            thread.state === 'SNOOZED' &&
            thread.snoozedUntil !== null &&
            Date.parse(thread.snoozedUntil) <= Date.now();

          return (
            <StyledThreadRow
              key={thread.id}
              ref={(element) => {
                rowRefs.current[index] = element;
              }}
              role="option"
              aria-selected={isSelected}
              isSelected={isSelected}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => onSelectThread(thread.id)}
              onKeyDown={(event) => handleRowKeyDown(event, index)}
            >
              <StyledRowHeader>
                <StyledSubject>{thread.subject || 'No subject'}</StyledSubject>
                <StyledTimestamp dateTime={thread.lastActivityAt}>
                  {new Date(thread.lastActivityAt).toLocaleDateString()}
                </StyledTimestamp>
              </StyledRowHeader>
              <StyledMeta>
                {thread.creator?.name ??
                  thread.lastMessageSender ??
                  'Unmatched sender'}
              </StyledMeta>
              <StyledPreview>
                {thread.lastMessagePreview || 'No message preview'}
              </StyledPreview>
              <StyledState isAttentionNeeded={isSnoozeDue}>
                {isSnoozeDue
                  ? 'Snooze due · Attention needed'
                  : thread.state.replaceAll('_', ' ').toLowerCase()}
              </StyledState>
            </StyledThreadRow>
          );
        })}
        {(hasNextPage || loadingMore) && (
          <StyledLoadMore role={loadingMore ? 'status' : undefined}>
            <Button
              title={
                loadingMore
                  ? 'Loading more conversations'
                  : 'Load more conversations'
              }
              variant="secondary"
              size="small"
              disabled={loadingMore}
              onClick={onLoadMore}
            />
          </StyledLoadMore>
        )}
      </StyledList>
    );
  };

  return (
    <StyledListPanel aria-label="Inbox attention queue">
      <StyledFilters>
        <Select
          dropdownId="myah-inbox-queue-filter"
          label="Queue"
          fullWidth
          value={filters.queue}
          options={QUEUE_OPTIONS}
          onChange={(queue) => onFiltersChange({ ...filters, queue })}
        />
        <Select
          dropdownId="myah-inbox-owner-filter"
          label="Owner"
          fullWidth
          value={filters.owner}
          options={OWNER_OPTIONS}
          emptyOption={{ label: 'All owners', value: '' }}
          onChange={(owner) => onFiltersChange({ ...filters, owner })}
        />
        <Select
          dropdownId="myah-inbox-state-filter"
          label="State"
          fullWidth
          value={filters.states[0] ?? ''}
          options={STATE_OPTIONS}
          emptyOption={{ label: 'All states', value: '' }}
          onChange={(state) =>
            onFiltersChange({
              ...filters,
              states: state ? [state] : [],
            })
          }
        />
        <FormSingleRecordPicker
          label="Campaign filter"
          objectNameSingulars={['campaign']}
          defaultValue={filters.campaignId}
          onChange={(campaignId) => onFiltersChange({ ...filters, campaignId })}
        />
        <StyledSearch>
          <TextInput
            label="Search conversations"
            placeholder="Search messages"
            value={filters.search}
            fullWidth
            onChange={(search) => onFiltersChange({ ...filters, search })}
          />
        </StyledSearch>
      </StyledFilters>
      {renderBody()}
    </StyledListPanel>
  );
};
