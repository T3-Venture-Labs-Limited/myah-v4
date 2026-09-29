import {
  MyahInboxThreadFilters,
  type MyahInboxRefreshStatus,
} from '@/myah/inbox/components/MyahInboxThreadFilters';
import { MyahInboxContactRow } from '@/myah/inbox/components/MyahInboxContactRow';
import {
  DEFAULT_MYAH_INBOX_FILTERS,
  type MyahInboxFilters,
} from '@/myah/inbox/states/myahInboxSelectionState';
import { type MyahInboxContact } from '@/myah/inbox/types/MyahInboxContact';
import { styled } from '@linaria/react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useInView } from 'react-intersection-observer';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

// Prefetch distance from the bottom of the loaded list before the next batch
// is requested automatically; see contact-inbox-contact-list spec.
const LOAD_MORE_ROOT_MARGIN = '0px 0px 200px 0px';

const StyledListPanel = styled.section`
  background: ${themeCssVariables.background.primary};
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
`;

const StyledScroller = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const StyledList = styled.div`
  display: flex;
  flex-direction: column;
`;

const StyledSentinel = styled.div`
  height: 1px;
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

const StyledLoadMoreStatus = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  padding: ${themeCssVariables.spacing[3]};
  text-align: center;
`;

const StyledLoadMoreError = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[3]};
  text-align: center;
`;

export type MyahInboxContactListProps = {
  contacts: MyahInboxContact[];
  filters: MyahInboxFilters;
  selectedContactId: string | null;
  loading: boolean;
  loadingMore: boolean;
  isRefreshing: boolean;
  refreshStatus: MyahInboxRefreshStatus;
  refreshError: string | null;
  error: { message: string } | undefined;
  loadMoreError: string | null;
  hasNextPage: boolean;
  onSelectContact: (
    contactId: string,
    options?: { openConversation?: boolean },
  ) => void;
  onFiltersChange: (filters: MyahInboxFilters) => void;
  onLoadMore: () => void;
  onRefresh: () => void;
  onRetry: () => void;
};

export const MyahInboxContactList = ({
  contacts,
  filters,
  selectedContactId,
  loading,
  loadingMore,
  isRefreshing,
  refreshStatus,
  refreshError,
  error,
  loadMoreError,
  hasNextPage,
  onSelectContact,
  onFiltersChange,
  onLoadMore,
  onRefresh,
  onRetry,
}: MyahInboxContactListProps) => {
  // oxlint-disable-next-line twenty/no-state-useref -- DOM refs coordinate roving keyboard focus.
  const rowRefs = useRef<Array<HTMLButtonElement | null>>([]);
  // The scroller element is the useInView root; a ref callback (not a plain
  // ref) so the observer re-attaches once the node is available.
  const [scrollerElement, setScrollerElement] = useState<HTMLDivElement | null>(
    null,
  );
  const { ref: sentinelRef, inView: sentinelInView } = useInView({
    root: scrollerElement,
    rootMargin: LOAD_MORE_ROOT_MARGIN,
  });

  useEffect(() => {
    if (
      sentinelInView &&
      hasNextPage &&
      !loadingMore &&
      !isRefreshing &&
      !loadMoreError
    ) {
      onLoadMore();
    }
  }, [
    sentinelInView,
    hasNextPage,
    loadingMore,
    isRefreshing,
    loadMoreError,
    onLoadMore,
  ]);

  const handleRowKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    rowIndex: number,
  ) => {
    let nextIndex: number | null = null;

    if (event.key === 'ArrowDown') {
      nextIndex = Math.min(rowIndex + 1, contacts.length - 1);
    } else if (event.key === 'ArrowUp') {
      nextIndex = Math.max(rowIndex - 1, 0);
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = contacts.length - 1;
    }

    if (nextIndex === null || nextIndex === rowIndex) {
      return;
    }

    event.preventDefault();
    onSelectContact(contacts[nextIndex].id, { openConversation: false });
    rowRefs.current[nextIndex]?.focus();
  };

  const hasActiveFilters =
    filters.owner !== '' ||
    filters.campaignId !== null ||
    filters.states.length > 0 ||
    filters.snoozeStatus !== '' ||
    filters.search.trim() !== '';
  const renderBody = () => {
    if (loading) {
      return <StyledStatus role="status">Loading contacts</StyledStatus>;
    }

    if (error) {
      return (
        <StyledStatus role="alert">
          <StyledStatusTitle>Could not load Inbox contacts</StyledStatusTitle>
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

    if (contacts.length === 0) {
      return hasActiveFilters ? (
        <StyledStatus>
          <StyledStatusTitle>No contacts match these filters</StyledStatusTitle>
          <span>Adjust or clear the current Inbox filters.</span>
          <Button
            title="Clear filters"
            variant="secondary"
            size="small"
            onClick={() => onFiltersChange(DEFAULT_MYAH_INBOX_FILTERS)}
          />
        </StyledStatus>
      ) : (
        <StyledStatus>
          <StyledStatusTitle>Inbox is clear</StyledStatusTitle>
          <span>New readable contacts will appear here.</span>
        </StyledStatus>
      );
    }

    const selectedContactIsVisible = contacts.some(
      (contact) => contact.id === selectedContactId,
    );
    const tabStopIndex = selectedContactIsVisible
      ? contacts.findIndex((contact) => contact.id === selectedContactId)
      : 0;
    const handleRetry = () => {
      // Move focus off the disappearing Try again control before it unmounts,
      // so keyboard users land on the list rather than <body>.
      rowRefs.current[tabStopIndex]?.focus({ preventScroll: true });
      onLoadMore();
    };

    return (
      <StyledScroller ref={setScrollerElement}>
        <StyledList
          role="listbox"
          aria-label="Inbox contacts"
          aria-busy={loadingMore || isRefreshing}
        >
          {contacts.map((contact, index) => (
            <MyahInboxContactRow
              key={contact.id}
              contact={contact}
              isSelected={selectedContactId === contact.id}
              tabIndex={index === tabStopIndex ? 0 : -1}
              rowRef={(element) => {
                rowRefs.current[index] = element;
              }}
              onSelect={(contactId) =>
                onSelectContact(contactId, { openConversation: true })
              }
              onKeyDown={(event) => handleRowKeyDown(event, index)}
            />
          ))}
        </StyledList>
        {hasNextPage && <StyledSentinel aria-hidden="true" ref={sentinelRef} />}
        {loadingMore && (
          <StyledLoadMoreStatus role="status">
            Loading more contacts
          </StyledLoadMoreStatus>
        )}
        {loadMoreError && !loadingMore && (
          <StyledLoadMoreError role="alert">
            <span>{loadMoreError}</span>
            <Button
              title="Try again"
              variant="secondary"
              size="small"
              onClick={handleRetry}
            />
          </StyledLoadMoreError>
        )}
      </StyledScroller>
    );
  };

  return (
    <StyledListPanel aria-label="Inbox contacts">
      <MyahInboxThreadFilters
        filters={filters}
        loading={loading}
        contentType="contacts"
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
