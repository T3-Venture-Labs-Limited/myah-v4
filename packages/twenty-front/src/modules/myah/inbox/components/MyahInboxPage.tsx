import { MyahInboxContextPanel } from '@/myah/inbox/components/MyahInboxContextPanel';
import { MyahInboxThreadList } from '@/myah/inbox/components/MyahInboxThreadList';
import { MyahInboxThreadPanel } from '@/myah/inbox/components/MyahInboxThreadPanel';
import { useMyahInboxThreads } from '@/myah/inbox/hooks/useMyahInboxThreads';
import {
  myahInboxFiltersState,
  myahInboxSelectedThreadIdState,
} from '@/myah/inbox/states/myahInboxSelectionState';
import { PageBody } from '@/ui/layout/page/components/PageBody';
import { PageContainer } from '@/ui/layout/page/components/PageContainer';
import { PageHeader } from '@/ui/layout/page/components/PageHeader';
import { useIsMobile } from '@/ui/utilities/responsive/hooks/useIsMobile';
import { useAtomState } from '@/ui/utilities/state/jotai/hooks/useAtomState';
import { styled } from '@linaria/react';
import { useEffect, useState } from 'react';
import { IconInbox } from 'twenty-ui/icon';
import { SegmentedControl } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledPageContainer = styled(PageContainer)`
  flex: 1;
  min-height: 0;
`;

const StyledPageBody = styled(PageBody)`
  min-height: 0;
`;

const StyledWorkspace = styled.div`
  display: grid;
  flex: 1;
  grid-template-columns: minmax(0, 3fr) minmax(0, 5fr) minmax(0, 3fr);
  min-height: 0;
`;

const StyledPanel = styled.div`
  border-right: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  min-height: 0;
  min-width: 0;

  &:last-child {
    border-right: 0;
  }
`;

const StyledMobileWorkspace = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
`;

const StyledMobileNavigation = styled.nav`
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  gap: ${themeCssVariables.spacing[1]};
  padding: ${themeCssVariables.spacing[2]};
`;

const StyledMobilePanel = styled.div`
  display: flex;
  flex: 1;
  min-height: 0;
`;

const StyledSelectionStatus = styled.div`
  background: ${themeCssVariables.background.primary};
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[3]};
`;

type MobilePanel = 'list' | 'thread' | 'context';

export const MyahInboxPage = () => {
  const isMobile = useIsMobile();
  const [myahInboxFilters, setMyahInboxFilters] = useAtomState(
    myahInboxFiltersState,
  );
  const [myahInboxSelectedThreadId, setMyahInboxSelectedThreadId] =
    useAtomState(myahInboxSelectedThreadIdState);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>('list');
  const inbox = useMyahInboxThreads(myahInboxFilters);

  const selectedThread =
    inbox.threads.find(({ id }) => id === myahInboxSelectedThreadId) ?? null;

  useEffect(() => {
    if (inbox.loading) {
      return;
    }

    if (inbox.threads.length === 0) {
      setMyahInboxSelectedThreadId(null);
      return;
    }

    if (!inbox.threads.some(({ id }) => id === myahInboxSelectedThreadId)) {
      setMyahInboxSelectedThreadId(inbox.threads[0].id);
    }
  }, [
    inbox.loading,
    inbox.threads,
    myahInboxSelectedThreadId,
    setMyahInboxSelectedThreadId,
  ]);

  const handleSelectThread = (threadId: string) => {
    setMyahInboxSelectedThreadId(threadId);

    if (isMobile) {
      setMobilePanel('thread');
    }
  };

  const threadList = (
    <MyahInboxThreadList
      threads={inbox.threads}
      filters={myahInboxFilters}
      selectedThreadId={myahInboxSelectedThreadId}
      loading={inbox.loading}
      loadingMore={inbox.loadingMore}
      error={inbox.error}
      hasNextPage={inbox.hasNextPage}
      onSelectThread={handleSelectThread}
      onFiltersChange={setMyahInboxFilters}
      onLoadMore={inbox.loadMore}
      onRetry={() => void inbox.refetch()}
    />
  );
  const threadPanel = <MyahInboxThreadPanel thread={selectedThread} />;
  const contextPanel = (
    <MyahInboxContextPanel
      key={selectedThread?.id ?? 'empty-context'}
      thread={selectedThread}
      onTriageSaved={() => void inbox.refetch()}
    />
  );

  return (
    <StyledPageContainer>
      <PageHeader title="Inbox" Icon={IconInbox} />
      <StyledPageBody>
        {isMobile ? (
          <StyledMobileWorkspace>
            <StyledMobileNavigation aria-label="Inbox panels">
              <SegmentedControl
                ariaLabel="Inbox panels"
                value={mobilePanel}
                options={[
                  { label: 'Threads', value: 'list' },
                  {
                    label: 'Conversation',
                    value: 'thread',
                    disabled: !selectedThread,
                  },
                  {
                    label: 'Context',
                    value: 'context',
                    disabled: !selectedThread,
                  },
                ]}
                onChange={setMobilePanel}
              />
            </StyledMobileNavigation>
            <StyledSelectionStatus role="status" aria-live="polite">
              {selectedThread
                ? `Selected: ${selectedThread.subject || 'No subject'}`
                : `${inbox.threads.length} conversations`}
            </StyledSelectionStatus>
            <StyledMobilePanel>
              {mobilePanel === 'list'
                ? threadList
                : mobilePanel === 'thread'
                  ? threadPanel
                  : contextPanel}
            </StyledMobilePanel>
          </StyledMobileWorkspace>
        ) : (
          <StyledWorkspace>
            <StyledPanel>{threadList}</StyledPanel>
            <StyledPanel>{threadPanel}</StyledPanel>
            <StyledPanel>{contextPanel}</StyledPanel>
          </StyledWorkspace>
        )}
      </StyledPageBody>
    </StyledPageContainer>
  );
};
