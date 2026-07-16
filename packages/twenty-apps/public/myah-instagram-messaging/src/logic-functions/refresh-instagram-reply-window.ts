import { defineLogicFunction } from 'twenty-sdk/define';
import { type InputJsonSchema } from 'twenty-sdk/logic-function';

import { REFRESH_INSTAGRAM_REPLY_WINDOW_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';
import { refreshInstagramReplyWindowHandler } from 'src/logic-functions/handlers/refresh-instagram-reply-window-handler';
import { jsonSchemaToInputSchema } from 'src/logic-functions/utils/json-schema-to-input-schema';

const refreshInstagramReplyWindowInputSchema: InputJsonSchema = {
  type: 'object',
  properties: {
    conversationRecordId: {
      type: 'string',
      description:
        'UUID of the existing Myah social conversation record whose reply deadline should be refreshed.',
    },
    connectedAccountId: {
      type: 'string',
      description:
        'Composio connected account id for the Instagram Business or Creator account. Required in deployed environments; optional only when MYAH_COMPOSIO_CONNECTED_ACCOUNT_ID is configured for local or test smoke runs.',
    },
  },
  required: ['conversationRecordId'],
};

export default defineLogicFunction({
  universalIdentifier: REFRESH_INSTAGRAM_REPLY_WINDOW_UNIVERSAL_IDENTIFIER,
  name: 'myah-refresh-instagram-reply-window',
  description:
    'Refresh the exact 24-hour Instagram reply deadline for one existing conversation. Reads messages only and never sends a reply.',
  timeoutSeconds: 30,
  handler: refreshInstagramReplyWindowHandler,
  toolTriggerSettings: {
    inputSchema: refreshInstagramReplyWindowInputSchema,
  },
  workflowActionTriggerSettings: {
    label: 'Refresh Instagram Reply Window',
    icon: 'IconBrandInstagram',
    inputSchema: jsonSchemaToInputSchema(refreshInstagramReplyWindowInputSchema),
    outputSchema: [
      {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          updated: { type: 'boolean' },
          reason: { type: 'string' },
          error: { type: 'string' },
          lastInboundAt: { type: 'string' },
          replyWindowEndsAt: { type: 'string' },
          isReplyWindowOpen: { type: 'boolean' },
        },
      },
    ],
  },
});
