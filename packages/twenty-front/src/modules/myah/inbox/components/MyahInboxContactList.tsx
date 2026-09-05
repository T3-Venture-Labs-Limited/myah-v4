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
import { useRef, type KeyboardEvent } from 'react';
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
  hasNextPage,
  onSelectContact,
  onFiltersChange,
  onLoadMore,
  onRefresh,
  onRetry,
}: MyahInboxContactListProps) => {
  // oxlint-disable-next-line twenty/no-state-useref -- DOM refs coordinate roving keyboard focus.
  const rowRefs = useRef<Array<HTMLButtonElement | null>>([]);

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

    return (
      <>
        <StyledList
          role="listbox"
          aria-label="Inbox contacts"
          aria-busy={loadingMore || isRefreshing}
        >
          {contacts.map((contact, index) => {
            const isSelected = selectedContactId === contact.id;

            return (
              <MyahInboxContactRow
                key={contact.id}
                contact={contact}
                isSelected={isSelected}
                tabIndex={
                  isSelected || (!selectedContactIsVisible && index === 0)
                    ? 0
                    : -1
                }
                rowRef={(element) => {
                  rowRefs.current[index] = element;
                }}
                onSelect={(contactId) =>
                  onSelectContact(contactId, { openConversation: true })
                }
                onKeyDown={(event) => handleRowKeyDown(event, index)}
              />
            );
          })}
        </StyledList>
        {(hasNextPage || loadingMore) && (
          <StyledLoadMore role={loadingMore ? 'status' : undefined}>
            <Button
              title={
                loadingMore ? 'Loading more contacts' : 'Load more contacts'
              }
              variant="secondary"
              size="small"
              disabled={loadingMore || isRefreshing}
              onClick={onLoadMore}
            />
          </StyledLoadMore>
        )}
      </>
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
