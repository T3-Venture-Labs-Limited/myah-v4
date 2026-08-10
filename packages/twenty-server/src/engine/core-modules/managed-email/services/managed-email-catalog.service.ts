import { Inject, Injectable } from '@nestjs/common';

import {
  MANAGED_EMAIL_PRODUCT_DEFINITIONS,
  MANAGED_EMAIL_PRODUCT_KEYS,
} from '../constants/managed-email-catalog.constant';
import { type ManagedEmailCatalog } from '../types/managed-email-catalog.type';
import { type ManagedEmailMetronomeProducts } from '../types/managed-email-quote.type';
import { type ManagedEmailProposal } from '../types/managed-email-proposal.type';
import { validateManagedEmailCatalog } from '../utils/validate-managed-email-catalog.util';
import { MetronomeClientService } from '../../managed-provider-billing/services/metronome-client.service';
import { TwentyConfigService } from '../../twenty-config/twenty-config.service';
import { ManagedEmailQuoteService } from './managed-email-quote.service';

export const MANAGED_EMAIL_CATALOG_CLOCK = Symbol(
  'MANAGED_EMAIL_CATALOG_CLOCK',
);

@Injectable()
export class ManagedEmailCatalogService {
  constructor(
    private readonly twentyConfigService: TwentyConfigService,
    private readonly metronomeClientService: MetronomeClientService,
    private readonly quoteService: ManagedEmailQuoteService,
    @Inject(MANAGED_EMAIL_CATALOG_CLOCK)
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async createQuote({ proposal }: { proposal: ManagedEmailProposal }) {
    const catalog = validateManagedEmailCatalog(
      this.twentyConfigService.get(
        'MANAGED_EMAIL_CATALOG',
      ) as ManagedEmailCatalog,
    );
    const mode = this.twentyConfigService.get('MANAGED_EMAIL_EXECUTION_MODE');
    const alias = this.twentyConfigService.get(
      'MANAGED_EMAIL_METRONOME_RATE_CARD_ALIAS',
    );
    if (mode === 'SANDBOX' && !alias.startsWith('sandbox-')) {
      throw new Error(
        'Managed email sandbox requires a sandbox-prefixed rate-card alias',
      );
    }
    const now = this.clock();
    const resolved = await this.metronomeClientService.resolveRateCardProducts({
      alias,
      at: now,
      productTags: MANAGED_EMAIL_PRODUCT_DEFINITIONS.map(
        ({ metronomeProductTag }) => metronomeProductTag,
      ),
    });
    const metronomeProductsByTag = resolved.productIdsByTag;
    const productIdFor = (key: keyof typeof MANAGED_EMAIL_PRODUCT_KEYS) => {
      const productDefinition = MANAGED_EMAIL_PRODUCT_DEFINITIONS.find(
        ({ key: productKey }) => productKey === MANAGED_EMAIL_PRODUCT_KEYS[key],
      );
      if (!productDefinition) {
        throw new Error(`Missing managed email product definition for ${key}`);
      }
      const productId =
        metronomeProductsByTag[productDefinition.metronomeProductTag];
      if (typeof productId !== 'string' || productId.length === 0) {
        throw new Error(
          `Missing Metronome product for ${productDefinition.metronomeProductTag}`,
        );
      }
      return productId;
    };
    const metronomeProducts: ManagedEmailMetronomeProducts = {
      [MANAGED_EMAIL_PRODUCT_KEYS.SENDING_DOMAIN_YEAR]: productIdFor(
        'SENDING_DOMAIN_YEAR',
      ),
      [MANAGED_EMAIL_PRODUCT_KEYS.MAILBOX_MONTH]: productIdFor('MAILBOX_MONTH'),
      [MANAGED_EMAIL_PRODUCT_KEYS.WARMUP_MONTH]: productIdFor('WARMUP_MONTH'),
    };
    const quote = this.quoteService.createQuote({
      catalog,
      metronomeProducts,
      metronomeRateCardAlias: alias,
      metronomeRateCardId: resolved.rateCardId,
      now,
      proposal,
    });

    await this.metronomeClientService.assertRateCardLineItems({
      lines: quote.lines.map((line) => ({
        billingFrequency: line.billingFrequency,
        productId: line.metronomeProductId,
        startingAt: line.startingAt,
        unitPriceCents: line.unitPriceCents,
      })),
      rateCardId: quote.metronomeRateCardId,
    });

    return quote;
  }
}
