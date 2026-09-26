import { isToolUIPart } from 'ai';
import { type ExtendedUIMessage } from 'twenty-shared/ai';

import { markApprovalPending } from '@/ai/utils/markApprovalPending';
import { markApprovalResolved } from '@/ai/utils/markApprovalResolved';

const request = {
  title: 'Send email',
  summary: 'Send one email.',
  actionKind: 'email_send',
  riskLevel: 'medium',
  consequences: ['Email will be sent.'],
} as const;

const messages: ExtendedUIMessage[] = [
  {
    id: 'message-id',
    role: 'assistant',
    parts: [
      {
        type: 'tool-request_approval',
        toolCallId: 'approval-call',
        state: 'output-available',
        input: request,
        output: {
          success: true,
          message: 'Approval request presented.',
          result: { request, status: 'pending' },
        },
      },
    ],
  } as unknown as ExtendedUIMessage,
];

describe('approval optimistic state helpers', () => {
  it('marks the matching approval part as resolved', () => {
    const updated = markApprovalResolved(
      messages,
      'message-id',
      'approval-call',
      {
        decision: 'approved',
        comment: 'Looks good',
      },
    );

    const resolvedPart = updated[0].parts[0];
    expect(isToolUIPart(resolvedPart)).toBe(true);
    if (!isToolUIPart(resolvedPart)) {
      return;
    }

    expect(resolvedPart.output).toEqual({
      result: {
        request,
        status: 'resolved',
        decision: 'approved',
        comment: 'Looks good',
        decidedAt: expect.any(String),
      },
    });
  });

  it.each(['approved', 'rejected'] as const)(
    'keeps the reviewed generic action visible when %s',
    (decision) => {
      const reviewedAction = {
        version: 1,
        toolName: 'update_one_creator',
        toolLabel: 'Update Creator',
        argumentsDigest: 'a'.repeat(64),
        arguments: { id: 'alice-id', creatorStatus: 'QUALIFIED' },
        target: { kind: 'arguments_only' },
      };
      const reviewedMessages = [
        {
          ...messages[0],
          parts: [
            {
              ...messages[0].parts[0],
              output: {
                result: { request, reviewedAction, status: 'pending' },
              },
            },
          ],
        },
      ] as ExtendedUIMessage[];

      const [resolvedPart] = markApprovalResolved(
        reviewedMessages,
        'message-id',
        'approval-call',
        { decision },
      )[0].parts;

      expect(resolvedPart).toMatchObject({
        output: {
          result: { request, reviewedAction, status: 'resolved', decision },
        },
      });
    },
  );

  it('keeps the reviewed generic action when rolling back to pending', () => {
    const reviewedAction = {
      version: 1,
      toolName: 'update_one_creator',
      toolLabel: 'Update Creator',
      argumentsDigest: 'a'.repeat(64),
      arguments: { id: 'alice-id' },
      target: { kind: 'arguments_only' },
    };
    const resolvedMessages = [
      {
        ...messages[0],
        parts: [
          {
            ...messages[0].parts[0],
            output: {
              result: {
                request,
                reviewedAction,
                status: 'resolved',
                decision: 'approved',
              },
            },
          },
        ],
      },
    ] as ExtendedUIMessage[];

    expect(
      markApprovalPending(resolvedMessages, 'message-id', 'approval-call')[0]
        .parts[0],
    ).toMatchObject({
      output: { result: { request, reviewedAction, status: 'pending' } },
    });
  });

  it('preserves the opaque action approval binding UUID when resolving', () => {
    const actionApprovalBindingId = 'b24f28a7-64bd-4cb8-ac5f-837536ca11db';
    const registeredMessages = [
      {
        ...messages[0],
        parts: [
          {
            ...messages[0].parts[0],
            output: {
              result: { status: 'pending', actionApprovalBindingId },
            },
          },
        ],
      },
    ] as ExtendedUIMessage[];

    const updated = markApprovalResolved(
      registeredMessages,
      'message-id',
      'approval-call',
      { decision: 'approved' },
    );

    expect(updated[0].parts[0]).toMatchObject({
      output: { result: { actionApprovalBindingId, status: 'resolved' } },
    });
  });

  it('keeps registered approval output opaque while resolving', () => {
    const actionApprovalBindingId = 'b24f28a7-64bd-4cb8-ac5f-837536ca11db';
    const registeredMessages = [
      {
        ...messages[0],
        parts: [
          {
            ...messages[0].parts[0],
            output: {
              body: 'body-must-not-survive',
              preview: 'preview-must-not-survive',
              providerPayload: 'provider-payload-must-not-survive',
              authorization: 'authorization-must-not-survive',
              error: 'error-must-not-survive',
              result: {
                actionApprovalBindingId,
                body: 'nested-body-must-not-survive',
                preview: 'nested-preview-must-not-survive',
                providerToken: 'provider-token-must-not-survive',
                auth: 'auth-must-not-survive',
                error: 'nested-error-must-not-survive',
              },
            },
          },
        ],
      },
    ] as ExtendedUIMessage[];

    const updated = markApprovalResolved(
      registeredMessages,
      'message-id',
      'approval-call',
      { decision: 'approved', comment: 'Approved' },
    );

    const resolvedPart = updated[0].parts[0];
    expect(isToolUIPart(resolvedPart)).toBe(true);
    if (!isToolUIPart(resolvedPart)) {
      return;
    }

    expect(resolvedPart.output).toEqual({
      result: {
        actionApprovalBindingId,
        status: 'resolved',
      },
    });
  });

  it('leaves non-matching tool calls untouched', () => {
    const updated = markApprovalResolved(messages, 'message-id', 'other-call', {
      decision: 'approved',
    });

    expect(updated).toEqual(messages);
  });
});
