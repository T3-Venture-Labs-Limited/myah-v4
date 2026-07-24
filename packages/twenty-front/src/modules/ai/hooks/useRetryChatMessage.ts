import { useApolloClient } from '@apollo/client/react';
import { useStore } from 'jotai';
import { useCallback } from 'react';
import { isDefined } from 'twenty-shared/utils';

import { AGENT_CHAT_INSTANCE_ID } from '@/ai/constants/AgentChatInstanceId';
import { AGENT_CHAT_REFETCH_MESSAGES_EVENT_NAME } from '@/ai/constants/AgentChatRefetchMessagesEventName';
import { RETRY_CHAT_MESSAGE } from '@/ai/graphql/mutations/retryChatMessage';
import { useAgentChatModelId } from '@/ai/hooks/useAgentChatModelId';
import { useGetBrowsingContext } from '@/ai/hooks/useBrowsingContext';
import { agentChatDisplayedThreadState } from '@/ai/states/agentChatDisplayedThreadState';
import { agentChatErrorComponentFamilyState } from '@/ai/states/agentChatErrorComponentFamilyState';
import { agentChatLastSentBrowsingContextFamilyState } from '@/ai/states/agentChatLastSentBrowsingContextFamilyState';
import { agentChatIsAwaitingFirstChunkComponentFamilyState } from '@/ai/states/agentChatIsAwaitingFirstChunkComponentFamilyState';
import { dispatchBrowserEvent } from '@/browser-event/utils/dispatchBrowserEvent';

export const useRetryChatMessage = () => {
  const apolloClient = useApolloClient();
  const store = useStore();
  const { modelIdForRequest } = useAgentChatModelId();
  const { getBrowsingContext } = useGetBrowsingContext();

  const retryChatMessage = useCallback(async () => {
    const threadId = store.get(agentChatDisplayedThreadState.atom);

    if (!isDefined(threadId)) {
      return;
    }

    const errorAtom = agentChatErrorComponentFamilyState.atomFamily({
      instanceId: AGENT_CHAT_INSTANCE_ID,
      familyKey: { threadId },
    });
    const isAwaitingFirstChunkAtom =
      agentChatIsAwaitingFirstChunkComponentFamilyState.atomFamily({
        instanceId: AGENT_CHAT_INSTANCE_ID,
        familyKey: { threadId },
      });
    const previousError = store.get(errorAtom);

    store.set(errorAtom, null);
    store.set(isAwaitingFirstChunkAtom, true);

    const browsingContext = getBrowsingContext();
    const lastSentBrowsingContext = store.get(
      agentChatLastSentBrowsingContextFamilyState.atomFamily(threadId),
    );
    const inboxSelectionForRetry =
      browsingContext?.type === 'myahInboxThreadSelection' &&
      lastSentBrowsingContext?.type === 'myahInboxThreadSelection' &&
      browsingContext.workspaceId === lastSentBrowsingContext.workspaceId &&
      browsingContext.threadId === lastSentBrowsingContext.threadId
        ? lastSentBrowsingContext
        : null;

    try {
      await apolloClient.mutate({
        mutation: RETRY_CHAT_MESSAGE,
        variables: {
          threadId,
          browsingContext: inboxSelectionForRetry,
          modelId: modelIdForRequest ?? undefined,
        },
      });

      dispatchBrowserEvent(AGENT_CHAT_REFETCH_MESSAGES_EVENT_NAME);
    } catch (retryError) {
      store.set(isAwaitingFirstChunkAtom, false);
      store.set(
        errorAtom,
        retryError instanceof Error ? retryError : previousError,
      );
    }
  }, [apolloClient, store, modelIdForRequest, getBrowsingContext]);

  return { retryChatMessage };
};
