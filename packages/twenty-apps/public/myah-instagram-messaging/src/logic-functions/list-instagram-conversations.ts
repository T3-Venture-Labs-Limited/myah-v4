import { defineLogicFunction } from 'twenty-sdk/define';
import { type InputJsonSchema } from 'twenty-sdk/logic-function';

import { LIST_INSTAGRAM_CONVERSATIONS_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';
import { listInstagramConversationsHandler } from 'src/logic-functions/handlers/list-instagram-conversations-handler';
import { jsonSchemaToInputSchema } from 'src/logic-functions/utils/json-schema-to-input-schema';

const listInstagramConversationsInputSchema: InputJsonSchema = {
  type: 'object',
  properties: {
    connectedAccountId: {
      type: 'string',
      description:
        'Optional Composio connected account id for the Instagram Business or Creator account. Falls back to MYAH_COMPOSIO_CONNECTED_ACCOUNT_ID when omitted.',
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 25,
      description:
        'Maximum conversations to fetch. Capped to 25 for cost control.',
    },
    after: {
      type: 'string',
      description:
        'Pagination cursor from paging.cursors.after. Do not pass a paging.next URL.',
    },
    igUserId: {
      type: 'string',
      description: 'Optional Instagram Business Account ID.',
    },
    graphApiVersion: {
      type: 'string',
      description:
        'Optional Instagram Graph API version, defaults upstream to v21.0.',
    },
  },
  required: [],
};

export default defineLogicFunction({
  universalIdentifier: LIST_INSTAGRAM_CONVERSATIONS_UNIVERSAL_IDENTIFIER,
  name: 'myah-list-instagram-conversations',
  description:
    'Manually list recent Instagram DM conversations through Composio. Polling is disabled; use this only while testing messaging capabilities.',
  timeoutSeconds: 30,
  handler: listInstagramConversationsHandler,
  toolTriggerSettings: {
    inputSchema: listInstagramConversationsInputSchema,
  },
  workflowActionTriggerSettings: {
    label: 'List Instagram Conversations',
    icon: 'IconBrandInstagram',
    inputSchema: jsonSchemaToInputSchema(listInstagramConversationsInputSchema),
    outputSchema: [
      {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          error: { type: 'string' },
          conversations: { type: 'array', items: { type: 'object' } },
          paging: { type: 'object' },
        },
      },
    ],
  },
});
