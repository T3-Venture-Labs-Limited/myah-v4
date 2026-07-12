import { defineLogicFunction } from 'twenty-sdk/define';

import { GET_SHOPIFY_BRAND_CONTENT_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';
import { getShopifyBrandContentHandler } from 'src/logic-functions/handlers/get-shopify-brand-content-handler';

export default defineLogicFunction({
	universalIdentifier: GET_SHOPIFY_BRAND_CONTENT_UNIVERSAL_IDENTIFIER,
	name: 'get-shopify-brand-content',
	description:
		'Read Shopify brand/store content such as pages, blogs/articles, and locales.',
	timeoutSeconds: 30,
	handler: getShopifyBrandContentHandler,
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
