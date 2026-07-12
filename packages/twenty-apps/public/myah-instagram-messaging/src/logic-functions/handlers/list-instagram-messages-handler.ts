import { INSTAGRAM_LIST_ALL_MESSAGES_TOOL_SLUG } from 'src/logic-functions/constants/composio-instagram.constants';
import { type ListInstagramMessagesInput } from 'src/logic-functions/types/instagram-messaging-inputs.type';
import { executeComposioInstagramTool } from 'src/logic-functions/utils/execute-composio-instagram-tool';
import {
  extractNestedDataList,
  sanitizePaging,
} from 'src/logic-functions/utils/instagram-response-normalization';
import {
  buildMissingConnectedAccountError,
  clampManualDiscoveryLimit,
  requireFields,
  resolveConnectedAccountId,
} from 'src/logic-functions/utils/input-validation';

export const listInstagramMessagesHandler = async (
  input: ListInstagramMessagesInput = {},
) => {
  const connectedAccountId = resolveConnectedAccountId(input.connectedAccountId);
  const missingFields = requireFields({
    connectedAccountId,
    conversationId: input.conversationId,
  });

  if (missingFields.length > 0) {
    return {
      success: false,
      error: missingFields.includes('connectedAccountId')
        ? buildMissingConnectedAccountError(missingFields)
        : `Missing required fields: ${missingFields.join(', ')}.`,
    };
  }

  const argumentsPayload = {
    conversation_id: input.conversationId!.trim(),
    limit: clampManualDiscoveryLimit(input.limit),
    ...(input.after?.trim() ? { after: input.after.trim() } : {}),
    ...(input.graphApiVersion?.trim()
      ? { graph_api_version: input.graphApiVersion.trim() }
      : {}),
  };

  const result = await executeComposioInstagramTool({
    toolSlug: INSTAGRAM_LIST_ALL_MESSAGES_TOOL_SLUG,
    connectedAccountId: connectedAccountId!,
    arguments: argumentsPayload,
  });

  if (!result.success) {
    return result;
  }

  return {
    success: true,
    toolSlug: INSTAGRAM_LIST_ALL_MESSAGES_TOOL_SLUG,
    messages: extractNestedDataList(result.data),
    ...(sanitizePaging(result.data) ? { paging: sanitizePaging(result.data) } : {}),
  };
};
