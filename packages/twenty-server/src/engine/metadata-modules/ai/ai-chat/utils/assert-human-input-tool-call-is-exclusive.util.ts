import { ASK_QUESTIONS_TOOL_NAME } from 'src/engine/metadata-modules/ai/ai-chat/tools/ask-questions.tool';
import { REQUEST_APPROVAL_TOOL_NAME } from 'src/engine/metadata-modules/ai/ai-chat/tools/request-approval.tool';
import {
  AiException,
  AiExceptionCode,
} from 'src/engine/metadata-modules/ai/ai.exception';

const HUMAN_INPUT_TOOL_NAMES = new Set([
  ASK_QUESTIONS_TOOL_NAME,
  REQUEST_APPROVAL_TOOL_NAME,
]);

type ToolCallLike = {
  toolName: string;
};

export const assertHumanInputToolCallIsExclusive = (
  toolCalls: ToolCallLike[],
) => {
  const humanInputToolCall = toolCalls.find((toolCall) =>
    HUMAN_INPUT_TOOL_NAMES.has(toolCall.toolName),
  );

  if (humanInputToolCall === undefined || toolCalls.length === 1) {
    return;
  }

  throw new AiException(
    `Human-input tool "${humanInputToolCall.toolName}" must be the only tool call in its model step.`,
    AiExceptionCode.INVALID_AGENT_INPUT,
  );
};
