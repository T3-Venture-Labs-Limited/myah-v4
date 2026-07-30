import { FormSingleRecordPicker } from '@/object-record/record-field/ui/form-types/components/FormSingleRecordPicker';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { useOpenRecordInSidePanel } from '@/side-panel/hooks/useOpenRecordInSidePanel';
import { TextInput } from '@/ui/input/components/TextInput';
import { styled } from '@linaria/react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Tag } from 'twenty-ui/data-display';
import { IconFilter } from 'twenty-ui/icon';
import { Button, IconButton } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { type MyahInboxThread } from '@/myah/inbox/hooks/useMyahInboxThreads';
import {
  type MyahInboxFilters,
  type MyahInboxStateFilter,
} from '@/myah/inbox/states/myahInboxSelectionState';
import { Select } from '@/ui/input/components/Select';
import { Dropdown } from '@/ui/layout/dropdown/components/Dropdown';
import { DropdownContent } from '@/ui/layout/dropdown/components/DropdownContent';

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
  padding: ${themeCssVariables.spacing[3]};
`;

const StyledSearch = styled.div`
  position: relative;
`;

const StyledFilterTrigger = styled.div`
  bottom: ${themeCssVariables.spacing[1]};
  position: absolute;
  right: ${themeCssVariables.spacing[1]};
`;

const StyledFilterMenu = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[3]};
`;

const StyledList = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
`;

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

const STATE_OPTIONS = [
  { label: 'Needs reply', value: 'NEEDS_REPLY' },
  { label: 'Waiting on creator', value: 'WAITING_ON_CREATOR' },
  { label: 'Snoozed', value: 'SNOOZED' },
  { label: 'Closed', value: 'CLOSED' },
] satisfies Array<{ label: string; value: MyahInboxStateFilter }>;

const MAX_TIMEOUT_DELAY = 2_147_483_647;

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
  const [snoozeClock, setSnoozeClock] = useState(0);
  const { objectMetadataItems } = useObjectMetadataItems();
  const { openRecordInSidePanel } = useOpenRecordInSidePanel();
  const isCampaignMetadataReady = objectMetadataItems.some(
    (item) => item.nameSingular === 'campaign',
  );

  useEffect(() => {
    const now = Date.now();
    let nearestFutureSnooze: number | null = null;

    for (const thread of threads) {
      if (thread.state !== 'SNOOZED' || thread.snoozedUntil === null) {
        continue;
      }

      const snoozeDeadline = Date.parse(thread.snoozedUntil);

      if (
        Number.isNaN(snoozeDeadline) ||
        snoozeDeadline <= now ||
        (nearestFutureSnooze !== null && snoozeDeadline >= nearestFutureSnooze)
      ) {
        continue;
      }

      nearestFutureSnooze = snoozeDeadline;
    }

    if (nearestFutureSnooze === null) {
      return;
    }

    const timeoutId = window.setTimeout(
      () => setSnoozeClock((clock) => clock + 1),
      Math.min(nearestFutureSnooze - now, MAX_TIMEOUT_DELAY),
    );

    return () => window.clearTimeout(timeoutId);
  }, [snoozeClock, threads]);

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
      return (
        <StyledStatus>
          <StyledStatusTitle>Inbox is clear</StyledStatusTitle>
          <span>New readable conversations will appear here.</span>
        </StyledStatus>
      );
    }

    return (
      <StyledList role="listbox" aria-label="Inbox conversations">
        {threads.map((thread, index) => {
          const isSelected = selectedThreadId === thread.id;
          const creator = thread.creator;
          const isSnoozeDue =
            thread.state === 'SNOOZED' &&
            thread.snoozedUntil !== null &&
            Date.parse(thread.snoozedUntil) <= Date.now();

          return (
            <StyledThreadRow key={thread.id} isSelected={isSelected}>
              <StyledThreadSelectButton
                ref={(element) => {
                  rowRefs.current[index] = element;
                }}
                role="option"
                aria-selected={isSelected}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => onSelectThread(thread.id)}
                onKeyDown={(event) => handleRowKeyDown(event, index)}
              >
                <StyledRowHeader>
                  <StyledSubject>
                    {thread.subject || 'No subject'}
                  </StyledSubject>
                  <StyledTimestamp dateTime={thread.lastActivityAt}>
                    {new Date(thread.lastActivityAt).toLocaleDateString()}
                  </StyledTimestamp>
                </StyledRowHeader>
                {thread.campaign?.name ? (
                  <StyledCampaignTag
                    aria-label={`Campaign: ${thread.campaign.name}`}
                  >
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
    <StyledListPanel aria-label="Inbox conversations">
      <StyledFilters>
        <StyledSearch>
          <TextInput
            label="Search conversations"
            placeholder="Search messages"
            value={filters.search}
            fullWidth
            onChange={(search) => onFiltersChange({ ...filters, search })}
          />
          <StyledFilterTrigger>
            <Dropdown
              dropdownId="myah-inbox-filter-menu"
              clickableComponent={
                <IconButton
                  Icon={IconFilter}
                  ariaLabel="Filter conversations"
                  size="small"
                  variant="tertiary"
                />
              }
              dropdownComponents={
                <DropdownContent>
                  <StyledFilterMenu aria-label="Inbox filters">
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
                    {isCampaignMetadataReady ? (
                      <FormSingleRecordPicker
                        label="Campaign filter"
                        objectNameSingulars={['campaign']}
                        defaultValue={filters.campaignId}
                        onChange={(campaignId) =>
                          onFiltersChange({ ...filters, campaignId })
                        }
                      />
                    ) : (
                      <span role="status">Loading campaign filter</span>
                    )}
                  </StyledFilterMenu>
                </DropdownContent>
              }
              dropdownPlacement="bottom-end"
            />
          </StyledFilterTrigger>
        </StyledSearch>
      </StyledFilters>
      {renderBody()}
    </StyledListPanel>
  );
};
