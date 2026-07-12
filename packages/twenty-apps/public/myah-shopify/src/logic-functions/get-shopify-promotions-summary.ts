import { defineLogicFunction } from 'twenty-sdk/define';

import { GET_SHOPIFY_PROMOTIONS_SUMMARY_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';
import { getShopifyPromotionsSummaryHandler } from 'src/logic-functions/handlers/get-shopify-promotions-summary-handler';

export default defineLogicFunction({
	universalIdentifier: GET_SHOPIFY_PROMOTIONS_SUMMARY_UNIVERSAL_IDENTIFIER,
	name: 'get-shopify-promotions-summary',
	description:
		'Read Shopify discount and price-rule promotion summaries.',
	timeoutSeconds: 30,
	handler: getShopifyPromotionsSummaryHandler,
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
