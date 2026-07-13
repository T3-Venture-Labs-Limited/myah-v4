import { defineLogicFunction } from 'twenty-sdk/define';

import { CONNECT_INSTAGRAM_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';
import { connectInstagramHandler } from 'src/logic-functions/handlers/connect-instagram-handler';

export default defineLogicFunction({
  universalIdentifier: CONNECT_INSTAGRAM_UNIVERSAL_IDENTIFIER,
  name: 'myah-connect-instagram',
  description:
    'Creates a workspace-scoped Composio authorization link for an Instagram Business or Creator account.',
  timeoutSeconds: 30,
  handler: connectInstagramHandler,
  workflowActionTriggerSettings: {
    label: 'Connect Instagram',
    icon: 'IconBrandInstagram',
    inputSchema: [],
    outputSchema: [
      {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          connectedAccountId: { type: 'string' },
          authorizationUrl: { type: 'string' },
          error: { type: 'string' },
        },
      },
    ],
  },
});
