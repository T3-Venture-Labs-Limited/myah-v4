import { defineLogicFunction } from 'twenty-sdk/define';
import { type InputJsonSchema } from 'twenty-sdk/logic-function';

import { LIST_INSTAGRAM_MESSAGES_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';
import { listInstagramMessagesHandler } from 'src/logic-functions/handlers/list-instagram-messages-handler';
import { jsonSchemaToInputSchema } from 'src/logic-functions/utils/json-schema-to-input-schema';

const listInstagramMessagesInputSchema: InputJsonSchema = {
  type: 'object',
  properties: {
    connectedAccountId: {
      type: 'string',
      description:
        'Optional Composio connected account id for the Instagram Business or Creator account. Falls back to MYAH_COMPOSIO_CONNECTED_ACCOUNT_ID when omitted.',
    },
    conversationId: {
      type: 'string',
      description: 'Instagram conversation id returned by myah-list-instagram-conversations.',
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 25,
      description: 'Maximum messages to fetch. Capped to 25 for cost control.',
    },
    after: {
      type: 'string',
      description: 'Pagination cursor from paging.cursors.after. Do not pass a paging.next URL.',
    },
    graphApiVersion: {
      type: 'string',
      description: 'Optional Instagram Graph API version, defaults upstream to v21.0.',
    },
  },
  required: ['conversationId'],
};

export default defineLogicFunction({
  universalIdentifier: LIST_INSTAGRAM_MESSAGES_UNIVERSAL_IDENTIFIER,
  name: 'myah-list-instagram-messages',
  description:
    'Manually fetch messages for one Instagram DM conversation through Composio. This does not enable background reply polling.',
  timeoutSeconds: 30,
  handler: listInstagramMessagesHandler,
  toolTriggerSettings: {
    inputSchema: listInstagramMessagesInputSchema,
  },
  workflowActionTriggerSettings: {
    label: 'List Instagram Messages',
    icon: 'IconBrandInstagram',
    inputSchema: jsonSchemaToInputSchema(listInstagramMessagesInputSchema),
    outputSchema: [
      {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          error: { type: 'string' },
          messages: { type: 'array', items: { type: 'object' } },
          paging: { type: 'object' },
        },
      },
    ],
  },
});
