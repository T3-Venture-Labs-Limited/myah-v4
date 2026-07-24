import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { MyahInboxContextPanel } from '@/myah/inbox/components/MyahInboxContextPanel';
import { MyahInboxThreadList } from '@/myah/inbox/components/MyahInboxThreadList';
import { MyahInboxThreadPanel } from '@/myah/inbox/components/MyahInboxThreadPanel';
import { useMyahInboxThreads } from '@/myah/inbox/hooks/useMyahInboxThreads';
import {
  type MyahInboxFilters,
  myahInboxFiltersState,
  myahInboxSelectionWorkspaceIdState,
  myahInboxSelectedThreadIdState,
} from '@/myah/inbox/states/myahInboxSelectionState';
import { PageBody } from '@/ui/layout/page/components/PageBody';
import { PageContainer } from '@/ui/layout/page/components/PageContainer';
import { PageHeader } from '@/ui/layout/page/components/PageHeader';
import { useIsMobile } from '@/ui/utilities/responsive/hooks/useIsMobile';
import { useAtomState } from '@/ui/utilities/state/jotai/hooks/useAtomState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
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
const StyledPageStatus = styled.div`
  background: ${themeCssVariables.background.primary};
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[3]};
`;

type MobilePanel = 'list' | 'thread' | 'context';

export const MyahInboxPage = () => {
  const isMobile = useIsMobile();
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const workspaceId = currentWorkspace?.id ?? null;
  const [myahInboxFilters, setMyahInboxFilters] = useAtomState(
    myahInboxFiltersState,
  );
  const [myahInboxSelectedThreadId, setMyahInboxSelectedThreadId] =
    useAtomState(myahInboxSelectedThreadIdState);
  const [myahInboxSelectionWorkspaceId, setMyahInboxSelectionWorkspaceId] =
    useAtomState(myahInboxSelectionWorkspaceIdState);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>('list');
  const [triageStatus, setTriageStatus] = useState<string | null>(null);
  const workspaceScopedFilters =
    myahInboxFilters.campaignWorkspaceId === workspaceId
      ? myahInboxFilters
      : {
          ...myahInboxFilters,
          campaignId: null,
          campaignWorkspaceId: null,
        };
  const inbox = useMyahInboxThreads(workspaceScopedFilters, workspaceId);
  const currentWorkspaceSelectedThreadId =
    myahInboxSelectionWorkspaceId === workspaceId
      ? myahInboxSelectedThreadId
      : null;
  const selectedThread =
    inbox.threads.find(({ id }) => id === currentWorkspaceSelectedThreadId) ??
    null;

  useEffect(
    () => () => {
      setMyahInboxSelectedThreadId(null);
      setMyahInboxSelectionWorkspaceId(null);
    },
    [
      setMyahInboxSelectedThreadId,
      setMyahInboxSelectionWorkspaceId,
      workspaceId,
    ],
  );

  useEffect(() => {
    setTriageStatus(null);
  }, [workspaceId]);

  useEffect(() => {
    if (
      myahInboxFilters.campaignWorkspaceId !== null &&
      myahInboxFilters.campaignWorkspaceId !== workspaceId
    ) {
      setMyahInboxFilters({
        ...myahInboxFilters,
        campaignId: null,
        campaignWorkspaceId: null,
      });
    }
  }, [myahInboxFilters, setMyahInboxFilters, workspaceId]);

  useEffect(() => {
    if (inbox.loading || !workspaceId) {
      return;
    }

    if (inbox.threads.length === 0) {
      setMyahInboxSelectedThreadId(null);
      setMyahInboxSelectionWorkspaceId(null);
      return;
    }

    if (
      !inbox.threads.some(({ id }) => id === currentWorkspaceSelectedThreadId)
    ) {
      setMyahInboxSelectedThreadId(inbox.threads[0].id);
      setMyahInboxSelectionWorkspaceId(workspaceId);
    }
  }, [
    inbox.loading,
    inbox.threads,
    currentWorkspaceSelectedThreadId,
    setMyahInboxSelectedThreadId,
    setMyahInboxSelectionWorkspaceId,
    workspaceId,
  ]);

  const handleSelectThread = (threadId: string) => {
    if (!workspaceId) {
      return;
    }

    setMyahInboxSelectedThreadId(threadId);
    setMyahInboxSelectionWorkspaceId(workspaceId);

    if (isMobile) {
      setMobilePanel('thread');
    }
  };

  const handleTriageSaved = (message: string) => {
    setTriageStatus(message);
    void inbox.refetch();
  };
  const handleFiltersChange = (nextFilters: MyahInboxFilters) => {
    const campaignChanged =
      nextFilters.campaignId !== myahInboxFilters.campaignId;

    setMyahInboxFilters({
      ...nextFilters,
      campaignWorkspaceId: campaignChanged
        ? nextFilters.campaignId && workspaceId
          ? workspaceId
          : null
        : nextFilters.campaignWorkspaceId,
    });
  };

  const threadList = (
    <MyahInboxThreadList
      threads={inbox.threads}
      filters={myahInboxFilters}
      selectedThreadId={currentWorkspaceSelectedThreadId}
      loading={inbox.loading}
      loadingMore={inbox.loadingMore}
      error={inbox.error}
      hasNextPage={inbox.hasNextPage}
      onSelectThread={handleSelectThread}
      onFiltersChange={handleFiltersChange}
      onLoadMore={inbox.loadMore}
      onRetry={() => void inbox.refetch()}
    />
  );
  const threadPanel = <MyahInboxThreadPanel thread={selectedThread} />;
  const contextPanel = (
    <MyahInboxContextPanel
      key={selectedThread?.id ?? 'empty-context'}
      thread={selectedThread}
      onTriageSaveStarted={() => setTriageStatus(null)}
      onTriageSaved={handleTriageSaved}
    />
  );

  return (
    <StyledPageContainer>
      <PageHeader title="Inbox" Icon={IconInbox} />
      {triageStatus && (
        <StyledPageStatus role="status" aria-live="polite">
          {triageStatus}
        </StyledPageStatus>
      )}
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
