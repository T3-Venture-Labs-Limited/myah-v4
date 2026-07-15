import { type ExtendedUIMessagePart } from 'twenty-shared/ai';

import {
  findPendingHumanInputPart,
  findPendingHumanInputParts,
  findPendingQuestionPart,
} from 'src/engine/metadata-modules/ai/ai-chat/utils/find-pending-human-input-part.util';

const askQuestionsPart = (
  status: 'pending' | 'answered',
  toolCallId = 'question-call',
): ExtendedUIMessagePart =>
  ({
    type: 'tool-ask_questions',
    toolCallId,
    state: 'output-available',
    input: { questions: [] },
    output: {
      success: true,
      message: 'x',
      result: {
        questions: [{ header: 'h', question: 'q', options: [] }],
        status,
      },
    },
  }) as unknown as ExtendedUIMessagePart;

const requestApprovalPart = (
  status: 'pending' | 'resolved',
  toolCallId = 'approval-call',
): ExtendedUIMessagePart =>
  ({
    type: 'tool-request_approval',
    toolCallId,
    state: 'output-available',
    input: {},
    output: {
      success: true,
      message: 'x',
      result: {
        request: {
          title: 'Send email',
          summary: 'Send one email.',
          actionKind: 'email_send',
          riskLevel: 'medium',
          consequences: ['Email will be sent.'],
        },
        status,
      },
    },
  }) as unknown as ExtendedUIMessagePart;

const requestInstagramReplyApprovalPart = (
  status: 'pending' | 'resolved',
  toolCallId = 'instagram-approval-call',
): ExtendedUIMessagePart =>
  ({
    type: 'tool-request_instagram_reply_approval',
    toolCallId,
    state: 'output-available',
    input: {},
    output: {
      success: true,
      message: 'x',
      result: {
        request: {
          title: 'Review Instagram reply',
          summary: 'Review the local draft.',
          actionKind: 'external_write',
          riskLevel: 'medium',
          consequences: ['The message will be sent.'],
        },
        status,
      },
    },
  }) as unknown as ExtendedUIMessagePart;

const textPart = (text: string): ExtendedUIMessagePart =>
  ({ type: 'text', text }) as ExtendedUIMessagePart;

describe('findPendingHumanInputPart', () => {
  it('returns a pending approval part', () => {
    const part = findPendingHumanInputPart([
      textPart('hello'),
      requestApprovalPart('pending'),
    ]);

    expect(part).toBeDefined();
    expect(part?.toolCallId).toBe('approval-call');
  });

  it('returns a pending server-owned Instagram reply approval part', () => {
    const part = findPendingHumanInputPart([
      textPart('hello'),
      requestInstagramReplyApprovalPart('pending'),
    ]);

    expect(part?.toolCallId).toBe('instagram-approval-call');
  });

  it('returns a pending question part through the compatibility wrapper', () => {
    const part = findPendingQuestionPart([
      textPart('hello'),
      askQuestionsPart('pending'),
    ]);

    expect(part).toBeDefined();
    expect(part?.toolCallId).toBe('question-call');
  });

  it('ignores resolved approvals and answered questions', () => {
    expect(
      findPendingHumanInputPart([
        requestApprovalPart('resolved'),
        askQuestionsPart('answered'),
      ]),
    ).toBeUndefined();
  });

  it('returns every pending human-input part so callers can reject multi-pending turns', () => {
    const parts = findPendingHumanInputParts([
      requestApprovalPart('pending', 'approval-call'),
      askQuestionsPart('pending', 'question-call'),
    ]);

    expect(parts.map((part) => part.toolCallId)).toEqual([
      'approval-call',
      'question-call',
    ]);
  });
});
