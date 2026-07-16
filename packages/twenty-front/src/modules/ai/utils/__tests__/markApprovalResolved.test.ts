import { type ExtendedUIMessage } from 'twenty-shared/ai';

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

    expect(updated[0].parts[0].output).toEqual({
      result: {
        status: 'resolved',
        decision: 'approved',
        comment: 'Looks good',
        decidedAt: expect.any(String),
      },
    });
  });

  it('preserves the opaque action approval binding UUID when resolving', () => {
    const actionApprovalBindingId =
      'b24f28a7-64bd-4cb8-ac5f-837536ca11db';
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

  it('strips untrusted approval result fields while resolving', () => {
    const actionApprovalBindingId =
      'b24f28a7-64bd-4cb8-ac5f-837536ca11db';
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

    expect(updated[0].parts[0].output).toEqual({
      result: {
        actionApprovalBindingId,
        status: 'resolved',
        decision: 'approved',
        comment: 'Approved',
        decidedAt: expect.any(String),
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
