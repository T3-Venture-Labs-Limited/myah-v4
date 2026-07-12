import {
  INSTAGRAM_LIST_ALL_CONVERSATIONS_TOOL_SLUG,
} from 'src/logic-functions/constants/composio-instagram.constants';
import { type ListInstagramConversationsInput } from 'src/logic-functions/types/instagram-messaging-inputs.type';
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

export const listInstagramConversationsHandler = async (
  input: ListInstagramConversationsInput = {},
) => {
  const connectedAccountId = resolveConnectedAccountId(input.connectedAccountId);
  const missingFields = requireFields({
    connectedAccountId,
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
    ...(input.igUserId?.trim() ? { ig_user_id: input.igUserId.trim() } : {}),
    limit: clampManualDiscoveryLimit(input.limit),
    ...(input.after?.trim() ? { after: input.after.trim() } : {}),
    ...(input.graphApiVersion?.trim()
      ? { graph_api_version: input.graphApiVersion.trim() }
      : {}),
  };

  const result = await executeComposioInstagramTool({
    toolSlug: INSTAGRAM_LIST_ALL_CONVERSATIONS_TOOL_SLUG,
    connectedAccountId: connectedAccountId!,
    arguments: argumentsPayload,
  });

  if (!result.success) {
    return result;
  }

  return {
    success: true,
    toolSlug: INSTAGRAM_LIST_ALL_CONVERSATIONS_TOOL_SLUG,
    conversations: extractNestedDataList(result.data),
    ...(sanitizePaging(result.data) ? { paging: sanitizePaging(result.data) } : {}),
  };
};
