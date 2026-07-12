import { defineLogicFunction } from 'twenty-sdk/define';
import { type InputJsonSchema } from 'twenty-sdk/logic-function';

import { SEND_INSTAGRAM_TEXT_MESSAGE_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';
import { sendInstagramTextMessageHandler } from 'src/logic-functions/handlers/send-instagram-text-message-handler';
import { jsonSchemaToInputSchema } from 'src/logic-functions/utils/json-schema-to-input-schema';

const sendInstagramTextMessageInputSchema: InputJsonSchema = {
  type: 'object',
  properties: {
    connectedAccountId: {
      type: 'string',
      description:
        'Optional Composio connected account id for the Instagram Business or Creator account. Falls back to MYAH_COMPOSIO_CONNECTED_ACCOUNT_ID when omitted.',
    },
    recipientId: {
      type: 'string',
      description:
        'Real Instagram-scoped recipient PSID/IGSID obtained from conversation/message lookup. Usernames are invalid.',
    },
    text: {
      type: 'string',
      description: 'Message text to send after explicit user approval.',
    },
    igUserId: {
      type: 'string',
      description: 'Optional Instagram Business Account ID.',
    },
    graphApiVersion: {
      type: 'string',
      description: 'Optional Instagram Graph API version, defaults upstream to v21.0.',
    },
    replyToMessageId: {
      type: 'string',
      description: 'Optional prior message id. Omit this unless known-good; invalid IDs can fail.',
    },
  },
  required: ['recipientId', 'text'],
};

export default defineLogicFunction({
  universalIdentifier: SEND_INSTAGRAM_TEXT_MESSAGE_UNIVERSAL_IDENTIFIER,
  name: 'myah-send-instagram-text-message',
  description:
    'Send a text DM through Composio to an existing Instagram conversation. Cannot initiate first contact and should only be used after a creator reply provides a real recipient IGSID.',
  timeoutSeconds: 30,
  handler: sendInstagramTextMessageHandler,
  toolTriggerSettings: {
    inputSchema: sendInstagramTextMessageInputSchema,
  },
  workflowActionTriggerSettings: {
    label: 'Send Instagram Text Message',
    icon: 'IconBrandInstagram',
    inputSchema: jsonSchemaToInputSchema(sendInstagramTextMessageInputSchema),
    outputSchema: [
      {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          error: { type: 'string' },
          errorCode: { type: 'number' },
          errorSubcode: { type: 'number' },
          retryable: { type: 'boolean' },
          data: { type: 'object' },
        },
      },
    ],
  },
});
