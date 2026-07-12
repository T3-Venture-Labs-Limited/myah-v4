import { defineLogicFunction } from 'twenty-sdk/define';

import { GET_SHOPIFY_STORE_CONTEXT_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';
import { getShopifyStoreContextHandler } from 'src/logic-functions/handlers/get-shopify-store-context-handler';

export default defineLogicFunction({
  universalIdentifier: GET_SHOPIFY_STORE_CONTEXT_UNIVERSAL_IDENTIFIER,
  name: 'get-shopify-store-context',
  description:
    'Read compact Shopify store context for the connected workspace: shop profile, recent products, and granted read-only scopes. Never writes to Shopify.',
  timeoutSeconds: 30,
  handler: getShopifyStoreContextHandler,
  toolTriggerSettings: {
    inputSchema: {
      type: 'object',
      properties: {
        productsFirst: {
          type: 'integer',
          minimum: 1,
          maximum: 25,
          description:
            'Number of recently updated Shopify products to include. Defaults to 10 and is capped at 25.',
        },
      },
    },
  },
});
