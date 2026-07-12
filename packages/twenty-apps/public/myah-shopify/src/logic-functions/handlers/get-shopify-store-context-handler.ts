import { type GetShopifyStoreContextInput } from 'src/logic-functions/types/get-shopify-store-context-input.type';
import { type ShopifyStoreContextResult } from 'src/logic-functions/types/shopify-store-context-result.type';
import { callMyahShopifyStoreContext } from 'src/logic-functions/utils/call-myah-shopify-store-context.util';
import { normalizeProductsFirst } from 'src/logic-functions/utils/normalize-products-first.util';

export const getShopifyStoreContextHandler = async (
  input: GetShopifyStoreContextInput,
): Promise<ShopifyStoreContextResult> => {
  const productsFirst = normalizeProductsFirst(input);

  return await callMyahShopifyStoreContext({ productsFirst });
};
