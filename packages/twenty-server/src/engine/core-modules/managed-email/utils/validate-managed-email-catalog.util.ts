import { MANAGED_EMAIL_PRODUCT_DEFINITIONS } from 'src/engine/core-modules/managed-email/constants/managed-email-catalog.constant';
import {
  type ManagedEmailCatalog,
  type ManagedEmailCatalogProduct,
  type ManagedEmailProductDefinition,
} from 'src/engine/core-modules/managed-email/types/managed-email-catalog.type';

const INVALID_CATALOG_ERROR = 'Managed email catalog is invalid';

export const minimumCustomerPriceMinorUnits = (
  providerCostMinorUnits: number,
): number => {
  if (
    !Number.isSafeInteger(providerCostMinorUnits) ||
    providerCostMinorUnits <= 0
  ) {
    throw new Error(INVALID_CATALOG_ERROR);
  }

  const result =
    (BigInt(providerCostMinorUnits) * BigInt(10) + BigInt(6)) / BigInt(7);

  if (result > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(INVALID_CATALOG_ERROR);
  }

  return Number(result);
};

const hasApprovedProviderCost = (
  product: ManagedEmailCatalogProduct,
  definition: ManagedEmailProductDefinition,
): boolean => {
  const { providerCost } = product;
  const approvedProviderCost = definition.providerCost;

  if (
    providerCost.kind === 'PROVIDER_QUOTE' ||
    approvedProviderCost.kind === 'PROVIDER_QUOTE'
  ) {
    return (
      providerCost.kind === 'PROVIDER_QUOTE' &&
      approvedProviderCost.kind === 'PROVIDER_QUOTE' &&
      providerCost.currency === approvedProviderCost.currency &&
      providerCost.termCount === approvedProviderCost.termCount &&
      providerCost.termUnit === approvedProviderCost.termUnit
    );
  }

  return (
    providerCost.kind === 'FIXED' &&
    approvedProviderCost.kind === 'FIXED' &&
    Number.isSafeInteger(providerCost.amountMinorUnits) &&
    providerCost.amountMinorUnits === approvedProviderCost.amountMinorUnits &&
    providerCost.currency === approvedProviderCost.currency &&
    providerCost.source === approvedProviderCost.source &&
    providerCost.verifiedAt === approvedProviderCost.verifiedAt &&
    /^\d{4}-\d{2}-\d{2}$/.test(providerCost.verifiedAt) &&
    Number.isFinite(Date.parse(`${providerCost.verifiedAt}T00:00:00.000Z`))
  );
};

const hasValidCustomerPrice = (
  product: ManagedEmailCatalogProduct,
): boolean => {
  const { providerCost, customerPrice } = product;

  if (providerCost.kind === 'PROVIDER_QUOTE') {
    return (
      customerPrice.kind === 'PROVIDER_QUOTE_MARGIN' &&
      customerPrice.currency === providerCost.currency &&
      customerPrice.minimumGrossMarginBasisPoints === 3000
    );
  }

  return (
    customerPrice.kind === 'FIXED' &&
    customerPrice.currency === providerCost.currency &&
    Number.isSafeInteger(customerPrice.amountMinorUnits) &&
    customerPrice.amountMinorUnits > 0 &&
    Number.isSafeInteger(customerPrice.maximumLandedProviderCostMinorUnits) &&
    customerPrice.maximumLandedProviderCostMinorUnits >=
      providerCost.amountMinorUnits &&
    customerPrice.amountMinorUnits >=
      minimumCustomerPriceMinorUnits(
        customerPrice.maximumLandedProviderCostMinorUnits,
      )
  );
};

export const validateManagedEmailCatalog = (
  catalog: ManagedEmailCatalog,
): ManagedEmailCatalog => {
  if (
    !catalog ||
    typeof catalog.version !== 'string' ||
    catalog.version.trim() === '' ||
    !Array.isArray(catalog.products) ||
    catalog.products.length !== MANAGED_EMAIL_PRODUCT_DEFINITIONS.length
  ) {
    throw new Error(INVALID_CATALOG_ERROR);
  }

  const keys = new Set<string>();
  const productTags = new Set<string>();
  const expected = new Map(
    MANAGED_EMAIL_PRODUCT_DEFINITIONS.map((definition) => [
      definition.key,
      definition,
    ]),
  );

  for (const product of catalog.products) {
    if (
      !product ||
      keys.has(product.key) ||
      productTags.has(product.metronomeProductTag)
    ) {
      throw new Error(INVALID_CATALOG_ERROR);
    }

    keys.add(product.key);
    productTags.add(product.metronomeProductTag);

    const definition = expected.get(product.key);

    if (
      !definition ||
      definition.metronomeProductTag !== product.metronomeProductTag ||
      definition.cadence !== product.cadence ||
      !hasApprovedProviderCost(product, definition) ||
      !hasValidCustomerPrice(product)
    ) {
      throw new Error(INVALID_CATALOG_ERROR);
    }
  }

  const products: ManagedEmailCatalogProduct[] = catalog.products.map(
    (product) =>
      Object.freeze({
        ...product,
        providerCost: Object.freeze({ ...product.providerCost }),
        customerPrice: Object.freeze({ ...product.customerPrice }),
      }),
  );

  return Object.freeze({
    version: catalog.version,
    products: Object.freeze(products),
  });
};
