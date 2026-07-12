import { isToolUIPart } from 'ai';
import {
  type ExtendedUIMessage,
  type ExtendedUIMessagePart,
  type RequestApprovalToolResult,
} from 'twenty-shared/ai';
import { isDefined } from 'twenty-shared/utils';

export const markApprovalPending = (
  messages: ExtendedUIMessage[],
  messageId: string,
  toolCallId: string,
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
          | RequestApprovalToolResult
          | undefined;
        const request = previousResult?.request;

        if (!isDefined(request)) {
          return part;
        }

        return {
          ...part,
          output: {
            ...previousOutput,
            result: {
              request,
              status: 'pending',
            } satisfies RequestApprovalToolResult,
          },
        } as ExtendedUIMessagePart;
      }),
    };
  });
