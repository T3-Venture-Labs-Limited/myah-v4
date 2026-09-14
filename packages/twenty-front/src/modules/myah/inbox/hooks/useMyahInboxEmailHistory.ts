import { useEffect, useMemo, useSyncExternalStore } from 'react';

import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import {
  MyahInboxEmailHistoryStore,
  type MyahInboxEmailHistoryState,
} from '@/myah/inbox/utils/myahInboxEmailHistoryStore';

// authorizationKey must change with the current member/permission generation.
export const useMyahInboxEmailHistory = (
  workspaceId: string | null,
  contactId: string | null,
  authorizationKey: string | null,
) => {
  const client = useApolloCoreClient();
  // Only ID/cursor recovery plans survive contact changes; workspace or member
  // changes discard the entire collection. No shared drafts or Apollo cache here.
  const scope = useMemo(
    () => ({
      client,
      workspaceId,
      authorizationKey,
      histories: new Map<string | null, MyahInboxEmailHistoryStore>(),
    }),
    [client, workspaceId, authorizationKey],
  );
  const history = useMemo(() => {
    let history = scope.histories.get(contactId);
    if (!history) {
      history = new MyahInboxEmailHistoryStore(
        scope.client,
        scope.workspaceId,
        contactId,
        scope.authorizationKey,
      );
      scope.histories.set(contactId, history);
    }
    return history;
  }, [scope, contactId]);
  const state = useSyncExternalStore<MyahInboxEmailHistoryState>(
    history.subscribe,
    history.getSnapshot,
  );
  useEffect(() => {
    void history.start();
    return () => history.suspend();
  }, [history]);
  return {
    ...state,
    loadOlderCards: history.loadOlderCards,
    openCard: history.openCard,
    openDetachedCard: history.openDetachedCard,
    locateMessage: history.locateMessage,
    loadMessages: history.loadMessages,
    retryIncremental: history.retryIncremental,
    refresh: history.refresh,
    rebase: history.rebase,
    setReadingAnchor: history.setReadingAnchor,
    purge: history.purge,
  };
};
