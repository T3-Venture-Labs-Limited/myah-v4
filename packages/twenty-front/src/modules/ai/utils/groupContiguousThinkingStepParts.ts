import { getToolName, isToolUIPart } from 'ai';
import {
  REQUEST_APPROVAL_TOOL_NAME,
  type ExtendedUIMessagePart,
} from 'twenty-shared/ai';

import { type AssistantMessageRenderItem } from '@/ai/utils/assistantMessageRenderItem';
import { isThinkingStepPart } from '@/ai/utils/isThinkingStepPart';
import { type ThinkingStepPart } from '@/ai/utils/thinkingStepPart';

export const groupContiguousThinkingStepParts = (
  parts: ExtendedUIMessagePart[],
): AssistantMessageRenderItem[] => {
  const renderItems: AssistantMessageRenderItem[] = [];
  let currentThinkingParts: ThinkingStepPart[] = [];

  const flushThinkingParts = () => {
    if (currentThinkingParts.length > 0) {
      renderItems.push({
        type: 'thinking-steps',
        parts: currentThinkingParts,
      });
      currentThinkingParts = [];
    }
  };

  for (const part of parts) {
    if (part.type === 'step-start') {
      continue;
    }

    const approvalResult =
      isToolUIPart(part) &&
      getToolName(part) === REQUEST_APPROVAL_TOOL_NAME &&
      typeof part.output === 'object' &&
      part.output !== null &&
      'result' in part.output
        ? part.output.result
        : undefined;

    if (
      typeof approvalResult === 'object' &&
      approvalResult !== null &&
      !('actionApprovalBindingId' in approvalResult) &&
      isToolUIPart(part) &&
      !(
        typeof part.input === 'object' &&
        part.input !== null &&
        'actionInput' in part.input
      )
    ) {
      flushThinkingParts();
      renderItems.push({ type: 'part', part });
      continue;
    }

    if (isThinkingStepPart(part)) {
      currentThinkingParts.push(part);
      continue;
    }

    flushThinkingParts();

    renderItems.push({
      type: 'part',
      part,
    });
  }

  flushThinkingParts();

  return renderItems;
};
