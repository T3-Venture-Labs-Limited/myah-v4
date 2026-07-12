import { type ShopifyAgentReadResult } from 'src/logic-functions/types/shopify-agent-read-result.type';
import { type ShopifyFirstInput } from 'src/logic-functions/types/shopify-first-input.type';
import { callMyahShopifyAgentRoute } from 'src/logic-functions/utils/call-myah-shopify-agent-route.util';
const normalizeFirst = (first: number | undefined) =>
  Math.min(Math.max(Number.isFinite(first) ? (first ?? 10) : 10, 1), 25);

export const getShopifyCustomDataHandler = async (
  input: ShopifyFirstInput,
): Promise<ShopifyAgentReadResult> =>
  await callMyahShopifyAgentRoute({
    params: {
      first: normalizeFirst(input.first),
    },
    routePath: '/rest/myah/shopify/agent/custom-data',
    toolLabel: 'Myah Shopify custom data',
  });
