import { MANAGED_EMAIL_PRODUCT_DEFINITIONS } from 'src/engine/core-modules/managed-email/constants/managed-email-catalog.constant';
import {
  type ManagedEmailCatalog,
  type ManagedEmailCatalogProduct,
  type ManagedEmailProductDefinition,
} from 'src/engine/core-modules/managed-email/types/managed-email-catalog.type';

const INVALID_CATALOG_ERROR = 'Managed email catalog is invalid';
const BASIS_POINTS = 10_000;
const MINIMUM_GROSS_MARGIN_BASIS_POINTS = 3000;

const isValidIsoDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
};

export const minimumCustomerPriceMinorUnits = ({
  landedProviderCostMinorUnits,
  maximumVariableFeeBasisPoints,
  maximumFixedFeeMinorUnits,
}: {
  landedProviderCostMinorUnits: number;
  maximumVariableFeeBasisPoints: number;
  maximumFixedFeeMinorUnits: number;
}): number => {
  if (
    !Number.isSafeInteger(landedProviderCostMinorUnits) ||
    landedProviderCostMinorUnits <= 0 ||
    !Number.isSafeInteger(maximumVariableFeeBasisPoints) ||
    maximumVariableFeeBasisPoints < 0 ||
    maximumVariableFeeBasisPoints >=
      BASIS_POINTS - MINIMUM_GROSS_MARGIN_BASIS_POINTS ||
    !Number.isSafeInteger(maximumFixedFeeMinorUnits) ||
    maximumFixedFeeMinorUnits < 0
  ) {
    throw new Error(INVALID_CATALOG_ERROR);
  }

  const basisPoints = BigInt(BASIS_POINTS);
  const variableFeeBasisPoints = BigInt(maximumVariableFeeBasisPoints);
  const fixedFeeMinorUnits = BigInt(maximumFixedFeeMinorUnits);
  const totalFixedCostMinorUnits =
    BigInt(landedProviderCostMinorUnits) + fixedFeeMinorUnits;
  const availableBasisPoints = BigInt(
    BASIS_POINTS -
      MINIMUM_GROSS_MARGIN_BASIS_POINTS -
      maximumVariableFeeBasisPoints,
  );
  let priceMinorUnits =
    (totalFixedCostMinorUnits * basisPoints +
      availableBasisPoints -
      BigInt(1)) /
    availableBasisPoints;

  while (priceMinorUnits <= BigInt(Number.MAX_SAFE_INTEGER)) {
    const variableFeeMinorUnits =
      (priceMinorUnits * variableFeeBasisPoints + basisPoints - BigInt(1)) /
      basisPoints;
    const marginMinorUnits =
      priceMinorUnits -
      BigInt(landedProviderCostMinorUnits) -
      fixedFeeMinorUnits -
      variableFeeMinorUnits;

    if (
      marginMinorUnits * basisPoints >=
      priceMinorUnits * BigInt(MINIMUM_GROSS_MARGIN_BASIS_POINTS)
    ) {
      return Number(priceMinorUnits);
    }

    priceMinorUnits += BigInt(1);
  }

  throw new Error(INVALID_CATALOG_ERROR);
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
    isValidIsoDate(providerCost.verifiedAt)
  );
};

const hasValidEvidence = (source: string, verifiedAt: string): boolean =>
  typeof source === 'string' &&
  source.trim() !== '' &&
  isValidIsoDate(verifiedAt);

const hasValidPaymentProcessing = (
  customerPrice: ManagedEmailCatalogProduct['customerPrice'],
): boolean => {
  const paymentProcessing = customerPrice.paymentProcessing;

  return (
    paymentProcessing.currency === 'USD' &&
    Number.isSafeInteger(paymentProcessing.maximumVariableFeeBasisPoints) &&
    paymentProcessing.maximumVariableFeeBasisPoints >= 0 &&
    paymentProcessing.maximumVariableFeeBasisPoints <
      BASIS_POINTS - MINIMUM_GROSS_MARGIN_BASIS_POINTS &&
    Number.isSafeInteger(paymentProcessing.maximumFixedFeeMinorUnits) &&
    paymentProcessing.maximumFixedFeeMinorUnits >= 0 &&
    hasValidEvidence(paymentProcessing.source, paymentProcessing.verifiedAt)
  );
};

const hasValidLandedProviderCost = (
  product: ManagedEmailCatalogProduct,
): boolean => {
  if (
    product.providerCost.kind !== 'FIXED' ||
    product.customerPrice.kind !== 'FIXED'
  ) {
    return false;
  }

  const landedProviderCost = product.customerPrice.landedProviderCost;

  if (
    landedProviderCost.currency !== 'USD' ||
    !Number.isSafeInteger(landedProviderCost.amountMinorUnits) ||
    landedProviderCost.amountMinorUnits <= 0
  ) {
    return false;
  }

  if (landedProviderCost.kind === 'SAME_CURRENCY') {
    return (
      product.providerCost.currency === 'USD' &&
      landedProviderCost.amountMinorUnits >=
        product.providerCost.amountMinorUnits &&
      hasValidEvidence(landedProviderCost.source, landedProviderCost.verifiedAt)
    );
  }

  return (
    landedProviderCost.kind === 'FX_CEILING' &&
    product.providerCost.currency !== 'USD' &&
    landedProviderCost.sourceCurrency === product.providerCost.currency &&
    Number.isSafeInteger(landedProviderCost.safetyBufferBasisPoints) &&
    landedProviderCost.safetyBufferBasisPoints >= 0 &&
    landedProviderCost.safetyBufferBasisPoints < BASIS_POINTS &&
    hasValidEvidence(
      landedProviderCost.rateSource,
      landedProviderCost.verifiedAt,
    )
  );
};
const hasValidCustomerPrice = (
  product: ManagedEmailCatalogProduct,
): boolean => {
  const { providerCost, customerPrice } = product;

  if (
    customerPrice.currency !== 'USD' ||
    customerPrice.minimumGrossMarginBasisPoints !==
      MINIMUM_GROSS_MARGIN_BASIS_POINTS ||
    !hasValidPaymentProcessing(customerPrice)
  ) {
    return false;
  }

  if (providerCost.kind === 'PROVIDER_QUOTE') {
    return (
      customerPrice.kind === 'PROVIDER_QUOTE_MARGIN' &&
      providerCost.currency === 'USD'
    );
  }

  return (
    customerPrice.kind === 'FIXED' &&
    Number.isSafeInteger(customerPrice.amountMinorUnits) &&
    customerPrice.amountMinorUnits > 0 &&
    hasValidLandedProviderCost(product) &&
    customerPrice.amountMinorUnits >=
      minimumCustomerPriceMinorUnits({
        landedProviderCostMinorUnits:
          customerPrice.landedProviderCost.amountMinorUnits,
        maximumVariableFeeBasisPoints:
          customerPrice.paymentProcessing.maximumVariableFeeBasisPoints,
        maximumFixedFeeMinorUnits:
          customerPrice.paymentProcessing.maximumFixedFeeMinorUnits,
      })
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
    (product) => {
      const customerPrice =
        product.customerPrice.kind === 'FIXED'
          ? Object.freeze({
              ...product.customerPrice,
              landedProviderCost: Object.freeze({
                ...product.customerPrice.landedProviderCost,
              }),
              paymentProcessing: Object.freeze({
                ...product.customerPrice.paymentProcessing,
              }),
            })
          : Object.freeze({
              ...product.customerPrice,
              paymentProcessing: Object.freeze({
                ...product.customerPrice.paymentProcessing,
              }),
            });

      return Object.freeze({
        ...product,
        providerCost: Object.freeze({ ...product.providerCost }),
        customerPrice,
      });
    },
  );

  return Object.freeze({
    version: catalog.version,
    products: Object.freeze(products),
  });
};
