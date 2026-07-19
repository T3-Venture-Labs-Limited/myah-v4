import { Injectable } from '@nestjs/common';
import { Metronome } from '@metronome/sdk';

import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';

import {
  MetronomeClientException,
  MetronomeClientExceptionCode,
} from '../metronome-client.exception';
import { validateSafeMetronomeEventProperties } from '../utils/validate-safe-metronome-event-properties.util';

const RATE_CARD_REPLAY_PAGE_LIMIT = 100;

export type MetronomeCustomerInput = {
  alias: string;
  name: string;
};

export type MetronomeContractInput = {
  customerId: string;
  rateCardAlias: string;
  uniquenessKey: string;
};
export type MetronomeCurrentContract = {
  id: string;
  rateCardId: string | null;
  startingAt: string;
  uniquenessKey: string | null;
};

export type MetronomeRateCard = {
  aliases: Array<{
    endingBefore: string | null;
    name: string;
    startingAt: string | null;
  }>;
  id: string;
};

export type MetronomeRateCardPage = {
  hasNextPage: boolean;
  rateCards: MetronomeRateCard[];
};

export type MetronomeCustomer = {
  archivedAt: string | null;
  id: string;
  ingestAliases: string[];
};

export type MetronomePreviewLineItem = {
  name: string;
  productId: string | null;
  total: number;
  type: string;
};

export type MetronomeUsagePreview = {
  invoices: Array<{
    contractId: string | null;
    customerId: string;
    id: string;
    lineItems: MetronomePreviewLineItem[];
    total: number;
  }>;
};

export type MetronomeUsageInput = {
  customerId: string;
  eventType: string;
  properties: Record<string, boolean | number | string>;
  timestamp?: string;
};

export type MetronomeIngestUsageInput = MetronomeUsageInput & {
  timestamp: string;
  transactionId: string;
};
export type MetronomeUsageEvent = {
  customerId: string;
  eventType: string;
  isDuplicate: boolean;
  matchedBillableMetricIds: string[];
  matchedCustomerId: string | null;
  timestamp: string;
  processedAt: string | null;
  properties: Record<string, unknown>;
  transactionId: string;
};

export type MetronomeCustomerCreditInput = {
  amountCents: number;
  applicableProductIds: string[];
  contractId: string;
  customerId: string;
  endingBefore: string;
  name: string;
  productId: string;
  startingAt: string;
  uniquenessKey: string;
  customFields?: Record<string, string>;
};

@Injectable()
export class MetronomeClientService {
  private client: Metronome | undefined;

  constructor(private readonly twentyConfigService: TwentyConfigService) {}

  async findCustomerByIngestAlias(alias: string): Promise<MetronomeCustomer[]> {
    const client = this.getClient();
    const response = await this.execute(() =>
      client.v1.customers.list({ ingest_alias: alias }),
    );

    return response.data.map((customer) => ({
      archivedAt: customer.archived_at ?? null,
      id: customer.id,
      ingestAliases: customer.ingest_aliases,
    }));
  }

  async createCustomer({
    alias,
    name,
  }: MetronomeCustomerInput): Promise<{ id: string }> {
    const client = this.getClient();
    try {
      const response = await client.v1.customers.create({
        name,
        ingest_aliases: [alias],
      });

      return { id: response.data.id };
    } catch (error) {
      if (error instanceof MetronomeClientException) {
        throw error;
      }

      throw new MetronomeClientException(
        this.classifyCreateCustomerError(error),
      );
    }
  }

  async createContract({
    customerId,
    rateCardAlias,
    uniquenessKey,
  }: MetronomeContractInput): Promise<{ id: string }> {
    const client = this.getClient();
    try {
      const response = await client.v1.contracts.create({
        customer_id: customerId,
        starting_at: new Date().toISOString(),
        rate_card_alias: rateCardAlias,
        uniqueness_key: uniquenessKey,
      });

      return { id: response.data.id };
    } catch (error) {
      if (error instanceof MetronomeClientException) {
        throw error;
      }

      throw new MetronomeClientException(
        this.getErrorStatus(error) === 409
          ? MetronomeClientExceptionCode.CONFLICT
          : MetronomeClientExceptionCode.REQUEST_FAILED,
      );
    }
  }
  async createCustomerCredit({
    amountCents,
    applicableProductIds,
    contractId,
    customerId,
    endingBefore,
    name,
    productId,
    startingAt,
    uniquenessKey,
    customFields,
  }: MetronomeCustomerCreditInput): Promise<{ id: string }> {
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
      throw new Error(
        'Metronome customer credit amount must be positive cents',
      );
    }

    const client = this.getClient();
    try {
      const response = await client.v1.customers.credits.create({
        applicable_product_ids: applicableProductIds,
        access_schedule: {
          schedule_items: [
            {
              amount: amountCents,
              ending_before: endingBefore,
              starting_at: startingAt,
            },
          ],
        },
        applicable_contract_ids: [contractId],
        customer_id: customerId,
        name,
        priority: 0,
        product_id: productId,
        ...(customFields === undefined ? {} : { custom_fields: customFields }),
        uniqueness_key: uniquenessKey,
      });

      return { id: response.data.id };
    } catch (error) {
      const status = this.getErrorStatus(error);
      const isAmbiguousCreate =
        status === 409 ||
        status === 429 ||
        status === undefined ||
        status >= 500 ||
        (error instanceof MetronomeClientException &&
          [
            MetronomeClientExceptionCode.CONFLICT,
            MetronomeClientExceptionCode.CREATE_OUTCOME_UNCERTAIN,
            MetronomeClientExceptionCode.RATE_LIMITED,
          ].includes(error.code));

      if (isAmbiguousCreate) {
        return this.recoverCustomerCredit({
          amountCents,
          applicableProductIds,
          contractId,
          customerId,
          endingBefore,
          productId,
          startingAt,
          uniquenessKey,
        });
      }
      throw new MetronomeClientException(
        status === 429
          ? MetronomeClientExceptionCode.RATE_LIMITED
          : status === undefined || status >= 500
            ? MetronomeClientExceptionCode.CREATE_OUTCOME_UNCERTAIN
            : MetronomeClientExceptionCode.REQUEST_FAILED,
      );
    }
  }

  private async recoverCustomerCredit({
    amountCents,
    contractId,
    applicableProductIds,
    customerId,
    endingBefore,
    productId,
    startingAt,
    uniquenessKey,
  }: Omit<MetronomeCustomerCreditInput, 'name'>): Promise<{ id: string }> {
    const client = this.getClient();
    const credits: Awaited<
      ReturnType<typeof client.v1.customers.credits.list>
    >['data'] = [];

    try {
      let page = await this.execute(() =>
        client.v1.customers.credits.list({
          customer_id: customerId,
          include_archived: true,
        }),
      );
      credits.push(...page.data);

      while (typeof page.hasNextPage === 'function' && page.hasNextPage()) {
        page = await this.execute(() => page.getNextPage());
        credits.push(...page.data);
      }
    } catch {
      throw new MetronomeClientException(
        MetronomeClientExceptionCode.CREATE_OUTCOME_UNCERTAIN,
      );
    }

    const matches = credits.filter(
      (credit) => credit.uniqueness_key === uniquenessKey,
    );
    const exactMatches = matches.filter((credit) => {
      const scheduleItems = credit.access_schedule?.schedule_items ?? [];
      return (
        credit.product.id === productId &&
        credit.applicable_product_ids?.length === applicableProductIds.length &&
        applicableProductIds.every((applicableProductId) =>
          credit.applicable_product_ids?.includes(applicableProductId),
        ) &&
        credit.applicable_contract_ids?.length === 1 &&
        credit.applicable_contract_ids[0] === contractId &&
        scheduleItems.length === 1 &&
        scheduleItems[0].amount === amountCents &&
        new Date(scheduleItems[0].starting_at).getTime() ===
          new Date(startingAt).getTime() &&
        scheduleItems[0].ending_before === endingBefore
      );
    });

    if (matches.length === 0) {
      throw new MetronomeClientException(
        MetronomeClientExceptionCode.CREATE_OUTCOME_UNCERTAIN,
      );
    }

    if (matches.length !== 1 || exactMatches.length !== 1) {
      throw new MetronomeClientException(MetronomeClientExceptionCode.CONFLICT);
    }

    return { id: exactMatches[0].id };
  }

  async findCurrentContracts(
    customerId: string,
  ): Promise<MetronomeCurrentContract[]> {
    const client = this.getClient();
    const response = await this.execute(() =>
      client.v2.contracts.list({
        customer_id: customerId,
        covering_date: new Date().toISOString(),
      }),
    );

    return response.data.map((contract) => ({
      id: contract.id,
      rateCardId: contract.rate_card_id ?? null,
      startingAt: contract.starting_at,
      uniquenessKey: contract.uniqueness_key ?? null,
    }));
  }

  async listRateCards(): Promise<MetronomeRateCardPage> {
    const client = this.getClient();
    const response = await this.execute(() =>
      client.v1.contracts.rateCards.list({
        limit: RATE_CARD_REPLAY_PAGE_LIMIT,
      }),
    );

    return {
      hasNextPage: response.hasNextPage(),
      rateCards: response.getPaginatedItems().map((rateCard) => ({
        aliases: (rateCard.aliases ?? []).map((alias) => ({
          endingBefore: alias.ending_before ?? null,
          name: alias.name,
          startingAt: alias.starting_at ?? null,
        })),
        id: rateCard.id,
      })),
    };
  }

  async getBillableMetricIds(productIds: string[]): Promise<string[]> {
    const client = this.getClient();
    const billableMetricIds = await Promise.all(
      productIds.map(async (productId) => {
        const response = await this.execute(() =>
          client.v1.contracts.products.retrieve({ id: productId }),
        );
        const billableMetricId = response.data.current.billable_metric_id;

        if (!billableMetricId?.trim()) {
          throw new MetronomeClientException(
            MetronomeClientExceptionCode.REQUEST_FAILED,
          );
        }

        return billableMetricId.trim();
      }),
    );

    return [...new Set(billableMetricIds)].sort();
  }

  async previewUsage({
    customerId,
    eventType,
    properties,
    timestamp,
  }: MetronomeUsageInput): Promise<MetronomeUsagePreview> {
    let safeProperties;

    try {
      safeProperties = validateSafeMetronomeEventProperties(properties);
    } catch {
      throw new MetronomeClientException(
        MetronomeClientExceptionCode.UNSAFE_EVENT_PROPERTIES,
      );
    }

    const client = this.getClient();
    const response = await this.execute(() =>
      client.v1.customers.previewEvents({
        customer_id: customerId,
        events: [
          {
            event_type: eventType,
            properties: safeProperties,
            ...(timestamp === undefined ? {} : { timestamp }),
          },
        ],
        mode: 'replace',
      }),
    );

    return {
      invoices: response.data.map((invoice) => ({
        contractId: invoice.contract_id ?? null,
        customerId: invoice.customer_id,
        id: invoice.id,
        lineItems: invoice.line_items.map((lineItem) => ({
          name: lineItem.name,
          productId: lineItem.product_id ?? null,
          total: lineItem.total,
          type: lineItem.type,
        })),
        total: invoice.total,
      })),
    };
  }
  async getPrepaidBalance(customerId: string): Promise<{ balance: number }> {
    const client = this.getClient();
    const response = await this.execute(() =>
      client.v1.contracts.getNetBalance({
        customer_id: customerId,
        filters: [
          { balance_types: ['PREPAID_COMMIT'] },
          {
            balance_types: ['CREDIT'],
            custom_fields: { myah_managed_openrouter: 'sponsored' },
          },
        ],
        invoice_inclusion_mode: 'FINALIZED_AND_DRAFT',
      }),
    );

    const balance = response.data.balance;

    if (
      !Number.isSafeInteger(balance) ||
      !Number.isFinite(balance) ||
      balance < 0
    ) {
      throw new MetronomeClientException(
        MetronomeClientExceptionCode.REQUEST_FAILED,
      );
    }

    return { balance };
  }

  async ingestUsage({
    customerId,
    eventType,
    properties,
    timestamp,
    transactionId,
  }: MetronomeIngestUsageInput) {
    let safeProperties;

    try {
      safeProperties = validateSafeMetronomeEventProperties(properties);
    } catch {
      throw new MetronomeClientException(
        MetronomeClientExceptionCode.UNSAFE_EVENT_PROPERTIES,
      );
    }

    const client = this.getClient();

    return this.execute(() =>
      client.v1.usage.ingest({
        usage: [
          {
            customer_id: customerId,
            event_type: eventType,
            properties: safeProperties,
            timestamp,
            transaction_id: transactionId,
          },
        ],
      }),
    );
  }

  async searchUsageEvents(
    transactionIds: string[],
  ): Promise<MetronomeUsageEvent[]> {
    const client = this.getClient();
    const response = await this.execute(() =>
      client.v1.usage.search({ transactionIds }),
    );

    return response.map((event) => ({
      customerId: event.customer_id,
      eventType: event.event_type,
      isDuplicate: event.is_duplicate ?? false,
      matchedBillableMetricIds: (
        (
          event as typeof event & {
            billable_metrics?: Array<{ id: string }>;
          }
        ).billable_metrics ??
        event.matched_billable_metrics ??
        []
      ).map((billableMetric) => billableMetric.id),
      matchedCustomerId:
        (event as typeof event & { matched_customer?: { id?: string } | null })
          .matched_customer?.id ?? null,
      timestamp: event.timestamp,
      processedAt: event.processed_at ?? null,
      properties: event.properties ?? {},
      transactionId: event.transaction_id,
    }));
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof MetronomeClientException) {
        throw error;
      }

      throw new MetronomeClientException(
        this.getErrorStatus(error) === 429
          ? MetronomeClientExceptionCode.RATE_LIMITED
          : MetronomeClientExceptionCode.REQUEST_FAILED,
      );
    }
  }

  private classifyCreateCustomerError(
    error: unknown,
  ): MetronomeClientExceptionCode {
    const status = this.getErrorStatus(error);

    if (status === 409) {
      return MetronomeClientExceptionCode.CONFLICT;
    }

    if (status === undefined || status >= 500) {
      return MetronomeClientExceptionCode.CREATE_OUTCOME_UNCERTAIN;
    }

    return MetronomeClientExceptionCode.REQUEST_FAILED;
  }

  private getErrorStatus(error: unknown): number | undefined {
    return typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      typeof error.status === 'number' &&
      Number.isInteger(error.status)
      ? error.status
      : undefined;
  }

  private getClient(): Metronome {
    if (!this.twentyConfigService.get('METRONOME_ENABLED')) {
      throw new MetronomeClientException(
        MetronomeClientExceptionCode.CONFIGURATION_DISABLED,
      );
    }

    if (this.client) {
      return this.client;
    }

    try {
      this.client = new Metronome({
        bearerToken: this.twentyConfigService.get('METRONOME_API_KEY'),
      });
    } catch {
      throw new MetronomeClientException(
        MetronomeClientExceptionCode.REQUEST_FAILED,
      );
    }

    return this.client;
  }
}
