import { myahInboxPendingInstagramSelectionState } from '@/myah/inbox/states/myahInboxPendingInstagramSelectionState';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';

import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { currentUserWorkspaceState } from '@/auth/states/currentUserWorkspaceState';
import { getMyahInboxOutreachCards } from '@/myah/inbox/components/MyahInboxEmailOutreachHistory';
import { useAtomValue, useStore } from 'jotai';
import { myahInboxDraftAutosaveFamilyState } from '@/myah/inbox/states/myahInboxDraftAutosaveFamilyState';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { MyahInboxContactConversation } from '@/myah/inbox/components/MyahInboxContactConversation';
import { MyahInboxContextEffect } from '@/myah/inbox/components/MyahInboxContextEffect';
import { MyahInboxContactList } from '@/myah/inbox/components/MyahInboxContactList';
import { useMyahInboxEmailHistory } from '@/myah/inbox/hooks/useMyahInboxEmailHistory';
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
  myahInboxPreserveSelectionOnUnmountState,
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
import { Button, SegmentedControl } from 'twenty-ui/input';
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
    flushWorkspace: (workspaceId: string) => Promise<boolean>;
    invalidateWorkspace: (workspaceId: string) => void;
  } | null>(null);

  useEffect(() => {
    if (!workspaceId) {
      return;
    }

    const flushWorkspace = () => {
      void draftAutosaveControllerRef.current?.flushWorkspace(workspaceId);
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
      draftAutosaveControllerRef.current?.invalidateWorkspace(workspaceId);
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
  const store = useStore();
  const [
    myahInboxPendingInstagramSelection,
    setMyahInboxPendingInstagramSelection,
  ] = useAtomState(myahInboxPendingInstagramSelectionState);
  const pendingDestination =
    myahInboxPendingInstagramSelection?.workspaceId === workspaceId
      ? myahInboxPendingInstagramSelection
      : null;
  useEffect(() => {
    if (
      myahInboxPendingInstagramSelection &&
      myahInboxPendingInstagramSelection.workspaceId !== workspaceId
    )
      setMyahInboxPendingInstagramSelection(null);
  }, [
    myahInboxPendingInstagramSelection,
    workspaceId,
    setMyahInboxPendingInstagramSelection,
  ]);
  const { theme } = useContext(ThemeContext);
  const { flushWorkspaceForNavigation, invalidateWorkspace } =
    useMyahInboxDraftAutosaveControllerContext();
  const [myahInboxFilters, setMyahInboxFilters] = useAtomState(
    myahInboxFiltersState,
  );
  const [myahInboxContactSelection, setMyahInboxContactSelection] =
    useAtomState(myahInboxContactSelectionState);
  // Pins the exact selection restored from Campaign guidance for this mount.
  // oxlint-disable-next-line twenty/no-state-useref
  const preservedReturnSelectionRef = useRef(
    store.get(myahInboxPreserveSelectionOnUnmountState.atom)
      ? myahInboxContactSelection
      : null,
  );
  const [draftAuthorizationGeneration, setDraftAuthorizationGeneration] =
    useState(0);
  const [inlineTarget, setInlineTarget] = useState<{
    scope: string;
    threadId: string;
  } | null>(null);
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
  // oxlint-disable-next-line twenty/no-state-useref
  const committedScope = useRef('');
  const commitContactSelection = useCallback(
    (nextSelection: typeof myahInboxContactSelection) => {
      selectionGenerationRef.current += 1;
      const nextScope = `${nextSelection.workspaceId}:${nextSelection.contactId}:${nextSelection.channel}`;
      if (committedScope.current !== nextScope) setInlineTarget(null);
      committedScope.current = nextScope;
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
  const currentWorkspaceMember = useAtomStateValue(currentWorkspaceMemberState);
  const currentUserWorkspace = useAtomStateValue(currentUserWorkspaceState);
  const authorizationKey = JSON.stringify([
    currentWorkspaceMember?.id ?? null,
    currentUserWorkspace,
  ]);
  const summaryAuthorizationKey = `${authorizationKey}:${draftAuthorizationGeneration}`;
  const email = useMyahInboxEmailHistory(
    workspaceId,
    currentSelection.channel === 'EMAIL' ? (selectedContact?.id ?? null) : null,
    authorizationKey,
  );
  const latestThreadId =
    email.status === 'ready'
      ? ((email.segments[0]?.pages[0]?.latestThreadId ?? null) as string | null)
      : null;
  const outreachCards = getMyahInboxOutreachCards(email);
  const targetScope = `${workspaceId}:${currentSelection.contactId}:${currentSelection.channel}`;
  const inlineThreadId =
    inlineTarget?.scope === targetScope ? inlineTarget.threadId : null;
  const inlineThread = useMyahInboxSelectedEmailThread(
    workspaceId,
    email.status === 'ready' &&
      inlineThreadId &&
      inlineThreadId !== currentSelection.emailThreadId
      ? inlineThreadId
      : null,
    summaryAuthorizationKey,
  );
  const mainEntry = useAtomValue(
    myahInboxDraftAutosaveFamilyState.atomFamily({
      workspaceId: workspaceId ?? '',
      threadId: currentSelection.emailThreadId ?? '',
    }),
  );
  useEffect(() => {
    if (
      (preservedReturnSelectionRef.current &&
        JSON.stringify(preservedReturnSelectionRef.current) ===
          JSON.stringify(currentSelection)) ||
      !latestThreadId ||
      currentSelection.channel !== 'EMAIL' ||
      latestThreadId === currentSelection.emailThreadId
    )
      return;
    const selectedCard = outreachCards.find(
      (card) => card.threadId === currentSelection.emailThreadId,
    );
    const latestCard = outreachCards.find(
      (card) => card.threadId === latestThreadId,
    );
    if (
      currentSelection.emailThreadId &&
      (!selectedCard ||
        !latestCard ||
        latestCard.startTimestamp.localeCompare(selectedCard.startTimestamp) <
          0 ||
        (latestCard.startTimestamp === selectedCard.startTimestamp &&
          latestCard.threadId.localeCompare(selectedCard.threadId) <= 0) ||
        !mainEntry ||
        mainEntry.dirty ||
        mainEntry.operation ||
        mainEntry.status === 'saving' ||
        mainEntry.status === 'error' ||
        mainEntry.status === 'conflict' ||
        mainEntry.localBody.markdown ||
        mainEntry.localBody.blocknote ||
        inlineThreadId === currentSelection.emailThreadId)
    )
      return;
    commitContactSelection({
      ...currentSelection,
      emailThreadId: latestThreadId,
    });
  }, [
    latestThreadId,
    currentSelection,
    mainEntry,
    inlineThreadId,
    outreachCards,
    commitContactSelection,
  ]);
  const selectedThread = useMyahInboxSelectedEmailThread(
    workspaceId,
    currentSelection.channel === 'EMAIL' && email.status === 'ready'
      ? currentSelection.emailThreadId
      : null,
    summaryAuthorizationKey,
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
      invalidateWorkspace(myahInboxContactSelection.workspaceId);
      commitContactSelection(EMPTY_MYAH_INBOX_CONTACT_SELECTION);
      setRetainedContact(null);
      setMobilePanel('contacts');
    }
  }, [
    invalidateWorkspace,
    myahInboxContactSelection,
    commitContactSelection,
    workspaceId,
  ]);

  useEffect(() => {
    if (preservedReturnSelectionRef.current) {
      store.set(myahInboxPreserveSelectionOnUnmountState.atom, false);
    }
    const cleanupGeneration = ++cleanupGenerationRef.current;

    return () => {
      queueMicrotask(() => {
        // eslint-disable-next-line react-hooks/exhaustive-deps
        if (cleanupGenerationRef.current === cleanupGeneration) {
          if (store.get(myahInboxPreserveSelectionOnUnmountState.atom)) return;
          commitContactSelection(EMPTY_MYAH_INBOX_CONTACT_SELECTION);
        }
      });
    };
  }, [commitContactSelection, store]);

  useEffect(() => {
    if (
      pendingDestination ||
      contacts.loading ||
      contacts.error ||
      !workspaceId
    ) {
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
      invalidateWorkspace(workspaceId);
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
    pendingDestination,
    contacts.contacts,
    contacts.error,
    contacts.loading,
    currentSelection,
    invalidateWorkspace,
    selectedContact,
    commitContactSelection,
    workspaceId,
  ]);

  // A later click or a forced scope transition must not commit an older awaited navigation.
  // oxlint-disable-next-line twenty/no-state-useref
  const transitionRef = useRef<symbol | null>(null);
  // oxlint-disable-next-line twenty/no-state-useref
  const workspaceRef = useRef(workspaceId);
  workspaceRef.current = workspaceId;
  const flushAffectedDrafts = async () => {
    if (!workspaceId) return false;
    const transition = Symbol('Inbox transition');
    transitionRef.current = transition;
    const generation = selectionGenerationRef.current;
    const saved = await flushWorkspaceForNavigation(
      workspaceId,
      // Contact membership includes dormant recovery drafts, not just live targets.
      currentSelection.channel === 'EMAIL' && currentSelection.emailThreadId
        ? [
            ...new Set([
              currentSelection.emailThreadId,
              ...(inlineThreadId ? [inlineThreadId] : []),
            ]),
          ]
        : [],
    );
    if (
      workspaceRef.current !== workspaceId ||
      transitionRef.current !== transition ||
      selectionGenerationRef.current !== generation
    )
      return false;
    if (!saved)
      setStatus({
        workspaceId,
        message:
          'Resolve pending draft changes before leaving this conversation.',
      });
    return saved;
  };

  useEffect(() => {
    if (
      !pendingDestination ||
      !workspaceId ||
      contacts.loading ||
      contacts.error
    )
      return;
    const matches = contacts.contacts.filter(
      (contact) =>
        contact.creator?.id === pendingDestination.creatorRecordId &&
        contact.instagram.state === 'READY' &&
        contact.instagram.conversations.length === 1 &&
        contact.instagram.conversations[0].id ===
          pendingDestination.conversationRecordId,
    );
    if (matches.length !== 1) return;
    const contact = matches[0];
    const generation = selectionGenerationRef.current;
    let active = true;
    void flushWorkspaceForNavigation(
      workspaceId,
      currentSelection.channel === 'EMAIL' && currentSelection.emailThreadId
        ? [
            ...new Set([
              currentSelection.emailThreadId,
              ...(inlineThreadId ? [inlineThreadId] : []),
            ]),
          ]
        : [],
    ).then((saved) => {
      if (
        !active ||
        !saved ||
        workspaceRef.current !== workspaceId ||
        selectionGenerationRef.current !== generation ||
        store.get(myahInboxPendingInstagramSelectionState.atom) !==
          pendingDestination
      )
        return;
      const nextSelection = getMyahInboxSelectionForChannel({
        workspaceId,
        contact,
        channel: 'INSTAGRAM',
        previousSelection: null,
      });
      if (
        nextSelection.instagramConversationId !==
        pendingDestination.conversationRecordId
      )
        return;
      setMyahInboxPendingInstagramSelection(null);
      setRetainedContact(contact);
      commitContactSelection(nextSelection);
      if (isMobile) setMobilePanel('conversation');
    });
    return () => {
      active = false;
    };
  }, [
    pendingDestination,
    workspaceId,
    contacts.contacts,
    contacts.loading,
    contacts.error,
    flushWorkspaceForNavigation,
    store,
    setMyahInboxPendingInstagramSelection,
    commitContactSelection,
    isMobile,
    currentSelection.channel,
    currentSelection.emailThreadId,
    inlineThreadId,
  ]);

  const cancelPendingDestination = () => {
    // Even choosing the current target is newer intent than an in-flight composer send.
    // Preserve every selection value; only the existing navigation identity guard changes.
    setMyahInboxContactSelection({ ...myahInboxContactSelection });
    selectionGenerationRef.current += 1;
    if (workspaceId) initializedWorkspaceIdsRef.current.add(workspaceId);
    setMyahInboxPendingInstagramSelection(null);
  };

  const handleSelectContact = async (
    contactId: string,
    options?: { openConversation?: boolean },
  ) => {
    cancelPendingDestination();
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

    if (!(await flushAffectedDrafts())) return;
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

  const handleSelectChannel = async (channel: MyahInboxChannel) => {
    cancelPendingDestination();
    if (!workspaceId || !selectedContact) {
      return;
    }

    if (channel !== currentSelection.channel && !(await flushAffectedDrafts()))
      return;
    commitContactSelection(
      getMyahInboxSelectionForChannel({
        workspaceId,
        contact: selectedContact,
        channel,
        previousSelection: currentSelection,
      }),
    );
  };

  const handleReplyToCard = async (threadId: string) => {
    cancelPendingDestination();
    if (
      !workspaceId ||
      !selectedContact ||
      !getMyahInboxOutreachCards(email).some(
        (card) => card.threadId === threadId,
      )
    )
      return;
    if (!(await flushAffectedDrafts())) return;
    setInlineTarget({ scope: targetScope, threadId });
    const generation = selectionGenerationRef.current;
    requestAnimationFrame(() => {
      if (selectionGenerationRef.current !== generation) return;
      document
        .querySelector<HTMLElement>('[aria-label="Inline reply"]')
        ?.focus();
    });
  };
  const handleCloseInline = async () => {
    cancelPendingDestination();
    if (!(await flushAffectedDrafts())) return;
    setInlineTarget(null);
    const generation = selectionGenerationRef.current;
    requestAnimationFrame(() => {
      if (selectionGenerationRef.current !== generation) return;
      if (inlineThreadId === currentSelection.emailThreadId) {
        document
          .querySelector<HTMLElement>('[aria-label="Main reply"]')
          ?.focus();
        return;
      }
      const invoker = [
        ...document.querySelectorAll<HTMLElement>('[data-reply-thread-id]'),
      ]
        .find((node) => node.dataset.replyThreadId === inlineThreadId)
        ?.querySelector('button');
      invoker?.focus();
    });
  };
  const handleSwitchToLatest = async () => {
    cancelPendingDestination();
    if (!latestThreadId || !(await flushAffectedDrafts())) return;
    setInlineTarget(null);
    commitContactSelection({
      ...currentSelection,
      emailThreadId: latestThreadId,
    });
  };

  const handleRefresh = async (
    selectedContactId = currentSelection.contactId,
    options?: {
      force?: boolean;
      preserveTarget?: boolean;
      refreshEmailHistory?: boolean;
    },
  ) => {
    const refreshSelectionGeneration = selectionGenerationRef.current;
    const refreshSelection = currentSelection;
    const result = options?.force
      ? await contacts.refresh(selectedContactId, { force: true })
      : await contacts.refresh(selectedContactId);

    if (
      result.status !== 'success' ||
      !workspaceId ||
      workspaceRef.current !== workspaceId ||
      callbackScopeRef.current === null ||
      selectionGenerationRef.current !== refreshSelectionGeneration
    ) {
      return;
    }

    setDraftAuthorizationGeneration((generation) => generation + 1);
    if (!result.selectedContact) {
      invalidateWorkspace(workspaceId);
      setRetainedContact(null);
      commitContactSelection(EMPTY_MYAH_INBOX_CONTACT_SELECTION);
      return;
    }

    setRetainedContact(result.selectedContact);
    const nextSelection = options?.preserveTarget
      ? getMyahInboxRegroupedContactSelection({
          workspaceId,
          contact: result.selectedContact,
          previousSelection: refreshSelection,
        })
      : getMyahInboxContactSelection({
          workspaceId,
          contact: result.selectedContact,
          previousSelection: refreshSelection,
        });
    commitContactSelection(nextSelection);
    if (
      options?.refreshEmailHistory &&
      refreshSelection.channel === 'EMAIL' &&
      nextSelection.channel === 'EMAIL' &&
      nextSelection.contactId === refreshSelection.contactId
    ) {
      await email.refresh();
    }
  };

  const handleFiltersChange = async (nextFilters: MyahInboxFilters) => {
    cancelPendingDestination();
    if (!(await flushAffectedDrafts())) return;
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

  const callbackScope = `${targetScope}:${currentSelection.emailThreadId}:${summaryAuthorizationKey}`;
  // Async legacy actions retain their originating exact target, never the next contact.
  // oxlint-disable-next-line twenty/no-state-useref
  const callbackScopeRef = useRef<string | null>(callbackScope);
  callbackScopeRef.current = callbackScope;
  useEffect(
    () => () => {
      callbackScopeRef.current = null;
    },
    [],
  );
  const handleActivity = async () => {
    if (callbackScopeRef.current !== callbackScope) return;
    await Promise.all([
      selectedThread.refresh(),
      email.refresh(),
      handleRefresh(),
    ]);
  };

  const publishStatus = (message: string) => {
    if (callbackScopeRef.current !== callbackScope) return;
    setStatus({ message, workspaceId });
  };

  const handleThreadUpdated = (message: string) => {
    if (callbackScopeRef.current !== callbackScope) return;
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
      onRefresh={() =>
        void handleRefresh(undefined, { refreshEmailHistory: true })
      }
      onRetry={() =>
        void handleRefresh(undefined, { refreshEmailHistory: true })
      }
    />
  );
  const conversation =
    workspaceId && selectedContact && currentSelection.channel ? (
      <MyahInboxContactConversation
        workspaceId={workspaceId}
        contact={selectedContact}
        selectionChannel={currentSelection.channel}
        selectedEmailThreadId={currentSelection.emailThreadId}
        draftScopeGeneration={`${workspaceId}:${currentSelection.contactId}:${draftAuthorizationGeneration}`}
        draftScopeAvailable={
          email.status === 'ready' &&
          !contacts.isRefreshing &&
          !contacts.error &&
          contacts.refreshStatus !== 'failed'
        }
        email={{
          ...email,
          refresh: () => {
            setDraftAuthorizationGeneration((generation) => generation + 1);
            return email.refresh();
          },
          rebase: () => {
            setDraftAuthorizationGeneration((generation) => generation + 1);
            return email.rebase();
          },
        }}
        inlineThreadId={inlineThreadId}
        inlineThread={
          inlineThreadId === currentSelection.emailThreadId
            ? selectedThread
            : inlineThread
        }
        latestThreadId={latestThreadId}
        onCloseInline={handleCloseInline}
        onSwitchToLatest={handleSwitchToLatest}
        selectedThread={selectedThread}
        onSelectChannel={handleSelectChannel}
        onReplyToCard={handleReplyToCard}
        onContactLinked={async (resultingContactId) => {
          if (callbackScopeRef.current !== callbackScope) return;
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
      <MyahInboxContextEffect
        workspaceId={workspaceId}
        thread={selectedThread.thread}
      />
      {pendingDestination ? (
        <StyledSelectionStatus role="status" aria-live="polite">
          Message sent. Waiting for its exact Instagram conversation. Refresh or
          load more contacts, or adjust Inbox filters if it is not visible.
          <Button
            title="Refresh Inbox"
            variant="secondary"
            size="small"
            onClick={() => void contacts.refresh(null, { force: true })}
          />
        </StyledSelectionStatus>
      ) : null}
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
              onChange={async (panel) => {
                if (
                  panel === 'contacts' &&
                  mobilePanel === 'conversation' &&
                  !(await flushAffectedDrafts())
                )
                  return;
                setMobilePanel(panel);
              }}
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
