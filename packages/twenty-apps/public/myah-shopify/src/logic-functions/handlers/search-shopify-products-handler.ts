import { type SearchShopifyProductsInput } from 'src/logic-functions/types/search-shopify-products-input.type';
import { type ShopifyProductSearchResult } from 'src/logic-functions/types/shopify-product-search-result.type';
import { callMyahShopifyProducts } from 'src/logic-functions/utils/call-myah-shopify-products.util';
import { normalizeProductsFirst } from 'src/logic-functions/utils/normalize-products-first.util';

export const searchShopifyProductsHandler = async (
  input: SearchShopifyProductsInput,
): Promise<ShopifyProductSearchResult> => {
  const productsFirst = normalizeProductsFirst(input);
  const query = input.query?.trim() || undefined;

  return await callMyahShopifyProducts({ productsFirst, query });
};
