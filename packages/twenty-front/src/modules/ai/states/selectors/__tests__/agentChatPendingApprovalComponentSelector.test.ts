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

  const genericRequest = {
    title: 'Qualify Alice',
    summary: "Set Alice's status to Qualified.",
    actionKind: 'internal_record_write',
    riskLevel: 'low',
    toolName: 'update_one_creator',
    consequences: ['Alice becomes Qualified.'],
  };
  const reviewedAction = {
    version: 1,
    toolName: 'update_one_creator',
    toolLabel: 'Update Creator',
    argumentsDigest: 'a'.repeat(64),
    arguments: { id: 'alice-id', creatorStatus: 'QUALIFIED' },
    target: {
      kind: 'record_write',
      operation: 'update',
      objectNameSingular: 'creator',
      records: [
        {
          recordId: 'alice-id',
          label: 'Alice',
          changes: [
            { field: 'creatorStatus', current: 'NEW', proposed: 'QUALIFIED' },
          ],
          linkedRecords: [],
        },
      ],
      totalCount: 1,
      targetFingerprint: 'b'.repeat(64),
    },
  };
  const selectGenericPending = (result: Record<string, unknown>) => {
    const store = createStore();
    const instanceId = 'instance-id';
    const threadId = 'thread-id';
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
              input: genericRequest,
              output: { result },
            },
          ],
        },
      ] as never,
    );

    return store.get(
      agentChatPendingApprovalComponentSelector.selectorFamily({ instanceId }),
    );
  };

  it('carries the server-derived reviewed action of a generic approval', () => {
    expect(
      selectGenericPending({
        status: 'pending',
        request: genericRequest,
        reviewedAction,
      }),
    ).toEqual({
      messageId: 'message-id',
      toolCallId: 'approval-call-id',
      request: genericRequest,
      reviewedAction,
    });
  });

  it('keeps a legacy generic approval without a reviewed action', () => {
    expect(
      selectGenericPending({ status: 'pending', request: genericRequest }),
    ).toEqual({
      messageId: 'message-id',
      toolCallId: 'approval-call-id',
      request: genericRequest,
    });
  });
});
