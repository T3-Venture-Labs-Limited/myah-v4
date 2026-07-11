import { defineLogicFunction } from 'twenty-sdk/define';

import { GET_SHOPIFY_CUSTOMER_SUMMARY_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';
import { getShopifyCustomerSummaryHandler } from 'src/logic-functions/handlers/get-shopify-customer-summary-handler';

export default defineLogicFunction({
	universalIdentifier: GET_SHOPIFY_CUSTOMER_SUMMARY_UNIVERSAL_IDENTIFIER,
	name: 'get-shopify-customer-summary',
	description:
		'Read privacy-conscious Shopify customer summary data without raw token exposure.',
	timeoutSeconds: 30,
	handler: getShopifyCustomerSummaryHandler,
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
