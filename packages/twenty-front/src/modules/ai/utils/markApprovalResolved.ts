import { isToolUIPart } from 'ai';
import {
  type ApprovalDecision,
  type ExtendedUIMessage,
  type ExtendedUIMessagePart,
} from 'twenty-shared/ai';

type ApprovalResolution = {
  decision: ApprovalDecision;
  comment?: string;
};

const ACTION_APPROVAL_BINDING_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

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

        if (!isRecord(part.output) || !isRecord(part.output.result)) {
          return part;
        }

        const actionApprovalBindingId =
          part.output.result.actionApprovalBindingId;

        const isRegisteredApproval =
          typeof actionApprovalBindingId === 'string' &&
          ACTION_APPROVAL_BINDING_ID_PATTERN.test(actionApprovalBindingId);

        return {
          ...part,
          output: {
            result: isRegisteredApproval
              ? {
                  actionApprovalBindingId,
                  status: 'resolved',
                }
              : {
                  status: 'resolved',
                  decision: resolution.decision,
                  ...(typeof resolution.comment === 'string'
                    ? { comment: resolution.comment }
                    : {}),
                  decidedAt: new Date().toISOString(),
                },
          },
        } as ExtendedUIMessagePart;
      }),
    };
  });
