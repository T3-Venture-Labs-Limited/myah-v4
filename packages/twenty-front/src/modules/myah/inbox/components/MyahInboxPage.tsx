import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { MyahInboxThreadList } from '@/myah/inbox/components/MyahInboxThreadList';
import { MyahInboxThreadPanel } from '@/myah/inbox/components/MyahInboxThreadPanel';
import {
  type MyahInboxThread,
  useMyahInboxThreads,
} from '@/myah/inbox/hooks/useMyahInboxThreads';
import {
  type MyahInboxFilters,
  myahInboxFiltersState,
  myahInboxSelectionWorkspaceIdState,
  myahInboxSelectedThreadIdState,
} from '@/myah/inbox/states/myahInboxSelectionState';
import { PageCardLayout } from '@/ui/layout/page/components/PageCardLayout';

import { SidePanelToggleButton } from '@/side-panel/components/SidePanelToggleButton';
import { PageCardHeader } from '@/ui/layout/page/components/PageCardHeader';
import { useIsMobile } from '@/ui/utilities/responsive/hooks/useIsMobile';
import { useAtomState } from '@/ui/utilities/state/jotai/hooks/useAtomState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { styled } from '@linaria/react';
import { useContext, useEffect, useRef, useState } from 'react';
import { IconInbox } from 'twenty-ui/icon';
import { SegmentedControl } from 'twenty-ui/input';
import { ThemeContext, themeCssVariables } from 'twenty-ui/theme-constants';

const StyledWorkspace = styled.div`
  display: grid;
  flex: 1;
  grid-template-columns: minmax(0, 3fr) minmax(0, 9fr);
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

type MobilePanel = 'list' | 'thread';
type ThreadUpdateStatus = {
  message: string;
  workspaceId: string | null;
};

export const MyahInboxPage = () => {
  const isMobile = useIsMobile();
  const { theme } = useContext(ThemeContext);
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
  const [threadUpdateStatus, setThreadUpdateStatus] =
    useState<ThreadUpdateStatus | null>(null);
  const [retainedSelectedThread, setRetainedSelectedThread] =
    useState<MyahInboxThread | null>(null);
  // Track visited workspaces synchronously without a selection-triggering render.
  // oxlint-disable-next-line twenty/no-state-useref
  const initializedSelectionWorkspaceIdsRef = useRef(new Set<string>());
  // oxlint-disable-next-line twenty/no-state-useref
  const selectionCleanupGenerationRef = useRef(0);
  const workspaceScopedFilters =
    myahInboxFilters.campaignWorkspaceId === workspaceId
      ? myahInboxFilters
      : {
          ...myahInboxFilters,
          campaignId: null,
          campaignWorkspaceId: null,
        };
  const currentWorkspaceSelectedThreadId =
    myahInboxSelectionWorkspaceId === workspaceId
      ? myahInboxSelectedThreadId
      : null;
  const refreshScopeKey = JSON.stringify([
    workspaceId,
    workspaceScopedFilters.owner,
    workspaceScopedFilters.campaignId,
    workspaceScopedFilters.campaignWorkspaceId,
    workspaceScopedFilters.states.join(','),
    workspaceScopedFilters.snoozeStatus,
    workspaceScopedFilters.search,
  ]);
  // oxlint-disable-next-line twenty/no-state-useref
  const pendingRefreshSelectionIdRef = useRef<string | null>(null);
  // oxlint-disable-next-line twenty/no-state-useref
  const selectedThreadIdRef = useRef<string | null>(
    currentWorkspaceSelectedThreadId,
  );
  selectedThreadIdRef.current = currentWorkspaceSelectedThreadId;
  // oxlint-disable-next-line twenty/no-state-useref
  const refreshRequestIdRef = useRef(0);
  // oxlint-disable-next-line twenty/no-state-useref
  const refreshInFlightRef = useRef<{
    scopeKey: string;
    requestId: number;
  } | null>(null);
  // oxlint-disable-next-line twenty/no-state-useref
  const refreshScopeKeyRef = useRef(refreshScopeKey);
  refreshScopeKeyRef.current = refreshScopeKey;
  const inbox = useMyahInboxThreads(workspaceScopedFilters, workspaceId);
  const selectedThread =
    inbox.threads.find(({ id }) => id === currentWorkspaceSelectedThreadId) ??
    (retainedSelectedThread?.id === currentWorkspaceSelectedThreadId
      ? retainedSelectedThread
      : null);

  useEffect(() => {
    setThreadUpdateStatus(null);
  }, [workspaceId]);

  useEffect(() => {
    refreshRequestIdRef.current += 1;
    refreshInFlightRef.current = null;
    pendingRefreshSelectionIdRef.current = null;
    setRetainedSelectedThread(null);
  }, [refreshScopeKey]);

  useEffect(() => {
    const cleanupGenerationRef = selectionCleanupGenerationRef;
    const cleanupGeneration = ++cleanupGenerationRef.current;

    return () => {
      queueMicrotask(() => {
        if (cleanupGenerationRef.current !== cleanupGeneration) {
          return;
        }

        setMyahInboxSelectedThreadId(null);
        setMyahInboxSelectionWorkspaceId(null);
      });
    };
  }, [setMyahInboxSelectedThreadId, setMyahInboxSelectionWorkspaceId]);

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
    if (inbox.loading || !workspaceId || inbox.error) {
      return;
    }

    if (currentWorkspaceSelectedThreadId) {
      if (
        inbox.threads.some(
          ({ id }) => id === currentWorkspaceSelectedThreadId,
        ) ||
        retainedSelectedThread?.id === currentWorkspaceSelectedThreadId ||
        pendingRefreshSelectionIdRef.current ===
          currentWorkspaceSelectedThreadId
      ) {
        initializedSelectionWorkspaceIdsRef.current.add(workspaceId);
        return;
      }

      setMyahInboxSelectedThreadId(null);
      setMyahInboxSelectionWorkspaceId(null);
      return;
    }

    if (
      myahInboxSelectionWorkspaceId !== null &&
      myahInboxSelectionWorkspaceId !== workspaceId
    ) {
      setMyahInboxSelectedThreadId(null);
      setMyahInboxSelectionWorkspaceId(null);
    }

    if (!initializedSelectionWorkspaceIdsRef.current.has(workspaceId)) {
      initializedSelectionWorkspaceIdsRef.current.add(workspaceId);
      if (inbox.threads.length > 0) {
        setMyahInboxSelectedThreadId(inbox.threads[0].id);
        setMyahInboxSelectionWorkspaceId(workspaceId);
      }
    }
  }, [
    currentWorkspaceSelectedThreadId,
    inbox.error,
    inbox.loading,
    inbox.threads,
    myahInboxSelectionWorkspaceId,
    retainedSelectedThread,
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

  const handleRefresh = async () => {
    if (refreshInFlightRef.current?.scopeKey === refreshScopeKey) {
      return;
    }

    const request = {
      scopeKey: refreshScopeKey,
      requestId: ++refreshRequestIdRef.current,
    };
    const selectedThreadId = currentWorkspaceSelectedThreadId;

    refreshInFlightRef.current = request;

    if (selectedThreadId) {
      if (selectedThread?.id === selectedThreadId) {
        setRetainedSelectedThread(selectedThread);
      }
      pendingRefreshSelectionIdRef.current = selectedThreadId;
    }

    const result = await inbox.refresh(selectedThreadId);
    const isCurrentRequest =
      refreshRequestIdRef.current === request.requestId &&
      refreshScopeKeyRef.current === request.scopeKey &&
      refreshInFlightRef.current === request;

    if (!isCurrentRequest) {
      return;
    }

    refreshInFlightRef.current = null;

    if (pendingRefreshSelectionIdRef.current === selectedThreadId) {
      pendingRefreshSelectionIdRef.current = null;
    }

    if (selectedThreadIdRef.current !== selectedThreadId) {
      return;
    }

    if (result.status !== 'success') {
      return;
    }

    if (result.selectedThread?.id === selectedThreadId) {
      setRetainedSelectedThread(result.selectedThread);
      return;
    }

    setRetainedSelectedThread(null);
    setMyahInboxSelectedThreadId(null);
    setMyahInboxSelectionWorkspaceId(null);
  };

  const handleThreadUpdated = (message: string) => {
    setThreadUpdateStatus({ message, workspaceId });
    void handleRefresh();
  };

  const threadList = (
    <MyahInboxThreadList
      threads={inbox.threads}
      filters={myahInboxFilters}
      selectedThreadId={currentWorkspaceSelectedThreadId}
      loading={inbox.loading}
      loadingMore={inbox.loadingMore}
      isRefreshing={inbox.isRefreshing}
      refreshStatus={inbox.refreshStatus}
      refreshError={inbox.refreshError?.message ?? null}
      error={inbox.error}
      hasNextPage={inbox.hasNextPage}
      onSelectThread={handleSelectThread}
      onFiltersChange={handleFiltersChange}
      onLoadMore={inbox.loadMore}
      onRefresh={() => void handleRefresh()}
      onRetry={() => void handleRefresh()}
    />
  );
  const threadPanel = (
    <MyahInboxThreadPanel
      thread={selectedThread}
      onThreadUpdated={handleThreadUpdated}
    />
  );

  return (
    <PageCardLayout
      header={
        <PageCardHeader
          icon={<IconInbox size={theme.icon.size.md} />}
          title="Inbox"
          actionButton={<SidePanelToggleButton />}
        />
      }
    >
      {threadUpdateStatus?.workspaceId === workspaceId && (
        <StyledSelectionStatus role="status" aria-live="polite">
          {threadUpdateStatus.message}
        </StyledSelectionStatus>
      )}
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
            {mobilePanel === 'list' ? threadList : threadPanel}
          </StyledMobilePanel>
        </StyledMobileWorkspace>
      ) : (
        <StyledWorkspace>
          <StyledPanel>{threadList}</StyledPanel>
          <StyledPanel>{threadPanel}</StyledPanel>
        </StyledWorkspace>
      )}
    </PageCardLayout>
  );
};
