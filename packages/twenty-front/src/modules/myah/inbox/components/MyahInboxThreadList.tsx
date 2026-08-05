import {
  MyahInboxThreadFilters,
  type MyahInboxRefreshStatus,
} from '@/myah/inbox/components/MyahInboxThreadFilters';
import { MyahInboxThreadRow } from '@/myah/inbox/components/MyahInboxThreadRow';
import { type MyahInboxThread } from '@/myah/inbox/hooks/useMyahInboxThreads';
import { type MyahInboxFilters } from '@/myah/inbox/states/myahInboxSelectionState';
import { styled } from '@linaria/react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledListPanel = styled.section`
  background: ${themeCssVariables.background.primary};
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
`;

const StyledList = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
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

const MAX_TIMEOUT_DELAY = 2_147_483_647;

type MyahInboxThreadListProps = {
  threads: MyahInboxThread[];
  filters: MyahInboxFilters;
  selectedThreadId: string | null;
  loading: boolean;
  loadingMore: boolean;
  isRefreshing: boolean;
  refreshStatus: MyahInboxRefreshStatus;
  refreshError: string | null;
  error: { message: string } | undefined;
  hasNextPage: boolean;
  onSelectThread: (threadId: string) => void;
  onFiltersChange: (filters: MyahInboxFilters) => void;
  onLoadMore: () => void;
  onRefresh: () => void;
  onRetry: () => void;
};

export const MyahInboxThreadList = ({
  threads,
  filters,
  selectedThreadId,
  loading,
  loadingMore,
  isRefreshing,
  refreshStatus,
  refreshError,
  error,
  hasNextPage,
  onSelectThread,
  onFiltersChange,
  onLoadMore,
  onRefresh,
  onRetry,
}: MyahInboxThreadListProps) => {
  // oxlint-disable-next-line twenty/no-state-useref -- DOM refs coordinate roving keyboard focus.
  const rowRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [snoozeClock, setSnoozeClock] = useState(0);

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

    const selectedThreadIsVisible = threads.some(
      (thread) => thread.id === selectedThreadId,
    );

    return (
      <StyledList role="listbox" aria-label="Inbox conversations">
        {threads.map((thread, index) => {
          const isSelected = selectedThreadId === thread.id;

          return (
            <MyahInboxThreadRow
              key={thread.id}
              thread={thread}
              isSelected={isSelected}
              tabIndex={
                isSelected || (!selectedThreadIsVisible && index === 0) ? 0 : -1
              }
              rowRef={(element) => {
                rowRefs.current[index] = element;
              }}
              onSelect={onSelectThread}
              onKeyDown={(event) => handleRowKeyDown(event, index)}
            />
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
              disabled={loadingMore || isRefreshing}
              onClick={onLoadMore}
            />
          </StyledLoadMore>
        )}
      </StyledList>
    );
  };

  return (
    <StyledListPanel aria-label="Inbox conversations">
      <MyahInboxThreadFilters
        filters={filters}
        loading={loading}
        loadingMore={loadingMore}
        isRefreshing={isRefreshing}
        refreshStatus={refreshStatus}
        refreshError={refreshError}
        onFiltersChange={onFiltersChange}
        onRefresh={onRefresh}
      />
      {renderBody()}
    </StyledListPanel>
  );
};
