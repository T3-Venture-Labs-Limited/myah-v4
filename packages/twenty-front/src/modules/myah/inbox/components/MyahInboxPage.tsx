import { useCallback, useContext, useEffect, useRef, useState } from 'react';

import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { MyahInboxContactConversation } from '@/myah/inbox/components/MyahInboxContactConversation';
import { MyahInboxContactList } from '@/myah/inbox/components/MyahInboxContactList';
import { useMyahInboxContactEmailMessages } from '@/myah/inbox/hooks/useMyahInboxContactEmailMessages';
import { useMyahInboxContacts } from '@/myah/inbox/hooks/useMyahInboxContacts';
import {
  MyahInboxDraftAutosaveProvider,
  useMyahInboxDraftAutosaveController,
  useMyahInboxDraftAutosaveControllerContext,
} from '@/myah/inbox/hooks/useMyahInboxDraftAutosaveController';
import { useMyahInboxSelectedEmailThread } from '@/myah/inbox/hooks/useMyahInboxSelectedEmailThread';
import {
  EMPTY_MYAH_INBOX_CONTACT_SELECTION,
  type MyahInboxFilters,
  myahInboxContactSelectionState,
  myahInboxFiltersState,
} from '@/myah/inbox/states/myahInboxSelectionState';
import {
  type MyahInboxChannel,
  type MyahInboxContact,
} from '@/myah/inbox/types/MyahInboxContact';
import {
  getMyahInboxContactSelection,
  getMyahInboxRegroupedContactSelection,
  getMyahInboxSelectionForChannel,
} from '@/myah/inbox/utils/getMyahInboxContactSelection';
import { SidePanelToggleButton } from '@/side-panel/components/SidePanelToggleButton';
import { PageCardHeader } from '@/ui/layout/page/components/PageCardHeader';
import { PageCardLayout } from '@/ui/layout/page/components/PageCardLayout';
import { useIsMobile } from '@/ui/utilities/responsive/hooks/useIsMobile';
import { useAtomState } from '@/ui/utilities/state/jotai/hooks/useAtomState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { styled } from '@linaria/react';
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

const StyledStatus = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex: 1;
  font-size: ${themeCssVariables.font.size.sm};
  justify-content: center;
  padding: ${themeCssVariables.spacing[6]};
`;

const StyledSelectionStatus = styled.div`
  background: ${themeCssVariables.background.primary};
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[3]};
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

  &:focus-visible {
    outline: 2px solid ${themeCssVariables.brand.focusRing};
    outline-offset: -2px;
  }
`;

type MobilePanel = 'contacts' | 'conversation';

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
  const [myahInboxContactSelection, setMyahInboxContactSelection] =
    useAtomState(myahInboxContactSelectionState);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>('contacts');
  const [retainedContact, setRetainedContact] =
    useState<MyahInboxContact | null>(null);
  const [status, setStatus] = useState<{
    message: string;
    workspaceId: string | null;
  } | null>(null);
  // Tracks first-load Contact selection separately for each workspace.
  // oxlint-disable-next-line twenty/no-state-useref
  const initializedWorkspaceIdsRef = useRef(new Set<string>());
  // Avoids StrictMode cleanup clearing the remounted page selection.
  // oxlint-disable-next-line twenty/no-state-useref
  const cleanupGenerationRef = useRef(0);
  // Transfers focus between mutually exclusive mobile panes.
  // oxlint-disable-next-line twenty/no-state-useref
  const mobilePanelRef = useRef<HTMLDivElement>(null);
  // Invalidates async refresh results after any newer selection transition.
  // oxlint-disable-next-line twenty/no-state-useref
  const selectionGenerationRef = useRef(0);
  const commitContactSelection = useCallback(
    (nextSelection: typeof myahInboxContactSelection) => {
      selectionGenerationRef.current += 1;
      setMyahInboxContactSelection(nextSelection);
    },
    [setMyahInboxContactSelection],
  );
  const workspaceFilters =
    myahInboxFilters.campaignWorkspaceId === workspaceId
      ? myahInboxFilters
      : { ...myahInboxFilters, campaignId: null, campaignWorkspaceId: null };
  const contacts = useMyahInboxContacts(workspaceFilters, workspaceId);
  const currentSelection =
    myahInboxContactSelection.workspaceId === workspaceId
      ? myahInboxContactSelection
      : EMPTY_MYAH_INBOX_CONTACT_SELECTION;
  const selectedContact =
    contacts.contacts.find(
      (contact) => contact.id === currentSelection.contactId,
    ) ??
    (retainedContact?.id === currentSelection.contactId
      ? retainedContact
      : null);
  const email = useMyahInboxContactEmailMessages(
    workspaceId,
    currentSelection.channel === 'EMAIL' ? (selectedContact?.id ?? null) : null,
  );
  const selectedThread = useMyahInboxSelectedEmailThread(
    workspaceId,
    currentSelection.channel === 'EMAIL'
      ? currentSelection.emailThreadId
      : null,
  );

  useEffect(() => {
    if (!isMobile) {
      return;
    }

    const panel = mobilePanelRef.current;

    if (!panel) {
      return;
    }

    if (mobilePanel === 'contacts') {
      const selectedOption = panel.querySelector(
        '[role=\"option\"][aria-selected=\"true\"]',
      );

      if (selectedOption instanceof HTMLElement) {
        selectedOption.focus();
        return;
      }
    }

    panel.focus();
  }, [currentSelection.contactId, isMobile, mobilePanel]);

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
    if (
      myahInboxContactSelection.workspaceId !== null &&
      myahInboxContactSelection.workspaceId !== workspaceId
    ) {
      if (myahInboxContactSelection.emailThreadId !== null) {
        void flush({
          workspaceId: myahInboxContactSelection.workspaceId,
          threadId: myahInboxContactSelection.emailThreadId,
        });
      }
      commitContactSelection(EMPTY_MYAH_INBOX_CONTACT_SELECTION);
      setRetainedContact(null);
      setMobilePanel('contacts');
    }
  }, [flush, myahInboxContactSelection, commitContactSelection, workspaceId]);

  useEffect(() => {
    const cleanupGeneration = ++cleanupGenerationRef.current;

    return () => {
      queueMicrotask(() => {
        // eslint-disable-next-line react-hooks/exhaustive-deps
        if (cleanupGenerationRef.current === cleanupGeneration) {
          commitContactSelection(EMPTY_MYAH_INBOX_CONTACT_SELECTION);
        }
      });
    };
  }, [commitContactSelection]);

  useEffect(() => {
    if (contacts.loading || contacts.error || !workspaceId) {
      return;
    }

    if (selectedContact) {
      initializedWorkspaceIdsRef.current.add(workspaceId);
      const nextSelection = getMyahInboxContactSelection({
        workspaceId,
        contact: selectedContact,
        previousSelection: currentSelection,
      });

      if (JSON.stringify(nextSelection) !== JSON.stringify(currentSelection)) {
        commitContactSelection(nextSelection);
      }
      return;
    }

    if (currentSelection.contactId !== null) {
      if (currentSelection.emailThreadId !== null) {
        void flush({
          workspaceId,
          threadId: currentSelection.emailThreadId,
        });
      }
      commitContactSelection(EMPTY_MYAH_INBOX_CONTACT_SELECTION);
      setRetainedContact(null);
      return;
    }

    if (!initializedWorkspaceIdsRef.current.has(workspaceId)) {
      initializedWorkspaceIdsRef.current.add(workspaceId);
      const firstContact = contacts.contacts[0];

      if (firstContact !== undefined) {
        commitContactSelection(
          getMyahInboxContactSelection({
            workspaceId,
            contact: firstContact,
            previousSelection: null,
          }),
        );
      }
    }
  }, [
    contacts.contacts,
    contacts.error,
    contacts.loading,
    currentSelection,
    flush,
    selectedContact,
    commitContactSelection,
    workspaceId,
  ]);

  const flushSelectedEmailDraft = () => {
    if (workspaceId && currentSelection.emailThreadId) {
      void flush({
        workspaceId,
        threadId: currentSelection.emailThreadId,
      });
    }
  };

  const handleSelectContact = (
    contactId: string,
    options?: { openConversation?: boolean },
  ) => {
    if (!workspaceId) {
      return;
    }

    if (contactId === currentSelection.contactId) {
      if (isMobile && options?.openConversation) {
        setMobilePanel('conversation');
      }
      return;
    }

    const contact = contacts.contacts.find(({ id }) => id === contactId);

    if (!contact) {
      return;
    }

    flushSelectedEmailDraft();
    setRetainedContact(contact);
    commitContactSelection(
      getMyahInboxContactSelection({
        workspaceId,
        contact,
        previousSelection: null,
      }),
    );

    if (isMobile && options?.openConversation) {
      setMobilePanel('conversation');
    }
  };

  const handleSelectChannel = (channel: MyahInboxChannel) => {
    if (!workspaceId || !selectedContact) {
      return;
    }

    if (currentSelection.channel === 'EMAIL' && channel !== 'EMAIL') {
      flushSelectedEmailDraft();
    }
    commitContactSelection(
      getMyahInboxSelectionForChannel({
        workspaceId,
        contact: selectedContact,
        channel,
        previousSelection: currentSelection,
      }),
    );
  };

  const handleSelectEmailThread = (threadId: string) => {
    if (!workspaceId || !selectedContact) {
      return;
    }

    if (
      currentSelection.emailThreadId &&
      currentSelection.emailThreadId !== threadId
    ) {
      flushSelectedEmailDraft();
    }
    commitContactSelection({
      workspaceId,
      contactId: selectedContact.id,
      channel: 'EMAIL',
      emailThreadId: threadId,
      instagramConversationId: null,
    });
  };

  const handleRefresh = async (
    selectedContactId = currentSelection.contactId,
    options?: { force?: boolean; preserveTarget?: boolean },
  ) => {
    const refreshSelectionGeneration = selectionGenerationRef.current;
    const refreshSelection = currentSelection;
    const result = options?.force
      ? await contacts.refresh(selectedContactId, { force: true })
      : await contacts.refresh(selectedContactId);

    if (
      result.status !== 'success' ||
      !workspaceId ||
      selectionGenerationRef.current !== refreshSelectionGeneration
    ) {
      return;
    }

    if (!result.selectedContact) {
      flushSelectedEmailDraft();
      setRetainedContact(null);
      commitContactSelection(EMPTY_MYAH_INBOX_CONTACT_SELECTION);
      return;
    }

    setRetainedContact(result.selectedContact);
    commitContactSelection(
      options?.preserveTarget
        ? getMyahInboxRegroupedContactSelection({
            workspaceId,
            contact: result.selectedContact,
            previousSelection: refreshSelection,
          })
        : getMyahInboxContactSelection({
            workspaceId,
            contact: result.selectedContact,
            previousSelection: refreshSelection,
          }),
    );
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

  const handleActivity = async () => {
    await Promise.all([
      selectedThread.refresh(),
      email.refresh(),
      handleRefresh(),
    ]);
  };

  const publishStatus = (message: string) => {
    setStatus({ message, workspaceId });
  };

  const handleThreadUpdated = (message: string) => {
    publishStatus(message);
    void Promise.all([
      selectedThread.refresh(),
      email.refresh(),
      handleRefresh(),
    ]);
  };

  const contactList = (
    <MyahInboxContactList
      contacts={contacts.contacts}
      filters={myahInboxFilters}
      selectedContactId={currentSelection.contactId}
      loading={contacts.loading}
      loadingMore={contacts.loadingMore}
      isRefreshing={contacts.isRefreshing}
      refreshStatus={contacts.refreshStatus}
      refreshError={contacts.refreshError?.message ?? null}
      error={contacts.error}
      hasNextPage={contacts.hasNextPage}
      onSelectContact={handleSelectContact}
      onFiltersChange={handleFiltersChange}
      onLoadMore={() => void contacts.loadMore()}
      onRefresh={() => void handleRefresh()}
      onRetry={() => void handleRefresh()}
    />
  );
  const conversation =
    workspaceId && selectedContact && currentSelection.channel ? (
      <MyahInboxContactConversation
        workspaceId={workspaceId}
        contact={selectedContact}
        selectionChannel={currentSelection.channel}
        selectedEmailThreadId={currentSelection.emailThreadId}
        email={email}
        selectedThread={selectedThread}
        onSelectChannel={handleSelectChannel}
        onSelectEmailThread={handleSelectEmailThread}
        onContactLinked={async (resultingContactId) => {
          await handleRefresh(resultingContactId, {
            force: true,
            preserveTarget: true,
          });
        }}
        onActivity={handleActivity}
        onThreadUpdated={handleThreadUpdated}
        onUpdateFailed={publishStatus}
      />
    ) : (
      <StyledStatus>Select a contact to open the conversation.</StyledStatus>
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
      {status?.workspaceId === workspaceId ? (
        <StyledSelectionStatus role="status" aria-live="polite">
          {status.message}
        </StyledSelectionStatus>
      ) : null}
      {isMobile ? (
        <StyledMobileWorkspace>
          <StyledMobileNavigation aria-label="Inbox panels">
            <SegmentedControl
              ariaLabel="Inbox panels"
              width="100%"
              value={mobilePanel}
              options={[
                { label: 'Contacts', value: 'contacts' },
                {
                  label: 'Conversation',
                  value: 'conversation',
                  disabled: !selectedContact,
                },
              ]}
              onChange={setMobilePanel}
            />
          </StyledMobileNavigation>
          <StyledSelectionStatus role="status" aria-live="polite">
            {selectedContact
              ? `Selected: ${selectedContact.displayName}`
              : `${contacts.contacts.length} contacts`}
          </StyledSelectionStatus>
          <StyledMobilePanel
            ref={mobilePanelRef}
            aria-label={
              mobilePanel === 'contacts' ? 'Contacts pane' : 'Conversation pane'
            }
            tabIndex={-1}
          >
            {mobilePanel === 'contacts' ? contactList : conversation}
          </StyledMobilePanel>
        </StyledMobileWorkspace>
      ) : (
        <StyledWorkspace>
          <StyledPanel>{contactList}</StyledPanel>
          <StyledPanel>{conversation}</StyledPanel>
        </StyledWorkspace>
      )}
    </PageCardLayout>
  );
};
