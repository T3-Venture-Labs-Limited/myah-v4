import { defineLogicFunction } from 'twenty-sdk/define';

import { GET_SHOPIFY_PRODUCT_DETAIL_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';
import { getShopifyProductDetailHandler } from 'src/logic-functions/handlers/get-shopify-product-detail-handler';

export default defineLogicFunction({
	universalIdentifier: GET_SHOPIFY_PRODUCT_DETAIL_UNIVERSAL_IDENTIFIER,
	name: 'get-shopify-product-detail',
	description:
		'Fetch one Shopify product by handle or product id with prices, descriptions, variants, images, SEO, collections, and inventory context.',
	timeoutSeconds: 30,
	handler: getShopifyProductDetailHandler,
	toolTriggerSettings: {
		inputSchema: {
				type: 'object',
				properties: {
					handle: { type: 'string', description: 'Shopify product handle, for example the-complete-snowboard.' },
					productId: { type: 'string', description: 'Optional Shopify product GID. Use this instead of handle when available.' }
				}
			}
	}
});
