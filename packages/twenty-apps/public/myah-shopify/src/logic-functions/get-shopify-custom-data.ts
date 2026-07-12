import { defineLogicFunction } from 'twenty-sdk/define';

import { GET_SHOPIFY_CUSTOM_DATA_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';
import { getShopifyCustomDataHandler } from 'src/logic-functions/handlers/get-shopify-custom-data-handler';

export default defineLogicFunction({
	universalIdentifier: GET_SHOPIFY_CUSTOM_DATA_UNIVERSAL_IDENTIFIER,
	name: 'get-shopify-custom-data',
	description:
		'Read Shopify metaobject definitions and custom structured data context.',
	timeoutSeconds: 30,
	handler: getShopifyCustomDataHandler,
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
