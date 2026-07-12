import { type ShopifyAgentReadResult } from 'src/logic-functions/types/shopify-agent-read-result.type';
import { type GetShopifyProductDetailInput } from 'src/logic-functions/types/get-shopify-product-detail-input.type';
import { callMyahShopifyAgentRoute } from 'src/logic-functions/utils/call-myah-shopify-agent-route.util';
export const getShopifyProductDetailHandler = async (
  input: GetShopifyProductDetailInput,
): Promise<ShopifyAgentReadResult> =>
  await callMyahShopifyAgentRoute({
    params: {
      handle: input.handle?.trim() || undefined,
      productId: input.productId?.trim() || undefined,
    },
    routePath: '/rest/myah/shopify/agent/product-detail',
    toolLabel: 'Myah Shopify product detail',
  });
