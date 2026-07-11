import { defineLogicFunction } from 'twenty-sdk/define';

import { SEARCH_SHOPIFY_PRODUCTS_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';
import { searchShopifyProductsHandler } from 'src/logic-functions/handlers/search-shopify-products-handler';

export default defineLogicFunction({
	universalIdentifier: SEARCH_SHOPIFY_PRODUCTS_UNIVERSAL_IDENTIFIER,
	name: 'search-shopify-products',
	description:
		'Search or list Shopify products for the connected workspace using read-only Shopify access. Returns compact product summaries and never writes to Shopify.',
	timeoutSeconds: 30,
	handler: searchShopifyProductsHandler,
	toolTriggerSettings: {
		inputSchema: {
			type: 'object',
			properties: {
				query: {
					type: 'string',
					description:
						'Optional Shopify product search text. Use product names, handles, vendors, types, or tags. Omit to list recently updated products.'
				},
				productsFirst: {
					type: 'integer',
					minimum: 1,
					maximum: 25,
					description:
						'Number of matching Shopify products to return. Defaults to 10 and is capped at 25.'
				}
			}
		}
	}
});
