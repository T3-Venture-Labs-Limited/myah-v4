import { defineLogicFunction } from 'twenty-sdk/define';

import { GET_SHOPIFY_COMMERCE_SUMMARY_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';
import { getShopifyCommerceSummaryHandler } from 'src/logic-functions/handlers/get-shopify-commerce-summary-handler';

export default defineLogicFunction({
	universalIdentifier: GET_SHOPIFY_COMMERCE_SUMMARY_UNIVERSAL_IDENTIFIER,
	name: 'get-shopify-commerce-summary',
	description:
		'Read bounded Shopify commerce summaries for orders and draft orders.',
	timeoutSeconds: 30,
	handler: getShopifyCommerceSummaryHandler,
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
