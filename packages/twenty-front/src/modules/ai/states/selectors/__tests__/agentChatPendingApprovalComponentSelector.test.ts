import { createStore } from 'jotai/vanilla';
import { REQUEST_APPROVAL_TOOL_NAME } from 'twenty-shared/ai';

import { agentChatDisplayedThreadState } from '@/ai/states/agentChatDisplayedThreadState';
import { agentChatMessagesComponentFamilyState } from '@/ai/states/agentChatMessagesComponentFamilyState';
import { agentChatPendingApprovalComponentSelector } from '@/ai/states/selectors/agentChatPendingApprovalComponentSelector';

describe('agentChatPendingApprovalComponentSelector', () => {
  it('stores only the registered approval binding UUID', () => {
    const store = createStore();
    const instanceId = 'instance-id';
    const threadId = 'thread-id';
    const actionApprovalBindingId = 'b24f28a7-64bd-4cb8-ac5f-837536ca11db';
    store.set(agentChatDisplayedThreadState.atom, threadId);
    store.set(
      agentChatMessagesComponentFamilyState.atomFamily({
        instanceId,
        familyKey: { threadId },
      }),
      [
        {
          id: 'message-id',
          role: 'assistant',
          parts: [
            {
              type: `tool-${REQUEST_APPROVAL_TOOL_NAME}`,
              toolCallId: 'approval-call-id',
              state: 'output-available',
              input: {
                toolName: 'send_instagram_reply',
                actionInput: { draftId: 'ignored-by-client' },
              },
              output: {
                result: { status: 'pending', actionApprovalBindingId },
              },
            },
          ],
        },
      ] as never,
    );

    expect(
      store.get(
        agentChatPendingApprovalComponentSelector.selectorFamily({
          instanceId,
        }),
      ),
    ).toEqual({
      messageId: 'message-id',
      toolCallId: 'approval-call-id',
      actionApprovalBindingId,
    });
  });
});
