import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { useApolloClient } from '@apollo/client/react';
import { useStore } from 'jotai';
import { useCallback } from 'react';
import { type ApprovalDecision } from 'twenty-shared/ai';
import { isDefined } from 'twenty-shared/utils';

import { AGENT_CHAT_INSTANCE_ID } from '@/ai/constants/AgentChatInstanceId';
import { AGENT_CHAT_REFETCH_MESSAGES_EVENT_NAME } from '@/ai/constants/AgentChatRefetchMessagesEventName';
import { RESOLVE_AGENT_CHAT_APPROVAL } from '@/ai/graphql/mutations/resolveAgentChatApproval';
import { useAgentChatModelId } from '@/ai/hooks/useAgentChatModelId';
import { agentChatDisplayedThreadState } from '@/ai/states/agentChatDisplayedThreadState';
import { agentChatIsAwaitingFirstChunkComponentFamilyState } from '@/ai/states/agentChatIsAwaitingFirstChunkComponentFamilyState';
import { agentChatMessagesComponentFamilyState } from '@/ai/states/agentChatMessagesComponentFamilyState';
import { markApprovalPending } from '@/ai/utils/markApprovalPending';
import { markApprovalResolved } from '@/ai/utils/markApprovalResolved';
import { dispatchBrowserEvent } from '@/browser-event/utils/dispatchBrowserEvent';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';

export const useSubmitApprovalDecision = () => {
  const apolloClient = useApolloClient();
  const store = useStore();
  const { enqueueErrorSnackBar } = useSnackBar();
  const { modelIdForRequest } = useAgentChatModelId();

  const submitDecision = useCallback(
    async ({
      messageId,
      toolCallId,
      decision,
      comment,
    }: {
      messageId: string;
      toolCallId: string;
      decision: ApprovalDecision;
      comment?: string;
    }) => {
      const threadId = store.get(agentChatDisplayedThreadState.atom);

      if (!isDefined(threadId)) {
        return;
      }

      const messagesAtom = agentChatMessagesComponentFamilyState.atomFamily({
        instanceId: AGENT_CHAT_INSTANCE_ID,
        familyKey: { threadId },
      });
      const isAwaitingFirstChunkAtom =
        agentChatIsAwaitingFirstChunkComponentFamilyState.atomFamily({
          instanceId: AGENT_CHAT_INSTANCE_ID,
          familyKey: { threadId },
        });
      const previousMessages = store.get(messagesAtom);

      store.set(
        messagesAtom,
        markApprovalResolved(previousMessages, messageId, toolCallId, {
          decision,
          comment,
        }),
      );
      store.set(isAwaitingFirstChunkAtom, true);

      try {
        const { data } = await apolloClient.mutate<{
          resolveAgentChatApproval: {
            streamId?: string | null;
          };
        }>({
          mutation: RESOLVE_AGENT_CHAT_APPROVAL,
          variables: {
            threadId,
            messageId,
            decision: { decision, comment },
            modelId: modelIdForRequest,
          },
        });

        if (!isDefined(data?.resolveAgentChatApproval.streamId)) {
          store.set(isAwaitingFirstChunkAtom, false);
        }

        dispatchBrowserEvent(AGENT_CHAT_REFETCH_MESSAGES_EVENT_NAME);
      } catch (error) {
        const currentMessages = store.get(messagesAtom);

        store.set(isAwaitingFirstChunkAtom, false);
        store.set(
          messagesAtom,
          markApprovalPending(currentMessages, messageId, toolCallId),
        );

        enqueueErrorSnackBar({
          apolloError: CombinedGraphQLErrors.is(error) ? error : undefined,
        });
      }
    },
    [apolloClient, store, enqueueErrorSnackBar, modelIdForRequest],
  );

  return { submitDecision };
};
