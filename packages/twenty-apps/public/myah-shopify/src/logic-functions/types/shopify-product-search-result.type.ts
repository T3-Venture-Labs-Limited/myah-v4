import { type ShopifyStoreContextResult } from 'src/logic-functions/types/shopify-store-context-result.type';

export type ShopifyProductSearchResult = Pick<
  ShopifyStoreContextResult,
  'success' | 'connected' | 'error' | 'products' | 'scopes'
> & {
  query?: string;
};
