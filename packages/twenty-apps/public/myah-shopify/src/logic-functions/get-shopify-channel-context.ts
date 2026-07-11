import { defineLogicFunction } from 'twenty-sdk/define';

import { GET_SHOPIFY_CHANNEL_CONTEXT_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';
import { getShopifyChannelContextHandler } from 'src/logic-functions/handlers/get-shopify-channel-context-handler';

export default defineLogicFunction({
	universalIdentifier: GET_SHOPIFY_CHANNEL_CONTEXT_UNIVERSAL_IDENTIFIER,
	name: 'get-shopify-channel-context',
	description:
		'Read Shopify sales channel and product listing context.',
	timeoutSeconds: 30,
	handler: getShopifyChannelContextHandler,
	toolTriggerSettings: {
		inputSchema: {
				type: 'object',
				properties: {
					first: {
						type: 'integer',
						minimum: 1,
						maximum: 25,
						description: 'Number of records to return. Defaults to 10 and is capped at 25.'
					}
				}
			}
	}
});
