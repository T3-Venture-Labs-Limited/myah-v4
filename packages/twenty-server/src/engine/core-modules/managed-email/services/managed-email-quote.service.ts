import { createHash, randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { MANAGED_EMAIL_PRODUCT_KEYS } from 'src/engine/core-modules/managed-email/constants/managed-email-catalog.constant';
import {
  type ManagedEmailCatalog,
  type ManagedEmailCatalogProduct,
  type ManagedEmailProductKey,
} from 'src/engine/core-modules/managed-email/types/managed-email-catalog.type';
import {
  type ManagedEmailMetronomeProducts,
  type ManagedEmailQuote,
  type ManagedEmailQuoteLine,
} from 'src/engine/core-modules/managed-email/types/managed-email-quote.type';
import { type ManagedEmailProposal } from 'src/engine/core-modules/managed-email/types/managed-email-proposal.type';
import { type ManagedEmailResourceSnapshot } from 'src/engine/core-modules/managed-email/types/managed-email-persistence.type';
import {
  minimumCustomerPriceMinorUnits,
  validateManagedEmailCatalog,
} from 'src/engine/core-modules/managed-email/utils/validate-managed-email-catalog.util';

export const MANAGED_EMAIL_QUOTE_ID_FACTORY = Symbol(
  'MANAGED_EMAIL_QUOTE_ID_FACTORY',
);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const hash = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

const addPeriod = (startingAt: Date, frequency: 'MONTHLY' | 'ANNUAL'): Date => {
  const endingBefore = new Date(startingAt);

  if (frequency === 'MONTHLY') {
    endingBefore.setUTCMonth(endingBefore.getUTCMonth() + 1);
  } else {
    endingBefore.setUTCFullYear(endingBefore.getUTCFullYear() + 1);
  }

  return endingBefore;
};

@Injectable()
export class ManagedEmailQuoteService {
  constructor(
    @Inject(MANAGED_EMAIL_QUOTE_ID_FACTORY)
    private readonly idFactory: () => string = randomUUID,
  ) {}

  createQuote({
    catalog: inputCatalog,
    metronomeProducts,
    metronomeRateCardAlias,
    metronomeRateCardId,
    now,
    proposal,
  }: {
    catalog: ManagedEmailCatalog;
    metronomeProducts: ManagedEmailMetronomeProducts;
    metronomeRateCardAlias: string;
    metronomeRateCardId: string;
    now: Date;
    proposal: ManagedEmailProposal;
  }): ManagedEmailQuote {
    if (now.getTime() >= proposal.expiresAt.getTime()) {
      throw new Error('Managed email proposal has expired');
    }

    const catalog = validateManagedEmailCatalog(inputCatalog);
    this.validateMetronomeCatalog(
      metronomeProducts,
      metronomeRateCardAlias,
      metronomeRateCardId,
    );

    if (proposal.domains.length === 0) {
      throw new Error('Managed email proposal contains no domains');
    }

    const products = new Map(
      catalog.products.map((product) => [product.key, product]),
    );
    const domainProduct = this.getProduct(
      products,
      MANAGED_EMAIL_PRODUCT_KEYS.SENDING_DOMAIN_YEAR,
    );
    const domainProviderQuotes = proposal.domains.map(
      ({ providerQuote }) => providerQuote,
    );

    if (
      domainProviderQuotes.some(
        (providerQuote) =>
          !Number.isSafeInteger(providerQuote.amountMinorUnits) ||
          providerQuote.amountMinorUnits <= 0 ||
          providerQuote.currency !== 'USD' ||
          providerQuote.termCount !== 1 ||
          providerQuote.termUnit !== 'YEAR',
      )
    ) {
      throw new Error('Managed email domain provider quote is invalid');
    }

    let domainProviderCost: number | undefined;

    if (domainProduct.customerPrice.kind === 'PROVIDER_QUOTE_MARGIN') {
      const domainQuoteAmounts = new Set(
        domainProviderQuotes.map(({ amountMinorUnits }) => amountMinorUnits),
      );

      if (domainQuoteAmounts.size !== 1) {
        throw new Error(
          'Managed email domain quotes cannot be represented exactly',
        );
      }

      [domainProviderCost] = domainQuoteAmounts;
    } else if (
      domainProduct.customerPrice.kind === 'FIXED_PROVIDER_QUOTE_CEILING'
    ) {
      const maximumProviderQuoteMinorUnits =
        domainProduct.customerPrice.maximumProviderQuoteMinorUnits;

      if (
        domainProviderQuotes.some(
          ({ amountMinorUnits }) =>
            amountMinorUnits > maximumProviderQuoteMinorUnits,
        )
      ) {
        throw new Error(
          'Managed email domain provider quote exceeds approved ceiling',
        );
      }
    } else {
      throw new Error('Managed email catalog is invalid');
    }
    const mailboxProduct = this.getProduct(
      products,
      MANAGED_EMAIL_PRODUCT_KEYS.MAILBOX_MONTH,
    );
    const prewarmedMailboxCosts = proposal.domains.flatMap(
      ({ prewarmedProviderCosts }) =>
        prewarmedProviderCosts === undefined
          ? []
          : [prewarmedProviderCosts.mailboxPriceCents],
    );
    const fixedMailboxProviderCost =
      mailboxProduct.providerCost.kind === 'FIXED' &&
      mailboxProduct.providerCost.currency === 'USD'
        ? mailboxProduct.providerCost.amountMinorUnits
        : null;

    if (
      prewarmedMailboxCosts.length > 0 &&
      (prewarmedMailboxCosts.length !== proposal.domains.length ||
        fixedMailboxProviderCost === null ||
        prewarmedMailboxCosts.some((cost) => cost > fixedMailboxProviderCost))
    ) {
      throw new Error('Managed email prewarmed mailbox cost is not covered');
    }
    const startingAt = new Date(now);
    const lines = [
      this.createLine({
        billingFrequency: 'ANNUAL',
        metronomeProductId:
          metronomeProducts[MANAGED_EMAIL_PRODUCT_KEYS.SENDING_DOMAIN_YEAR],
        product: domainProduct,
        providerQuoteCost: domainProviderCost,
        quantity: proposal.domains.length,
        startingAt,
      }),
      this.createLine({
        billingFrequency: 'MONTHLY',
        metronomeProductId:
          metronomeProducts[MANAGED_EMAIL_PRODUCT_KEYS.MAILBOX_MONTH],
        product: mailboxProduct,
        quantity: proposal.mailboxCount,
        startingAt,
      }),
      this.createLine({
        billingFrequency: 'MONTHLY',
        metronomeProductId:
          metronomeProducts[MANAGED_EMAIL_PRODUCT_KEYS.WARMUP_MONTH],
        product: this.getProduct(
          products,
          MANAGED_EMAIL_PRODUCT_KEYS.WARMUP_MONTH,
        ),
        quantity: proposal.mailboxCount,
        startingAt,
      }),
    ];
    const dueTodayCents = lines.reduce(
      (total, line) => total + line.amountCents,
      0,
    );

    if (!Number.isSafeInteger(dueTodayCents) || dueTodayCents <= 0) {
      throw new Error('Managed email quote total is invalid');
    }

    const resourceSnapshot = this.createResourceSnapshot(proposal);
    const proposalHash = hash(resourceSnapshot);
    const quoteFacts = {
      catalogVersion: catalog.version,
      currency: 'USD' as const,
      dueTodayCents,
      expiresAt: proposal.expiresAt.toISOString(),
      lines,
      metronomeRateCardAlias,
      metronomeRateCardId,
      proposalHash,
      workspaceId: proposal.workspaceId,
    };

    return Object.freeze({
      ...quoteFacts,
      disclosures: proposal.disclosures,
      expiresAt: new Date(proposal.expiresAt),
      id: this.idFactory(),
      lines: Object.freeze(lines),
      quoteHash: hash(quoteFacts),
      resourceSnapshot,
    });
  }

  private createLine({
    billingFrequency,
    metronomeProductId,
    product,
    providerQuoteCost,
    quantity,
    startingAt,
  }: {
    billingFrequency: 'MONTHLY' | 'ANNUAL';
    metronomeProductId: string;
    product: ManagedEmailCatalogProduct;
    providerQuoteCost?: number;
    quantity: number;
    startingAt: Date;
  }): ManagedEmailQuoteLine {
    const unitPriceCents =
      product.customerPrice.kind === 'PROVIDER_QUOTE_MARGIN'
        ? minimumCustomerPriceMinorUnits({
            landedProviderCostMinorUnits: providerQuoteCost ?? 0,
            maximumFixedFeeMinorUnits:
              product.customerPrice.paymentProcessing.maximumFixedFeeMinorUnits,
            maximumVariableFeeBasisPoints:
              product.customerPrice.paymentProcessing
                .maximumVariableFeeBasisPoints,
          })
        : product.customerPrice.amountMinorUnits;
    const amountCents = unitPriceCents * quantity;

    if (
      !Number.isSafeInteger(quantity) ||
      quantity <= 0 ||
      !Number.isSafeInteger(amountCents) ||
      amountCents <= 0
    ) {
      throw new Error('Managed email quote line is invalid');
    }

    return Object.freeze({
      amountCents,
      billingFrequency,
      endingBefore: addPeriod(startingAt, billingFrequency).toISOString(),
      metronomeProductId,
      productKey: product.key,
      productTag: product.metronomeProductTag,
      quantity,
      startingAt: startingAt.toISOString(),
      unitPriceCents,
    });
  }

  private createResourceSnapshot(
    proposal: ManagedEmailProposal,
  ): ManagedEmailResourceSnapshot {
    const domains = proposal.domains.map((domain) => {
      const hasInventoryIdentity = domain.providerInventoryId !== undefined;
      const hasPrewarmedCosts = domain.prewarmedProviderCosts !== undefined;

      if (hasInventoryIdentity !== hasPrewarmedCosts) {
        throw new Error('Managed email prewarmed proposal is invalid');
      }
      return Object.freeze({
        domain: domain.domain,
        ...(domain.providerInventoryId === undefined ||
        domain.prewarmedProviderCosts === undefined
          ? {}
          : {
              prewarmedProviderCosts: Object.freeze({
                domainPriceCents:
                  domain.prewarmedProviderCosts.domainPriceCents,
                mailboxPriceCents:
                  domain.prewarmedProviderCosts.mailboxPriceCents,
              }),
              providerInventoryId: domain.providerInventoryId,
            }),
        mailboxes: Object.freeze(
          domain.mailboxes.map(({ address }) => address),
        ),
        providerQuote: Object.freeze({ ...domain.providerQuote }),
      });
    });
    const personas = proposal.domains.flatMap(({ mailboxes }) =>
      mailboxes.map((persona) => Object.freeze({ ...persona })),
    );

    return Object.freeze({
      domains: Object.freeze(domains),
      personas: Object.freeze(personas),
      proposal: Object.freeze({
        createdAt: proposal.createdAt.toISOString(),
        expiresAt: proposal.expiresAt.toISOString(),
        policyVersion: proposal.policyVersion,
      }),
    });
  }

  private getProduct(
    products: Map<ManagedEmailProductKey, ManagedEmailCatalogProduct>,
    key: ManagedEmailProductKey,
  ): ManagedEmailCatalogProduct {
    const product = products.get(key);

    if (product === undefined) {
      throw new Error('Managed email catalog is invalid');
    }

    return product;
  }

  private validateMetronomeCatalog(
    metronomeProducts: ManagedEmailMetronomeProducts,
    rateCardAlias: string,
    rateCardId: string,
  ): void {
    const ids = Object.values(metronomeProducts);

    if (
      !rateCardAlias.trim() ||
      !UUID_PATTERN.test(rateCardId) ||
      ids.length !== 3 ||
      ids.some((id) => !UUID_PATTERN.test(id)) ||
      new Set(ids).size !== ids.length
    ) {
      throw new Error('Managed email Metronome catalog is invalid');
    }
  }
}
