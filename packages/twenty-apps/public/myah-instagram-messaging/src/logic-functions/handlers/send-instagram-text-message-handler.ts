import { INSTAGRAM_SEND_TEXT_MESSAGE_TOOL_SLUG } from 'src/logic-functions/constants/composio-instagram.constants';
import { type SendInstagramTextMessageInput } from 'src/logic-functions/types/instagram-messaging-inputs.type';
import { executeComposioInstagramTool } from 'src/logic-functions/utils/execute-composio-instagram-tool';
import {
  buildMissingConnectedAccountError,
  requireFields,
  resolveConnectedAccountId,
} from 'src/logic-functions/utils/input-validation';

export const sendInstagramTextMessageHandler = async (
  input: SendInstagramTextMessageInput = {},
) => {
  const connectedAccountId = resolveConnectedAccountId(input.connectedAccountId);
  const missingFields = requireFields({
    connectedAccountId,
    recipientId: input.recipientId,
    text: input.text,
  });

  if (missingFields.length > 0) {
    return {
      success: false,
      error: missingFields.includes('connectedAccountId')
        ? buildMissingConnectedAccountError(missingFields)
        : `Missing required fields: ${missingFields.join(', ')}.`,
    };
  }

  const result = await executeComposioInstagramTool({
    toolSlug: INSTAGRAM_SEND_TEXT_MESSAGE_TOOL_SLUG,
    connectedAccountId: connectedAccountId!,
    arguments: {
      recipient_id: input.recipientId!.trim(),
      text: input.text!.trim(),
      ...(input.igUserId?.trim() ? { ig_user_id: input.igUserId.trim() } : {}),
      ...(input.graphApiVersion?.trim()
        ? { graph_api_version: input.graphApiVersion.trim() }
        : {}),
      ...(input.replyToMessageId?.trim()
        ? { reply_to_message_id: input.replyToMessageId.trim() }
        : {}),
    },
  });

  if (!result.success) {
    return result;
  }

  return {
    success: true,
    toolSlug: INSTAGRAM_SEND_TEXT_MESSAGE_TOOL_SLUG,
    data: result.data,
  };
};
