import { type GetShopifyStoreContextInput } from 'src/logic-functions/types/get-shopify-store-context-input.type';

const DEFAULT_PRODUCTS_FIRST = 10;
const MAX_PRODUCTS_FIRST = 25;

export const normalizeProductsFirst = ({
  productsFirst,
}: GetShopifyStoreContextInput): number => {
  if (typeof productsFirst !== 'number' || !Number.isFinite(productsFirst)) {
    return DEFAULT_PRODUCTS_FIRST;
  }

  return Math.min(Math.max(Math.trunc(productsFirst), 1), MAX_PRODUCTS_FIRST);
};
