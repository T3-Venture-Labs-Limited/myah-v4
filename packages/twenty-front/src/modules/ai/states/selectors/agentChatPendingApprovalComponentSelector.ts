import { getToolName, isToolUIPart } from 'ai';
import {
  REQUEST_APPROVAL_TOOL_NAME,
  REQUEST_INSTAGRAM_REPLY_APPROVAL_TOOL_NAME,
  type RequestApprovalToolResult,
} from 'twenty-shared/ai';

import { AgentChatComponentInstanceContext } from '@/ai/contexts/AgentChatComponentInstanceContext';
import { agentChatDisplayedThreadState } from '@/ai/states/agentChatDisplayedThreadState';
import { agentChatMessagesComponentFamilyState } from '@/ai/states/agentChatMessagesComponentFamilyState';
import { type AgentChatPendingApproval } from '@/ai/types/AgentChatPendingApproval';
import { createAtomComponentSelector } from '@/ui/utilities/state/jotai/utils/createAtomComponentSelector';

export const agentChatPendingApprovalComponentSelector =
  createAtomComponentSelector<AgentChatPendingApproval | null>({
    key: 'agentChatPendingApprovalComponentSelector',
    componentInstanceContext: AgentChatComponentInstanceContext,
    get:
      ({ instanceId }) =>
      ({ get }) => {
        const currentThreadId = get(agentChatDisplayedThreadState);

        const messages = get(agentChatMessagesComponentFamilyState, {
          instanceId,
          familyKey: { threadId: currentThreadId },
        });

        const lastAssistantMessage = [...messages]
          .reverse()
          .find((message) => message.role === 'assistant');

        if (!lastAssistantMessage) {
          return null;
        }

        for (const part of lastAssistantMessage.parts) {
          if (
            !isToolUIPart(part) ||
            (getToolName(part) !== REQUEST_APPROVAL_TOOL_NAME &&
              getToolName(part) !== REQUEST_INSTAGRAM_REPLY_APPROVAL_TOOL_NAME)
          ) {
            continue;
          }

          const result = (part.output as { result?: RequestApprovalToolResult })
            ?.result;

          if (result?.status === 'pending') {
            return {
              messageId: lastAssistantMessage.id,
              toolCallId: part.toolCallId,
              request: result.request,
            };
          }
        }

        return null;
      },
  });
