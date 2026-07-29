import { MANAGED_EMAIL_PRODUCT_DEFINITIONS } from 'src/engine/core-modules/managed-email/constants/managed-email-catalog.constant';
import {
  type ManagedEmailCatalog,
  type ManagedEmailCatalogProduct,
} from 'src/engine/core-modules/managed-email/types/managed-email-catalog.type';

const INVALID_CATALOG_ERROR = 'Managed email catalog is invalid';

export const minimumCustomerPriceCents = (providerCostCents: number): number =>
  Math.ceil(providerCostCents / 0.7);

export const validateManagedEmailCatalog = (
  catalog: ManagedEmailCatalog,
): ManagedEmailCatalog => {
  if (
    !catalog ||
    typeof catalog.version !== 'string' ||
    catalog.version.trim() === ''
  ) {
    throw new Error(INVALID_CATALOG_ERROR);
  }
  if (
    !Array.isArray(catalog.products) ||
    catalog.products.length !== MANAGED_EMAIL_PRODUCT_DEFINITIONS.length
  ) {
    throw new Error(INVALID_CATALOG_ERROR);
  }

  const keys = new Set<string>();
  const aliases = new Set<string>();
  const expected = new Map(
    MANAGED_EMAIL_PRODUCT_DEFINITIONS.map((definition) => [
      definition.key,
      definition,
    ]),
  );

  for (const product of catalog.products) {
    if (!product || keys.has(product.key) || aliases.has(product.alias)) {
      throw new Error(INVALID_CATALOG_ERROR);
    }
    keys.add(product.key);
    aliases.add(product.alias);
    const definition = expected.get(product.key);
    if (
      !definition ||
      definition.alias !== product.alias ||
      definition.cadence !== product.cadence
    ) {
      throw new Error(INVALID_CATALOG_ERROR);
    }
    if (
      !Number.isSafeInteger(product.providerCostCents) ||
      product.providerCostCents <= 0 ||
      !Number.isSafeInteger(product.customerPriceCents) ||
      product.customerPriceCents <= 0 ||
      product.customerPriceCents <
        minimumCustomerPriceCents(product.providerCostCents)
    ) {
      throw new Error(INVALID_CATALOG_ERROR);
    }
  }

  const products: ManagedEmailCatalogProduct[] = catalog.products.map(
    (product) => Object.freeze({ ...product }),
  );
  return Object.freeze({
    version: catalog.version,
    products: Object.freeze(products),
  });
};
