import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { MyahInboxThreadList } from '@/myah/inbox/components/MyahInboxThreadList';
import { MyahInboxThreadPanel } from '@/myah/inbox/components/MyahInboxThreadPanel';
import {
  MyahInboxDraftAutosaveProvider,
  useMyahInboxDraftAutosaveController,
  useMyahInboxDraftAutosaveControllerContext,
} from '@/myah/inbox/hooks/useMyahInboxDraftAutosaveController';
import { useMyahInboxThreads } from '@/myah/inbox/hooks/useMyahInboxThreads';
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
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const workspaceId = currentWorkspace?.id ?? null;
  // The lifecycle effect reads the latest controller without resubscribing.
  // oxlint-disable-next-line twenty/no-state-useref
  const draftAutosaveControllerRef = useRef<{
    flushWorkspace: (workspaceId: string) => void;
  } | null>(null);

  useEffect(() => {
    if (!workspaceId) {
      return;
    }

    const flushWorkspace = () => {
      draftAutosaveControllerRef.current?.flushWorkspace(workspaceId);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushWorkspace();
      }
    };

    window.addEventListener('pagehide', flushWorkspace);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('pagehide', flushWorkspace);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      flushWorkspace();
    };
  }, [workspaceId]);

  const draftAutosaveController = useMyahInboxDraftAutosaveController();
  draftAutosaveControllerRef.current = draftAutosaveController;

  return (
    <MyahInboxDraftAutosaveProvider controller={draftAutosaveController}>
      <MyahInboxPageContent workspaceId={workspaceId} />
    </MyahInboxDraftAutosaveProvider>
  );
};

const MyahInboxPageContent = ({
  workspaceId,
}: {
  workspaceId: string | null;
}) => {
  const isMobile = useIsMobile();
  const { theme } = useContext(ThemeContext);
  const { flush } = useMyahInboxDraftAutosaveControllerContext();
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
  const inbox = useMyahInboxThreads(workspaceScopedFilters, workspaceId);
  const currentWorkspaceSelectedThreadId =
    myahInboxSelectionWorkspaceId === workspaceId
      ? myahInboxSelectedThreadId
      : null;
  const selectedThread =
    inbox.threads.find(({ id }) => id === currentWorkspaceSelectedThreadId) ??
    null;

  useEffect(() => {
    setThreadUpdateStatus(null);
  }, [workspaceId]);

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
    if (inbox.loading || !workspaceId) {
      return;
    }

    if (inbox.threads.length === 0) {
      if (currentWorkspaceSelectedThreadId) {
        void flush({
          workspaceId,
          threadId: currentWorkspaceSelectedThreadId,
        });
      }

      setMyahInboxSelectedThreadId(null);
      setMyahInboxSelectionWorkspaceId(null);
      return;
    }

    if (currentWorkspaceSelectedThreadId) {
      if (
        inbox.threads.some(({ id }) => id === currentWorkspaceSelectedThreadId)
      ) {
        initializedSelectionWorkspaceIdsRef.current.add(workspaceId);
        return;
      }

      void flush({
        workspaceId,
        threadId: currentWorkspaceSelectedThreadId,
      });
      setMyahInboxSelectedThreadId(null);
      setMyahInboxSelectionWorkspaceId(null);
      return;
    }

    if (initializedSelectionWorkspaceIdsRef.current.has(workspaceId)) {
      return;
    }

    initializedSelectionWorkspaceIdsRef.current.add(workspaceId);
    setMyahInboxSelectedThreadId(inbox.threads[0].id);
    setMyahInboxSelectionWorkspaceId(workspaceId);
  }, [
    inbox.loading,
    flush,
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

    if (currentWorkspaceSelectedThreadId) {
      void flush({
        workspaceId,
        threadId: currentWorkspaceSelectedThreadId,
      });
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

  const handleThreadUpdated = (message: string) => {
    setThreadUpdateStatus({ message, workspaceId });
    void inbox.refetch();
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
