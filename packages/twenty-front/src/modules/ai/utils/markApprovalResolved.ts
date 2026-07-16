import { isToolUIPart } from 'ai';
import {
  type ApprovalDecision,
  type ExtendedUIMessage,
  type ExtendedUIMessagePart,
  type RequestApprovalToolResult,
} from 'twenty-shared/ai';
import { isDefined } from 'twenty-shared/utils';

type ApprovalResolution = {
  decision: ApprovalDecision;
  comment?: string;
};

export const markApprovalResolved = (
  messages: ExtendedUIMessage[],
  messageId: string,
  toolCallId: string,
  resolution: ApprovalResolution,
): ExtendedUIMessage[] =>
  messages.map((message) => {
    if (message.id !== messageId) {
      return message;
    }

    return {
      ...message,
      parts: message.parts.map((part) => {
        if (!isToolUIPart(part) || part.toolCallId !== toolCallId) {
          return part;
        }

        const previousOutput = isDefined(part.output)
          ? (part.output as Record<string, unknown>)
          : {};
        const previousResult = previousOutput.result as
          | (Partial<RequestApprovalToolResult> & {
              actionApprovalBindingId?: string;
            })
          | undefined;

        if (!isDefined(previousResult)) {
          return part;
        }

        return {
          ...part,
          output: {
            ...previousOutput,
            result: {
              ...previousResult,
              status: 'resolved',
              decision: resolution.decision,
              comment: resolution.comment,
              decidedAt: new Date().toISOString(),
            },
          },
        } as ExtendedUIMessagePart;
      }),
    };
  });
