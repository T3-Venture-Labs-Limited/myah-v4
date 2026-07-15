import { createStore } from 'jotai/vanilla';
import { REQUEST_INSTAGRAM_REPLY_APPROVAL_TOOL_NAME } from 'twenty-shared/ai';

import { agentChatDisplayedThreadState } from '@/ai/states/agentChatDisplayedThreadState';
import { agentChatMessagesComponentFamilyState } from '@/ai/states/agentChatMessagesComponentFamilyState';
import { agentChatPendingApprovalComponentSelector } from '@/ai/states/selectors/agentChatPendingApprovalComponentSelector';

describe('agentChatPendingApprovalComponentSelector', () => {
  it('selects a pending server-owned Instagram reply approval', () => {
    const store = createStore();
    const instanceId = 'instance-id';
    const threadId = 'thread-id';
    const request = {
      title: 'Review Instagram reply to wakozaco',
      summary: 'Review the prepared Instagram reply before it is sent.',
      actionKind: 'external_write' as const,
      riskLevel: 'medium' as const,
      consequences: ['The reply will be sent.'],
    };

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
              type: `tool-${REQUEST_INSTAGRAM_REPLY_APPROVAL_TOOL_NAME}`,
              toolCallId: 'approval-call-id',
              state: 'output-available',
              input: {
                connectedAccountId: 'ca_instagram_123',
                conversationId: '2370f3fb-5738-458c-ae4d-0bdb2c24611e',
                draftId: 'b24f28a7-64bd-4cb8-ac5f-837536ca11db',
              },
              output: { result: { request, status: 'pending' } },
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
      request,
    });
  });
});
