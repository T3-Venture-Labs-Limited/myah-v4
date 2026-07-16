import { getToolName, isToolUIPart } from 'ai';
import {
  ASK_QUESTIONS_TOOL_NAME,
  REQUEST_APPROVAL_TOOL_NAME,
  type AskQuestionsToolResult,
  type ExtendedUIMessagePart,
  type RequestApprovalToolResult,
} from 'twenty-shared/ai';

type HumanInputToolResult = AskQuestionsToolResult | RequestApprovalToolResult;

export type HumanInputToolPartWithOutput = ExtendedUIMessagePart & {
  toolCallId: string;
  output?: { result?: HumanInputToolResult };
};

const isPendingHumanInputResult = (
  toolName: string,
  result: HumanInputToolResult | undefined,
): boolean => {
  if (toolName === ASK_QUESTIONS_TOOL_NAME) {
    return (result as AskQuestionsToolResult | undefined)?.status === 'pending';
  }

  if (toolName === REQUEST_APPROVAL_TOOL_NAME) {
    return (
      (result as RequestApprovalToolResult | undefined)?.status === 'pending'
    );
  }

  return false;
};

export const findPendingHumanInputParts = (
  parts: ExtendedUIMessagePart[],
): HumanInputToolPartWithOutput[] => {
  const pendingParts: HumanInputToolPartWithOutput[] = [];

  for (const part of parts) {
    if (!isToolUIPart(part)) {
      continue;
    }

    const toolName = getToolName(part);

    if (
      toolName !== ASK_QUESTIONS_TOOL_NAME &&
      toolName !== REQUEST_APPROVAL_TOOL_NAME
    ) {
      continue;
    }

    const toolPart = part as HumanInputToolPartWithOutput;

    if (isPendingHumanInputResult(toolName, toolPart.output?.result)) {
      pendingParts.push(toolPart);
    }
  }

  return pendingParts;
};

export const findPendingHumanInputPart = (
  parts: ExtendedUIMessagePart[],
): HumanInputToolPartWithOutput | undefined =>
  findPendingHumanInputParts(parts)[0];

export const findPendingQuestionPart = findPendingHumanInputPart;
