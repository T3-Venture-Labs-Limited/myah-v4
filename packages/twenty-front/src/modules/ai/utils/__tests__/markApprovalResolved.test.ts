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

    expect(updated[0].parts[0]).toMatchObject({
      output: {
        result: {
          request,
          status: 'resolved',
          decision: 'approved',
          comment: 'Looks good',
          decidedAt: expect.any(String),
        },
      },
    });
  });

  it('restores the matching approval part to pending', () => {
    const resolved = markApprovalResolved(
      messages,
      'message-id',
      'approval-call',
      {
        decision: 'rejected',
      },
    );

    const updated = markApprovalPending(
      resolved,
      'message-id',
      'approval-call',
    );

    expect(updated[0].parts[0]).toMatchObject({
      output: {
        result: {
          request,
          status: 'pending',
        },
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
