import { Injectable } from '@nestjs/common';
import { Metronome } from '@metronome/sdk';
import type {
  ContractCreateParams,
  ContractListBalancesResponse,
} from '@metronome/sdk/resources/v1/contracts';
import type {
  ContractEditResponse,
  ContractGetEditHistoryResponse,
} from '@metronome/sdk/resources/v2/contracts';
import type { Commit } from '@metronome/sdk/resources/shared';
import { z } from 'zod';

import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';

import { METRONOME_USD_CREDIT_TYPE_NAME } from '../constants/metronome-workspace-alias-prefix.constant';

import {
  MetronomeClientException,
  MetronomeClientExceptionCode,
} from '../metronome-client.exception';
import { toMetronomeHourBoundary } from '../utils/to-metronome-hour-boundary.util';
import { validateSafeMetronomeEventProperties } from '../utils/validate-safe-metronome-event-properties.util';
import {
  type MetronomeAddSubscriptionInput,
  type MetronomeEndSubscriptionInput,
  type MetronomeInvoiceListInput,
  type MetronomeInvoicePage,
  type MetronomeQuantityUpdateInput,
  type MetronomeSubscriptionReceipt,
} from '../types/metronome-subscription.type';

import {
  type MetronomePaymentGatedPrepaidCommitArchiveInput,
  type MetronomePaymentGatedPrepaidCommitExpiryInput,
  type MetronomePaymentGatedPrepaidCommitExpiryProofInput,
  type MetronomePaymentGatedPrepaidCommitInput,
  type MetronomePaymentGatedPrepaidCommitReceipt,
  type MetronomePaymentGatedPrepaidCommitRecovery,
  type MetronomePaymentGatedPrepaidInvoice,
  type MetronomePaymentGatedPrepaidInvoiceInput,
} from '../types/metronome-payment-gated-prepaid-commit.type';
const BALANCE_PAGE_LIMIT = 25;
const METRONOME_MAX_LIST_PAGES = 100;
const safeNonnegativeCentsSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);
const metronomePaymentGatedPrepaidInvoiceSchema = z.object({
  contract_id: z.string(),
  credit_type: z.object({
    id: z.string(),
    name: z.string(),
  }),
  customer_id: z.string(),
  external_invoice: z
    .object({
      billing_provider_type: z.literal('stripe'),
      external_payment_id: z.string().optional(),
      external_status: z.enum([
        'DRAFT',
        'FINALIZED',
        'PAID',
        'PARTIALLY_PAID',
        'UNCOLLECTIBLE',
        'VOID',
        'DELETED',
        'PAYMENT_FAILED',
        'INVALID_REQUEST_ERROR',
        'SKIPPED',
        'SENT',
        'QUEUED',
      ]),
      invoice_id: z.string().optional(),
      invoiced_sub_total: safeNonnegativeCentsSchema.optional(),
      invoiced_total: safeNonnegativeCentsSchema.optional(),
      issued_at_timestamp: z.string().optional(),
      pdf_url: z.string().optional(),
      tax: z
        .object({
          total_tax_amount: safeNonnegativeCentsSchema.optional(),
          total_taxable_amount: safeNonnegativeCentsSchema.optional(),
        })
        .optional(),
    })
    .nullish(),
  id: z.string(),
  issued_at: z.string().optional(),
  line_items: z.array(
    z.object({
      applied_commit_or_credit: z.unknown().optional(),
      commit_id: z.string().optional(),
      credit_type: z.object({
        id: z.string(),
        name: z.string(),
      }),
      total: safeNonnegativeCentsSchema,
      type: z.string(),
    }),
  ),
  status: z.enum(['DRAFT', 'FINALIZED', 'VOID']),
  subtotal: safeNonnegativeCentsSchema.optional(),
  total: safeNonnegativeCentsSchema,
  type: z.literal('SCHEDULED'),
});
const toOptionalTrimmedString = (value: string | undefined): string | null => {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
};

type MetronomeBalanceResponse = ContractListBalancesResponse;

type MetronomePaymentGatedPrepaidCommitHistoryCommit = NonNullable<
  ContractGetEditHistoryResponse.Data['add_commits']
>[number];

type MetronomePaymentGatedPrepaidCommitCommercialRecord =
  | MetronomePaymentGatedPrepaidCommitHistoryCommit
  | Commit;
type PaymentGatedPrepaidCommitUpdateRequest = {
  contract_id: string;
  customer_id: string;
  uniqueness_key: string;
  update_commits: [
    {
      access_schedule: {
        update_schedule_items: [{ ending_before: string; id: string }];
      };
      commit_id: string;
    },
  ];
};
export type MetronomeCustomerInput = {
  alias: string;
  name: string;
};

export type MetronomeContractInput = {
  billingProviderConfiguration?: {
    billingProvider: 'stripe';
    deliveryMethod: 'direct_to_billing_provider';
  };
  customerId: string;
  rateCardAlias: string;
  uniquenessKey: string;
};
export type MetronomeCurrentContract = {
  activeBillingProviderConfiguration: {
    billingProvider: string;
    deliveryMethod: string;
    deliveryMethodId: string;
    id: string;
  } | null;
  id: string;
  rateCardId: string | null;
  startingAt: string;
  uniquenessKey: string | null;
};

export type MetronomeBillingConfiguration = Readonly<{
  billingProviderType: 'stripe';
  deliveryMethod: 'direct_to_billing_provider';
  deliveryMethodId: string;
  id: string;
  stripeCollectionMethod:
    | 'charge_automatically'
    | 'send_invoice'
    | 'auto_charge_payment_intent'
    | 'manually_charge_payment_intent';
  stripeCustomerId: string;
}>;

export type MetronomeEnvironment = 'PRODUCTION' | 'SANDBOX';

export type ExactStripeBillingContext = Readonly<{
  billingConfigurationId: string;
  deliveryMethodId: string;
  environment: MetronomeEnvironment;
  fiatCreditTypeId: string;
  fiatCreditTypeName: 'USD (cents)';
  metronomeContractId: string;
  metronomeCustomerId: string;
  stripeCustomerId: string;
}>;

export type MetronomeRateCard = {
  aliases: Array<{
    endingBefore: string | null;
    name: string;
    startingAt: string | null;
  }>;
  fiatCreditType: { id: string; name: string } | null;
  id: string;
};
export type MetronomeRateCardProducts = {
  rateCardId: string;
  productIdsByTag: Record<string, string>;
};

export type MetronomeRateCardLineItem = Readonly<{
  billingFrequency: 'ANNUAL' | 'MONTHLY';
  productId: string;
  startingAt: string;
  unitPriceCents: number;
}>;

type MetronomeRateCardRate = {
  billing_frequency?: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'WEEKLY';
  ending_before?: string;
  product_id: string;
  product_tags: string[];
  rate: {
    price?: number;
    rate_type:
      | 'FLAT'
      | 'PERCENTAGE'
      | 'SUBSCRIPTION'
      | 'CUSTOM'
      | 'TIERED'
      | 'TIERED_PERCENTAGE';
  };
  starting_at: string;
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

export type MetronomeCustomerCreditReceipt = {
  creditId: string;
  metronomeEditId: string;
};

@Injectable()
export class MetronomeClientService {
  private client: Metronome | undefined;

  constructor(
    private readonly twentyConfigService: TwentyConfigService,
    private readonly baseURL = 'https://api.metronome.com',
  ) {}

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

  async setStripeBillingConfiguration(
    customerId: string,
    stripeCustomerId: string,
  ): Promise<void> {
    const client = this.getClient();

    try {
      await client.v1.customers.billingConfig.create(
        {
          billing_provider_customer_id: stripeCustomerId,
          billing_provider_type: 'stripe',
          customer_id: customerId,
          stripe_collection_method: 'charge_automatically',
        },
        { maxRetries: 0 },
      );
    } catch (error) {
      throw this.toWriteException(error);
    }
  }
  async getBillingConfiguration(
    customerId: string,
  ): Promise<MetronomeBillingConfiguration | null> {
    const client = this.getClient();

    try {
      const response = await client.v1.customers.retrieveBillingConfigurations({
        customer_id: customerId,
      });
      const configurations = response.data.filter(
        (configuration) =>
          configuration.archived_at === null &&
          configuration.billing_provider === 'stripe',
      );

      if (configurations.length === 0) {
        return null;
      }

      if (configurations.length !== 1) {
        throw new MetronomeClientException(
          MetronomeClientExceptionCode.REQUEST_FAILED,
        );
      }

      const configuration = configurations[0];
      const stripeCustomerId = configuration.configuration.stripe_customer_id;
      const stripeCollectionMethod =
        configuration.configuration.stripe_collection_method;
      const supportedCollectionMethods = [
        'charge_automatically',
        'send_invoice',
        'auto_charge_payment_intent',
        'manually_charge_payment_intent',
      ] as const;

      if (
        configuration.customer_id !== customerId ||
        configuration.id.trim() === '' ||
        configuration.delivery_method !== 'direct_to_billing_provider' ||
        configuration.delivery_method_id.trim() === '' ||
        typeof stripeCustomerId !== 'string' ||
        stripeCustomerId.trim() === '' ||
        typeof stripeCollectionMethod !== 'string' ||
        !supportedCollectionMethods.includes(
          stripeCollectionMethod as (typeof supportedCollectionMethods)[number],
        )
      ) {
        throw new MetronomeClientException(
          MetronomeClientExceptionCode.REQUEST_FAILED,
        );
      }

      return {
        billingProviderType: 'stripe',
        deliveryMethod: configuration.delivery_method,
        deliveryMethodId: configuration.delivery_method_id,
        id: configuration.id,
        stripeCollectionMethod:
          stripeCollectionMethod as MetronomeBillingConfiguration['stripeCollectionMethod'],
        stripeCustomerId,
      };
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

  async createBillingConfiguration(input: {
    customerId: string;
    billingProviderType: 'stripe';
    deliveryMethodId: string;
    stripeCustomerId: string;
    stripeCollectionMethod: 'charge_automatically';
  }): Promise<MetronomeBillingConfiguration> {
    const client = this.getClient();
    let writeError: unknown;

    try {
      await client.v1.customers.setBillingConfigurations(
        {
          data: [
            {
              billing_provider: input.billingProviderType,
              configuration: {
                stripe_collection_method: input.stripeCollectionMethod,
                stripe_customer_id: input.stripeCustomerId,
              },
              customer_id: input.customerId,
              delivery_method_id: input.deliveryMethodId,
            },
          ],
        },
        { maxRetries: 0 },
      );
    } catch (error) {
      writeError = error;
    }

    let current: MetronomeBillingConfiguration | null;

    try {
      current = await this.getBillingConfiguration(input.customerId);
    } catch (error) {
      if (writeError !== undefined) {
        throw this.toWriteException(writeError);
      }

      throw error;
    }

    if (
      current?.billingProviderType === input.billingProviderType &&
      current.deliveryMethod === 'direct_to_billing_provider' &&
      current.deliveryMethodId === input.deliveryMethodId &&
      current.stripeCustomerId === input.stripeCustomerId &&
      current.stripeCollectionMethod === input.stripeCollectionMethod
    ) {
      return current;
    }

    if (writeError !== undefined) {
      throw this.toWriteException(writeError);
    }

    throw new MetronomeClientException(
      MetronomeClientExceptionCode.REQUEST_FAILED,
    );
  }

  async addStripeBillingConfigurationToContract(input: {
    billingConfigurationId: string;
    contractId: string;
    customerId: string;
    uniquenessKey: string;
  }): Promise<{ metronomeEditId: string }> {
    if (
      [
        input.billingConfigurationId,
        input.contractId,
        input.customerId,
        input.uniquenessKey,
      ].some((value) => value.trim() === '')
    ) {
      throw new MetronomeClientException(
        MetronomeClientExceptionCode.REQUEST_FAILED,
      );
    }

    const client = this.getClient();

    try {
      const response = await client.v2.contracts.edit(
        {
          add_billing_provider_configuration_update: {
            billing_provider_configuration: {
              billing_provider: 'stripe',
              billing_provider_configuration_id:
                input.billingConfigurationId,
              delivery_method: 'direct_to_billing_provider',
            },
            schedule: { effective_at: 'START_OF_CURRENT_PERIOD' },
          },
          contract_id: input.contractId,
          customer_id: input.customerId,
          uniqueness_key: input.uniquenessKey,
        },
        { idempotencyKey: input.uniquenessKey, maxRetries: 0 },
      );
      const editId = response.data.edit?.id;

      if (response.data.id !== input.contractId || !editId?.trim()) {
        throw new MetronomeClientException(
          MetronomeClientExceptionCode.CREATE_OUTCOME_UNCERTAIN,
        );
      }

      return { metronomeEditId: editId };
    } catch (error) {
      throw this.toWriteException(error);
    }
  }

  async createContract({
    billingProviderConfiguration,
    customerId,
    rateCardAlias,
    uniquenessKey,
  }: MetronomeContractInput): Promise<{ id: string }> {
    const client = this.getClient();
    const contractInput: ContractCreateParams = {
      customer_id: customerId,
      starting_at: toMetronomeHourBoundary(new Date()).toISOString(),
      rate_card_alias: rateCardAlias,
      uniqueness_key: uniquenessKey,
      ...(billingProviderConfiguration === undefined
        ? {}
        : {
            billing_provider_configuration: {
              billing_provider: billingProviderConfiguration.billingProvider,
              delivery_method: billingProviderConfiguration.deliveryMethod,
            },
          }),
    };

    try {
      const response =
        billingProviderConfiguration === undefined
          ? await client.v1.contracts.create(contractInput)
          : await client.v1.contracts.create(contractInput, { maxRetries: 0 });

      return { id: response.data.id };
    } catch (error) {
      if (error instanceof MetronomeClientException) {
        throw error;
      }

      if (this.isUniquenessConflict(error)) {
        throw new MetronomeClientException(
          MetronomeClientExceptionCode.CONFLICT,
        );
      }

      if (billingProviderConfiguration !== undefined) {
        throw this.toWriteException(error);
      }

      throw new MetronomeClientException(
        MetronomeClientExceptionCode.REQUEST_FAILED,
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
  }: MetronomeCustomerCreditInput): Promise<MetronomeCustomerCreditReceipt> {
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
      throw new Error(
        'Metronome customer credit amount must be positive cents',
      );
    }

    const client = this.getClient();
    try {
      const response = await client.v2.contracts.edit({
        contract_id: contractId,
        customer_id: customerId,
        add_credits: [
          {
            access_schedule: {
              schedule_items: [
                {
                  amount: amountCents,
                  ending_before:
                    toMetronomeHourBoundary(endingBefore).toISOString(),
                  starting_at:
                    toMetronomeHourBoundary(startingAt).toISOString(),
                },
              ],
            },
            applicable_product_ids: applicableProductIds,
            ...(customFields === undefined
              ? {}
              : { custom_fields: customFields }),
            name,
            priority: 0,
            product_id: productId,
          },
        ],
        uniqueness_key: uniquenessKey,
      });
      const edit = response.data.edit;
      const creditId =
        edit?.add_credits?.length === 1 ? edit.add_credits[0].id : undefined;
      if (!edit?.id || !creditId) {
        throw new MetronomeClientException(
          MetronomeClientExceptionCode.CREATE_OUTCOME_UNCERTAIN,
        );
      }
      return { creditId, metronomeEditId: edit.id };
    } catch (error) {
      if (error instanceof MetronomeClientException) {
        throw error;
      }
      const status = this.getErrorStatus(error);
      throw new MetronomeClientException(
        this.isUniquenessConflict(error)
          ? MetronomeClientExceptionCode.CONFLICT
          : status === 429
            ? MetronomeClientExceptionCode.RATE_LIMITED
            : status === undefined || status >= 500
              ? MetronomeClientExceptionCode.CREATE_OUTCOME_UNCERTAIN
              : MetronomeClientExceptionCode.REQUEST_FAILED,
      );
    }
  }
  async createPaymentGatedPrepaidCommit(
    input: MetronomePaymentGatedPrepaidCommitInput,
  ): Promise<MetronomePaymentGatedPrepaidCommitReceipt> {
    this.validatePaymentGatedPrepaidCommitInput(input);

    const startingAt = toMetronomeHourBoundary(input.purchaseAt).toISOString();
    const endingBefore = this.addCalendarMonths(startingAt, 13);
    const client = this.getClient();

    try {
      const response = await client.v2.contracts.edit(
        {
          add_commits: [
            {
              access_schedule: {
                schedule_items: [
                  {
                    amount: input.principalCents,
                    ending_before: endingBefore,
                    starting_at: startingAt,
                  },
                ],
              },
              applicable_product_ids: [input.chargeProductId],
              custom_fields: {
                myah_funding_action_id: input.fundingActionId,
                myah_funding_identity: input.fundingIdentity,
              },
              invoice_schedule: {
                schedule_items: [
                  { amount: input.principalCents, timestamp: startingAt },
                ],
              },
              payment_gate_config: {
                payment_gate_type: 'STRIPE',
                tax_type: 'STRIPE',
              },
              priority: 100,
              product_id: input.commitmentProductId,
              type: 'PREPAID',
            },
          ],
          contract_id: input.contractId,
          customer_id: input.customerId,
          uniqueness_key: input.uniquenessKey,
        },
        { idempotencyKey: input.uniquenessKey, maxRetries: 0 },
      );
      const edit = response.data.edit;
      const commitment =
        edit?.add_commits?.length === 1 ? edit.add_commits[0] : undefined;
      const commitmentDetails =
        commitment === undefined
          ? null
          : this.getPaymentGatedPrepaidCommitRecoveryDetails(
              commitment,
              input,
              startingAt,
              endingBefore,
            );

      if (
        response.data.id !== input.contractId ||
        !edit?.id?.trim() ||
        !commitment?.id?.trim() ||
        commitmentDetails === null
      ) {
        throw new MetronomeClientException(
          MetronomeClientExceptionCode.CREATE_OUTCOME_UNCERTAIN,
        );
      }

      return { commitmentId: commitment.id, metronomeEditId: edit.id };
    } catch (error) {
      throw this.toWriteException(error);
    }
  }

  async recoverPaymentGatedPrepaidCommit(
    input: MetronomePaymentGatedPrepaidCommitInput,
  ): Promise<MetronomePaymentGatedPrepaidCommitRecovery | null> {
    this.validatePaymentGatedPrepaidCommitInput(input);

    const startingAt = toMetronomeHourBoundary(input.purchaseAt).toISOString();
    const endingBefore = this.addCalendarMonths(startingAt, 13);
    const client = this.getClient();
    const editHistoryResponse = await this.execute(() =>
      client.v2.contracts.getEditHistory({
        contract_id: input.contractId,
        customer_id: input.customerId,
      }),
    );
    const matchesInput = (
      edit: (typeof editHistoryResponse.data)[number],
    ): boolean => {
      const addedCommits = edit.add_commits;

      return (
        edit.id.trim() !== '' &&
        addedCommits?.length === 1 &&
        this.getPaymentGatedPrepaidCommitRecoveryDetails(
          addedCommits[0],
          input,
          startingAt,
          endingBefore,
        ) !== null
      );
    };
    const candidateEdits = editHistoryResponse.data.filter(
      ({ add_commits, uniqueness_key }) =>
        uniqueness_key === input.uniquenessKey ||
        (add_commits?.length === 1 &&
          this.getPaymentGatedPrepaidCommitRecoveryDetails(
            add_commits[0],
            input,
            startingAt,
            endingBefore,
          ) !== null),
    );
    const structuralHistoryMatches =
      editHistoryResponse.data.filter(matchesInput);

    if (
      candidateEdits.length > 1 ||
      (candidateEdits.length === 1 && structuralHistoryMatches.length !== 1)
    ) {
      throw new Error('Metronome payment-gated commit recovery mismatch');
    }

    const customerWideCommits = await this.listPaymentGatedPrepaidCommits(
      client,
      input.customerId,
    );
    const candidateCustomerCommits = customerWideCommits.filter(
      (commit) =>
        this.hasPartialPaymentGatedPrepaidCommitFundingEvidence(commit, input) ||
        (commit.contract?.id === input.contractId &&
          this.getPaymentGatedPrepaidCommitRecoveryDetails(
            commit,
            input,
            startingAt,
            endingBefore,
          ) !== null),
    );

    if (candidateEdits.length === 0 && candidateCustomerCommits.length === 0) {
      return null;
    }
    if (
      candidateEdits.length !== 1 ||
      structuralHistoryMatches.length !== 1 ||
      candidateCustomerCommits.length !== 1
    ) {
      throw new Error('Metronome payment-gated commit recovery mismatch');
    }

    const edit = structuralHistoryMatches[0];
    const commitment = edit.add_commits?.[0];
    const historyDetails =
      commitment === undefined
        ? null
        : this.getPaymentGatedPrepaidCommitRecoveryDetails(
            commitment,
            input,
            startingAt,
            endingBefore,
          );
    const customerCommit = candidateCustomerCommits[0];
    const customerDetails = this.getPaymentGatedPrepaidCommitRecoveryDetails(
      customerCommit,
      input,
      startingAt,
      endingBefore,
    );

    if (
      commitment === undefined ||
      commitment.id.trim() === '' ||
      historyDetails === null ||
      customerDetails === null ||
      customerCommit.id !== commitment.id ||
      (edit.uniqueness_key !== undefined &&
        edit.uniqueness_key !== null &&
        edit.uniqueness_key !== input.uniquenessKey)
    ) {
      throw new Error('Metronome payment-gated commit recovery mismatch');
    }

    const listedCommits = await this.listPaymentGatedPrepaidCommits(
      client,
      input.customerId,
      commitment.id,
    );
    const candidateCommits = listedCommits.filter(
      ({ id }) => id === commitment.id,
    );
    const structuralCommitMatches = candidateCommits.filter(
      (commit) =>
        this.getPaymentGatedPrepaidCommitRecoveryDetails(
          commit,
          input,
          startingAt,
          endingBefore,
        ) !== null,
    );

    if (
      candidateCommits.length !== 1 ||
      structuralCommitMatches.length !== 1
    ) {
      throw new Error('Metronome payment-gated commit recovery mismatch');
    }

    const recoveredCommit = structuralCommitMatches[0];
    const contractDetails = this.getPaymentGatedPrepaidCommitRecoveryDetails(
      recoveredCommit,
      input,
      startingAt,
      endingBefore,
    );
    const archivedAt = recoveredCommit.archived_at ?? null;

    if (
      contractDetails === null ||
      !this.hasPaymentGatedPrepaidCommitFundingEvidence(
        recoveredCommit,
        input,
      ) ||
      recoveredCommit.contract?.id !== input.contractId ||
      recoveredCommit.id !== commitment.id ||
      customerCommit.id !== recoveredCommit.id ||
      customerDetails.accessScheduleItemId !==
        historyDetails.accessScheduleItemId ||
      customerDetails.accessScheduleItemId !==
        contractDetails.accessScheduleItemId ||
      customerDetails.invoiceScheduleItemId !==
        historyDetails.invoiceScheduleItemId ||
      customerDetails.invoiceScheduleItemId !==
        contractDetails.invoiceScheduleItemId ||
      customerDetails.invoiceId !== historyDetails.invoiceId ||
      customerDetails.invoiceId !== contractDetails.invoiceId ||
      (archivedAt !== null &&
        (typeof archivedAt !== 'string' || archivedAt.trim() === ''))
    ) {
      throw new Error('Metronome payment-gated commit recovery mismatch');
    }

    return {
      accessScheduleItemId: contractDetails.accessScheduleItemId,
      archivedAt,
      commitmentId: commitment.id,
      invoiceId: contractDetails.invoiceId,
      metronomeEditId: edit.id,
    };
  }

  async updatePaymentGatedPrepaidCommitExpiry(
    input: MetronomePaymentGatedPrepaidCommitExpiryInput,
  ): Promise<{ metronomeEditId: string }> {
    this.validatePaymentGatedPrepaidCommitExpiryInput(input);

    const request: PaymentGatedPrepaidCommitUpdateRequest = {
      contract_id: input.contractId,
      customer_id: input.customerId,
      uniqueness_key: input.uniquenessKey,
      update_commits: [
        {
          access_schedule: {
            update_schedule_items: [
              {
                ending_before: this.addCalendarMonths(input.paidAt, 12),
                id: input.accessScheduleItemId,
              },
            ],
          },
          commit_id: input.commitmentId,
        },
      ],
    };
    const client = this.getClient();

    try {
      const response = await client.v2.contracts.edit(
        request as unknown as Parameters<typeof client.v2.contracts.edit>[0],
        { idempotencyKey: input.uniquenessKey, maxRetries: 0 },
      );

      return this.requirePaymentGatedPrepaidCommitEditReceipt(
        response.data,
        input.contractId,
        input.commitmentId,
        'update_commits',
      );
    } catch (error) {
      throw this.toWriteException(error);
    }
  }

  async assertPaymentGatedPrepaidCommitExpiry(
    input: MetronomePaymentGatedPrepaidCommitExpiryProofInput,
  ): Promise<{ expiresAt: string }> {
    this.validatePaymentGatedPrepaidCommitInput(input);
    this.validateSubscriptionDate(input.paidAt);
    if (
      input.accessScheduleItemId.trim() === '' ||
      input.commitmentId.trim() === ''
    ) {
      throw new Error(
        'Metronome payment-gated commit expiry proof is invalid',
      );
    }

    const client = this.getClient();
    const commits = await this.listPaymentGatedPrepaidCommits(
      client,
      input.customerId,
      input.commitmentId,
    );
    const startingAt = toMetronomeHourBoundary(input.purchaseAt).toISOString();
    const expiresAt = this.addCalendarMonths(input.paidAt, 12);
    const matches = commits.filter((commit) => {
      const details = this.getPaymentGatedPrepaidCommitRecoveryDetails(
        commit,
        input,
        startingAt,
        expiresAt,
      );

      return (
        commit.id === input.commitmentId &&
        commit.contract?.id === input.contractId &&
        commit.archived_at == null &&
        this.hasPaymentGatedPrepaidCommitFundingEvidence(commit, input) &&
        details?.accessScheduleItemId === input.accessScheduleItemId
      );
    });

    if (matches.length !== 1) {
      throw new Error(
        'Metronome payment-gated commit expiry proof is invalid',
      );
    }

    return { expiresAt };
  }

  async archivePaymentGatedPrepaidCommit(
    input: MetronomePaymentGatedPrepaidCommitArchiveInput,
  ): Promise<{ metronomeEditId: string }> {
    this.validatePaymentGatedPrepaidCommitArchiveInput(input);

    const client = this.getClient();
    try {
      const response = await client.v2.contracts.edit(
        {
          archive_commits: [{ id: input.commitmentId }],
          contract_id: input.contractId,
          customer_id: input.customerId,
          uniqueness_key: input.uniquenessKey,
        },
        { idempotencyKey: input.uniquenessKey, maxRetries: 0 },
      );

      return this.requirePaymentGatedPrepaidCommitEditReceipt(
        response.data,
        input.contractId,
        input.commitmentId,
        'archive_commits',
      );
    } catch (error) {
      throw this.toWriteException(error);
    }
  }

  async readPaymentGatedPrepaidCommitInvoice(
    input: MetronomePaymentGatedPrepaidInvoiceInput,
  ): Promise<MetronomePaymentGatedPrepaidInvoice> {
    if (
      !Number.isSafeInteger(input.principalCents) ||
      input.principalCents <= 0 ||
      [
        input.commitmentId,
        input.contractId,
        input.customerId,
        input.fiatCreditTypeId,
        input.invoiceId,
      ].some((value) => value.trim() === '')
    ) {
      throw new MetronomeClientException(
        MetronomeClientExceptionCode.REQUEST_FAILED,
      );
    }

    const client = this.getClient();
    const response = await this.execute(() =>
      client.v1.customers.invoices.retrieve({
        customer_id: input.customerId,
        invoice_id: input.invoiceId,
      }),
    );
    const parsedInvoice =
      metronomePaymentGatedPrepaidInvoiceSchema.safeParse(response.data);

    if (!parsedInvoice.success) {
      throw new MetronomeClientException(
        MetronomeClientExceptionCode.REQUEST_FAILED,
      );
    }

    const invoice = parsedInvoice.data;
    const line =
      invoice.line_items.length === 1 ? invoice.line_items[0] : undefined;
    const status = invoice.status;

    if (
      invoice.id !== input.invoiceId ||
      invoice.customer_id !== input.customerId ||
      invoice.contract_id !== input.contractId ||
      invoice.credit_type.id !== input.fiatCreditTypeId ||
      invoice.credit_type.name !== METRONOME_USD_CREDIT_TYPE_NAME ||
      invoice.total !== input.principalCents ||
      (invoice.subtotal !== undefined &&
        (!Number.isSafeInteger(invoice.subtotal) ||
          invoice.subtotal !== input.principalCents)) ||
      line === undefined ||
      line.type !== 'commit_purchase' ||
      line.commit_id !== input.commitmentId ||
      line.credit_type.id !== input.fiatCreditTypeId ||
      line.credit_type.name !== METRONOME_USD_CREDIT_TYPE_NAME ||
      !Number.isSafeInteger(line.total) ||
      line.total !== input.principalCents ||
      line.applied_commit_or_credit !== undefined
    ) {
      throw new MetronomeClientException(
        MetronomeClientExceptionCode.REQUEST_FAILED,
      );
    }

    const issuedAt = toOptionalTrimmedString(invoice.issued_at);
    const external = invoice.external_invoice;

    if (external == null) {
      return {
        externalInvoice: null,
        issuedAt,
        metronomeInvoiceId: invoice.id,
        principalCents: input.principalCents,
        status,
      };
    }

    const externalStatus = external.external_status;
    const subtotalCents = external.invoiced_sub_total ?? null;
    const taxCents = external.tax?.total_tax_amount ?? null;
    const totalCents = external.invoiced_total ?? null;

    if (
      (subtotalCents !== null && subtotalCents !== input.principalCents) ||
      (totalCents !== null && totalCents < input.principalCents) ||
      (totalCents !== null &&
        taxCents !== null &&
        totalCents !== input.principalCents + taxCents)
    ) {
      throw new MetronomeClientException(
        MetronomeClientExceptionCode.REQUEST_FAILED,
      );
    }

    return {
      externalInvoice: {
        issuedAt: toOptionalTrimmedString(external.issued_at_timestamp),
        pdfUrl: toOptionalTrimmedString(external.pdf_url),
        status: externalStatus,
        stripeInvoiceId: toOptionalTrimmedString(external.invoice_id),
        stripePaymentIntentId: toOptionalTrimmedString(
          external.external_payment_id,
        ),
        subtotalCents,
        taxCents,
        totalCents,
      },
      issuedAt,
      metronomeInvoiceId: invoice.id,
      principalCents: input.principalCents,
      status,
    };
  }


  async addSubscription(
    input: MetronomeAddSubscriptionInput,
  ): Promise<MetronomeSubscriptionReceipt> {
    this.validatePositiveSubscriptionQuantity(input.quantity);
    this.validateSubscriptionDate(input.startingAt);
    if (input.endingBefore !== undefined) {
      this.validateSubscriptionDate(input.endingBefore);
    }
    this.validateProrationRounding(input.proration.rounding);

    const client = this.getClient();
    try {
      const response = await client.v2.contracts.edit(
        {
          add_subscriptions: [
            {
              collection_schedule: 'ADVANCE',
              ...(input.endingBefore === undefined
                ? {}
                : { ending_before: input.endingBefore }),
              initial_quantity: input.quantity,
              proration: {
                invoice_behavior: input.proration.invoiceBehavior,
                is_prorated: input.proration.isProrated,
                ...(input.proration.rounding === undefined
                  ? {}
                  : {
                      rounding: {
                        decimal_places: input.proration.rounding.decimalPlaces,
                        rounding_method:
                          input.proration.rounding.roundingMethod,
                      },
                    }),
              },
              quantity_management_mode: 'QUANTITY_ONLY',
              starting_at: input.startingAt,
              subscription_rate: {
                billing_frequency: input.billingFrequency,
                product_id: input.productId,
              },
            },
          ],
          contract_id: input.contractId,
          customer_id: input.customerId,
          uniqueness_key: input.uniquenessKey,
        },
        { maxRetries: 0 },
      );
      const edit = response.data.edit;
      const subscriptionId =
        edit?.add_subscriptions?.length === 1
          ? edit.add_subscriptions[0].id
          : undefined;

      if (!edit?.id?.trim() || !subscriptionId?.trim()) {
        throw new MetronomeClientException(
          MetronomeClientExceptionCode.CREATE_OUTCOME_UNCERTAIN,
        );
      }

      return {
        metronomeEditId: edit.id,
        subscriptionId,
      };
    } catch (error) {
      throw this.toWriteException(error);
    }
  }

  async recoverAddedSubscription(
    input: MetronomeAddSubscriptionInput,
  ): Promise<MetronomeSubscriptionReceipt | null> {
    this.validatePositiveSubscriptionQuantity(input.quantity);
    this.validateSubscriptionDate(input.startingAt);
    if (input.endingBefore !== undefined) {
      this.validateSubscriptionDate(input.endingBefore);
    }
    this.validateProrationRounding(input.proration.rounding);

    const client = this.getClient();
    const response = await this.execute(() =>
      client.v2.contracts.getEditHistory({
        contract_id: input.contractId,
        customer_id: input.customerId,
      }),
    );
    const matchesInput = (edit: (typeof response.data)[number]): boolean => {
      const addedSubscriptions = edit.add_subscriptions;

      if (addedSubscriptions?.length !== 1 || !edit.id.trim()) {
        return false;
      }

      const subscription = addedSubscriptions[0];
      const quantitySchedule = subscription.quantity_schedule;
      const actualRounding = subscription.proration.rounding;
      const expectedRounding = input.proration.rounding;
      const roundingMatches =
        expectedRounding === undefined
          ? actualRounding === undefined
          : actualRounding?.decimal_places === expectedRounding.decimalPlaces &&
            actualRounding.rounding_method === expectedRounding.roundingMethod;
      const endingMatches =
        input.endingBefore === undefined
          ? subscription.ending_before === undefined
          : subscription.ending_before !== undefined &&
            Date.parse(subscription.ending_before) ===
              Date.parse(input.endingBefore);

      return (
        !!subscription.id?.trim() &&
        subscription.collection_schedule === 'ADVANCE' &&
        subscription.quantity_management_mode === 'QUANTITY_ONLY' &&
        Date.parse(subscription.starting_at) === Date.parse(input.startingAt) &&
        endingMatches &&
        subscription.subscription_rate.billing_frequency ===
          input.billingFrequency &&
        subscription.subscription_rate.product.id === input.productId &&
        subscription.proration.invoice_behavior ===
          input.proration.invoiceBehavior &&
        subscription.proration.is_prorated === input.proration.isProrated &&
        roundingMatches &&
        quantitySchedule.length === 1 &&
        quantitySchedule[0].quantity === input.quantity &&
        Date.parse(quantitySchedule[0].starting_at) ===
          Date.parse(input.startingAt)
      );
    };
    const keyedEdits = response.data.filter(
      ({ uniqueness_key }) => uniqueness_key === input.uniquenessKey,
    );
    const structuralMatches = response.data.filter(matchesInput);
    const matchingEdits =
      keyedEdits.length === 0
        ? structuralMatches
        : keyedEdits.filter(matchesInput);

    if (keyedEdits.length === 0 && matchingEdits.length === 0) return null;
    if (
      matchingEdits.length !== 1 ||
      (keyedEdits.length > 0 && keyedEdits.length !== 1) ||
      (keyedEdits.length === 0 &&
        matchingEdits[0].uniqueness_key !== undefined &&
        matchingEdits[0].uniqueness_key !== null)
    ) {
      throw new Error('Metronome subscription recovery mismatch');
    }

    const edit = matchingEdits[0];
    const subscription = edit.add_subscriptions?.[0];

    if (
      subscription?.id?.trim() === undefined ||
      subscription.id.trim() === ''
    ) {
      throw new Error('Metronome subscription recovery mismatch');
    }

    return {
      metronomeEditId: edit.id,
      subscriptionId: subscription.id,
    };
  }

  async scheduleSubscriptionQuantity(
    input: MetronomeQuantityUpdateInput,
  ): Promise<MetronomeSubscriptionReceipt> {
    this.validateNonnegativeSubscriptionQuantity(input.quantity);
    this.validateSubscriptionDate(input.effectiveAt);
    this.validateProrationRounding(input.prorationRounding ?? undefined);

    const client = this.getClient();
    try {
      const response = await client.v2.contracts.edit(
        {
          contract_id: input.contractId,
          customer_id: input.customerId,
          uniqueness_key: input.uniquenessKey,
          update_subscriptions: [
            {
              ...(input.prorationRounding === undefined
                ? {}
                : {
                    proration_rounding:
                      input.prorationRounding === null
                        ? null
                        : {
                            decimal_places:
                              input.prorationRounding.decimalPlaces,
                            rounding_method:
                              input.prorationRounding.roundingMethod,
                          },
                  }),
              quantity_updates: [
                {
                  quantity: input.quantity,
                  starting_at: input.effectiveAt,
                },
              ],
              subscription_id: input.subscriptionId,
            },
          ],
        },
        { maxRetries: 0 },
      );

      return this.requireUpdatedSubscriptionReceipt(
        response.data.edit,
        input.subscriptionId,
      );
    } catch (error) {
      throw this.toWriteException(error);
    }
  }

  async endSubscription(
    input: MetronomeEndSubscriptionInput,
  ): Promise<MetronomeSubscriptionReceipt> {
    this.validateSubscriptionDate(input.endingBefore);

    const client = this.getClient();
    try {
      const response = await client.v2.contracts.edit(
        {
          contract_id: input.contractId,
          customer_id: input.customerId,
          uniqueness_key: input.uniquenessKey,
          update_subscriptions: [
            {
              ending_before: input.endingBefore,
              subscription_id: input.subscriptionId,
            },
          ],
        },
        { maxRetries: 0 },
      );

      return this.requireUpdatedSubscriptionReceipt(
        response.data.edit,
        input.subscriptionId,
      );
    } catch (error) {
      throw this.toWriteException(error);
    }
  }

  async findCurrentContracts(
    customerId: string,
  ): Promise<MetronomeCurrentContract[]> {
    const client = this.getClient();
    const coveringDate = new Date().toISOString();
    const response = await this.execute(() =>
      client.v2.contracts.list({
        customer_id: customerId,
        covering_date: coveringDate,
      }),
    );
    const coveringTime = Date.parse(coveringDate);

    return response.data.map((contract) => {
      const activeConfigurations = (
        contract.billing_provider_configuration_schedule ?? []
      ).filter((entry) => {
        const effectiveAt = Date.parse(entry.effective_at);
        const effectiveUntil =
          entry.effective_until === undefined
            ? null
            : Date.parse(entry.effective_until);

        return (
          Number.isFinite(effectiveAt) &&
          effectiveAt <= coveringTime &&
          (effectiveUntil === null ||
            (Number.isFinite(effectiveUntil) && coveringTime < effectiveUntil))
        );
      });
      const activeConfiguration =
        activeConfigurations.length === 1
          ? activeConfigurations[0].billing_provider_configuration
          : null;

      return {
        activeBillingProviderConfiguration:
          activeConfiguration === null
            ? null
            : {
                billingProvider: activeConfiguration.billing_provider,
                deliveryMethod: activeConfiguration.delivery_method,
                deliveryMethodId: activeConfiguration.delivery_method_id,
                id: activeConfiguration.id,
              },
        id: contract.id,
        rateCardId: contract.rate_card_id ?? null,
        startingAt: contract.starting_at,
        uniquenessKey: contract.uniqueness_key ?? null,
      };
    });
  }

  async getRateCard(id: string): Promise<MetronomeRateCard> {
    const client = this.getClient();
    const response = await this.execute(() =>
      client.v1.contracts.rateCards.retrieve({ id }),
    );
    const rateCard = response.data;

    return {
      aliases: (rateCard.aliases ?? []).map((alias) => ({
        endingBefore: alias.ending_before ?? null,
        name: alias.name,
        startingAt: alias.starting_at ?? null,
      })),
      fiatCreditType:
        rateCard.fiat_credit_type === undefined
          ? null
          : {
              id: rateCard.fiat_credit_type.id,
              name: rateCard.fiat_credit_type.name,
            },
      id: rateCard.id,
    };
  }

  async resolveRateCardProducts({
    alias,
    at,
    productTags,
  }: {
    alias: string;
    at: Date;
    productTags: string[];
  }): Promise<MetronomeRateCardProducts> {
    const client = this.getClient();
    const cards: Array<{
      id: string;
      aliases?: Array<{
        name: string;
        starting_at?: string | null;
        ending_before?: string | null;
        startingAt?: string | null;
        endingBefore?: string | null;
      }>;
    }> = [];
    const seenPageCursors = new Set<string>();
    let nextPage: string | undefined;

    for (let page = 1; page <= METRONOME_MAX_LIST_PAGES; page += 1) {
      const response = await this.execute(() =>
        client.v1.contracts.rateCards.list({
          body: {},
          ...(nextPage === undefined ? {} : { next_page: nextPage }),
        }),
      );

      cards.push(...(response.data as typeof cards));
      const responseNextPage = response.next_page || undefined;

      if (responseNextPage === undefined) {
        nextPage = undefined;
        break;
      }
      if (seenPageCursors.has(responseNextPage)) {
        throw new Error('Metronome rate-card pagination cursor repeated');
      }
      seenPageCursors.add(responseNextPage);
      nextPage = responseNextPage;
    }
    if (nextPage !== undefined) {
      throw new Error('Metronome rate-card pagination exceeded its limit');
    }

    const active = cards.filter((card) =>
      (card.aliases ?? []).some((entry) =>
        this.isActiveAt(
          entry.starting_at ?? entry.startingAt,
          entry.ending_before ?? entry.endingBefore,
          at.getTime(),
        ),
      ),
    );
    const matchingActive = active.filter((card) =>
      (card.aliases ?? []).some(
        (entry) =>
          entry.name === alias &&
          this.isActiveAt(
            entry.starting_at ?? entry.startingAt,
            entry.ending_before ?? entry.endingBefore,
            at.getTime(),
          ),
      ),
    );

    if (matchingActive.length !== 1) {
      throw new Error(
        `Expected exactly one active rate card for alias ${alias}`,
      );
    }

    const rateCardId = matchingActive[0].id;
    const rates = await this.listRateCardRates(rateCardId, at.toISOString());
    const productIdsByTag: Record<string, string> = {};

    for (const tag of productTags) {
      const matches = [
        ...new Set(
          rates
            .filter(
              (rate) =>
                rate.product_tags.includes(tag) &&
                this.isActiveAt(
                  rate.starting_at,
                  rate.ending_before,
                  at.getTime(),
                ),
            )
            .map((rate) => rate.product_id),
        ),
      ];

      if (matches.length !== 1) {
        throw new Error(`Expected exactly one product for tag ${tag}`);
      }

      productIdsByTag[tag] = matches[0];
    }

    return { rateCardId, productIdsByTag };
  }

  async assertRateCardLineItems({
    lines,
    rateCardId,
  }: {
    lines: readonly MetronomeRateCardLineItem[];
    rateCardId: string;
  }): Promise<void> {
    const startingTimes = lines.map(({ startingAt }) => Date.parse(startingAt));

    if (
      rateCardId.trim() === '' ||
      lines.length === 0 ||
      startingTimes.some((time) => !Number.isFinite(time))
    ) {
      throw new Error('Metronome rate card line proof is invalid');
    }

    const startingAt = new Date(Math.min(...startingTimes)).toISOString();
    const rates = await this.listRateCardRates(rateCardId, startingAt);

    for (const line of lines) {
      const lineTime = Date.parse(line.startingAt);
      const matchingRates = rates.filter(
        (rate) =>
          rate.product_id === line.productId &&
          rate.billing_frequency === line.billingFrequency &&
          this.isActiveAt(rate.starting_at, rate.ending_before, lineTime),
      );

      if (
        matchingRates.length !== 1 ||
        matchingRates[0].rate.rate_type !== 'FLAT' ||
        matchingRates[0].rate.price !== line.unitPriceCents ||
        !Number.isSafeInteger(line.unitPriceCents) ||
        line.unitPriceCents <= 0
      ) {
        throw new Error('Metronome rate card line does not match the quote');
      }
    }
  }

  private async listRateCardRates(
    rateCardId: string,
    startingAt: string,
  ): Promise<MetronomeRateCardRate[]> {
    const client = this.getClient();
    const rates: MetronomeRateCardRate[] = [];
    const seenPageCursors = new Set<string>();
    let nextPage: string | undefined;

    for (let page = 1; page <= METRONOME_MAX_LIST_PAGES; page += 1) {
      const response = await this.execute(() =>
        client.v1.contracts.rateCards.retrieveRateSchedule({
          rate_card_id: rateCardId,
          starting_at: startingAt,
          ...(nextPage === undefined ? {} : { next_page: nextPage }),
        }),
      );

      rates.push(...response.data);
      const responseNextPage = response.next_page || undefined;

      if (responseNextPage === undefined) {
        return rates;
      }
      if (seenPageCursors.has(responseNextPage)) {
        throw new Error('Metronome rate-schedule pagination cursor repeated');
      }
      seenPageCursors.add(responseNextPage);
      nextPage = responseNextPage;
    }

    throw new Error('Metronome rate-schedule pagination exceeded its limit');
  }

  private isActiveAt(
    startingAt: string | null | undefined,
    endingBefore: string | null | undefined,
    at: number,
  ): boolean {
    const starts =
      startingAt === null || startingAt === undefined
        ? Number.NEGATIVE_INFINITY
        : Date.parse(startingAt);
    const ends =
      endingBefore === null || endingBefore === undefined
        ? Number.POSITIVE_INFINITY
        : Date.parse(endingBefore);

    return Number.isFinite(at) && starts <= at && at < ends;
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

  async listInvoicesFirstPage({
    contractId,
    customerId,
    endingBefore,
    startingOn,
  }: MetronomeInvoiceListInput): Promise<MetronomeInvoicePage> {
    const client = this.getClient();
    const response = await this.execute(() =>
      client.v1.customers.invoices.list({
        contract_id: contractId,
        customer_id: customerId,
        ending_before: endingBefore,
        starting_on: startingOn,
      }),
    );

    return {
      hasNextPage: response.hasNextPage(),
      invoices: response.data.map((invoice) => ({
        contractId: invoice.contract_id ?? null,
        creditType: {
          id: invoice.credit_type.id,
          name: invoice.credit_type.name,
        },
        customerId: invoice.customer_id,
        endingBefore: invoice.end_timestamp ?? null,
        externalInvoice:
          invoice.external_invoice == null
            ? null
            : {
                billingProvider: invoice.external_invoice.billing_provider_type,
                externalPaymentId:
                  invoice.external_invoice.external_payment_id ?? null,
                externalStatus:
                  invoice.external_invoice.external_status ?? null,
                invoiceId: invoice.external_invoice.invoice_id ?? null,
                invoicedTotal: invoice.external_invoice.invoiced_total ?? null,
              },
        id: invoice.id,
        lines: invoice.line_items.map((line) => ({
          endingBefore: line.ending_before ?? null,
          hasAppliedCommitOrCredit: line.applied_commit_or_credit !== undefined,
          isProrated: line.is_prorated ?? null,
          productId: line.product_id ?? null,
          quantity: line.quantity ?? null,
          startingAt: line.starting_at ?? null,
          subscriptionId: line.subscription_id ?? null,
          total: line.total,
          type: line.type,
          unitPrice: line.unit_price ?? null,
        })),
        startingAt: invoice.start_timestamp ?? null,
        status: invoice.status,
        total: invoice.total,
      })),
    };
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
    const chargeProductId = this.twentyConfigService.get(
      'MANAGED_OPENROUTER_CHARGE_PRODUCT_ID',
    );
    const creditProductId = this.twentyConfigService.get(
      'MANAGED_OPENROUTER_CREDIT_PRODUCT_ID',
    );
    const balance = await this.getApplicableSponsoredCreditBalance(
      client,
      customerId,
      chargeProductId,
      creditProductId,
    );
    return { balance };
  }
  private async getApplicableSponsoredCreditBalance(
    client: Metronome,
    customerId: string,
    chargeProductId: string,
    creditProductId: string,
  ): Promise<number> {
    let nextPage: string | null = null;
    const requestedPages = new Set<string>();
    let balance = 0;

    do {
      const response = await this.execute(() =>
        client.v1.contracts.listBalances({
          customer_id: customerId,
          include_balance: true,
          limit: BALANCE_PAGE_LIMIT,
          ...(nextPage === null ? {} : { next_page: nextPage }),
        }),
      );
      const listedBalances = response.data;

      if (!Array.isArray(listedBalances)) {
        throw new MetronomeClientException(
          MetronomeClientExceptionCode.REQUEST_FAILED,
        );
      }
      for (const listedBalance of listedBalances as MetronomeBalanceResponse[]) {
        const isPrepaidCommit =
          listedBalance.type === 'PREPAID' &&
          listedBalance.product?.id === creditProductId;
        const isSponsoredCredit =
          listedBalance.type === 'CREDIT' &&
          listedBalance.product?.id === creditProductId &&
          listedBalance.custom_fields?.myah_managed_openrouter === 'sponsored';
        if (!isPrepaidCommit && !isSponsoredCredit) {
          continue;
        }

        const applicableProductIds = listedBalance.applicable_product_ids;
        if (
          !Array.isArray(applicableProductIds) ||
          !applicableProductIds.includes(chargeProductId)
        ) {
          continue;
        }

        const listedBalanceAmount = listedBalance.balance;
        if (
          typeof listedBalanceAmount !== 'number' ||
          !Number.isSafeInteger(listedBalanceAmount) ||
          !Number.isFinite(listedBalanceAmount) ||
          listedBalanceAmount < 0
        ) {
          throw new MetronomeClientException(
            MetronomeClientExceptionCode.REQUEST_FAILED,
          );
        }

        balance += listedBalanceAmount;
        if (!Number.isSafeInteger(balance)) {
          throw new MetronomeClientException(
            MetronomeClientExceptionCode.REQUEST_FAILED,
          );
        }
      }

      const nextPageValue = response.next_page;
      if (typeof nextPageValue !== 'string') {
        throw new MetronomeClientException(
          MetronomeClientExceptionCode.REQUEST_FAILED,
        );
      }
      if (nextPageValue === '') {
        nextPage = null;
      } else {
        if (requestedPages.has(nextPageValue)) {
          throw new MetronomeClientException(
            MetronomeClientExceptionCode.REQUEST_FAILED,
          );
        }
        requestedPages.add(nextPageValue);
        nextPage = nextPageValue;
      }
    } while (nextPage !== null);

    return balance;
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

  private requireUpdatedSubscriptionReceipt(
    edit:
      | {
          id?: string;
          update_subscriptions?: Array<{ id: string }>;
        }
      | undefined,
    expectedSubscriptionId: string,
  ): MetronomeSubscriptionReceipt {
    const subscriptionId =
      edit?.update_subscriptions?.length === 1
        ? edit.update_subscriptions[0].id
        : undefined;

    if (
      edit?.id?.trim() === undefined ||
      edit.id.trim() === '' ||
      subscriptionId?.trim() === undefined ||
      subscriptionId.trim() === '' ||
      subscriptionId !== expectedSubscriptionId
    ) {
      throw new MetronomeClientException(
        MetronomeClientExceptionCode.CREATE_OUTCOME_UNCERTAIN,
      );
    }

    return {
      metronomeEditId: edit.id,
      subscriptionId,
    };
  }

  private requirePaymentGatedPrepaidCommitEditReceipt(
    response: ContractEditResponse.Data,
    expectedContractId: string,
    expectedCommitmentId: string,
    commitField: 'archive_commits' | 'update_commits',
  ): { metronomeEditId: string } {
    const edit = response.edit;
    const commits = edit?.[commitField];
    const commitmentId = commits?.length === 1 ? commits[0].id : undefined;

    if (
      response.id !== expectedContractId ||
      !edit?.id?.trim() ||
      !commitmentId?.trim() ||
      commitmentId !== expectedCommitmentId
    ) {
      throw new MetronomeClientException(
        MetronomeClientExceptionCode.CREATE_OUTCOME_UNCERTAIN,
      );
    }

    return { metronomeEditId: edit.id };
  }

  private hasPaymentGatedPrepaidCommitFundingEvidence(
    commit: Commit,
    input: MetronomePaymentGatedPrepaidCommitInput,
  ): boolean {
    return (
      commit.custom_fields?.myah_funding_action_id === input.fundingActionId &&
      commit.custom_fields?.myah_funding_identity === input.fundingIdentity
    );
  }

  private hasPartialPaymentGatedPrepaidCommitFundingEvidence(
    commit: Commit,
    input: MetronomePaymentGatedPrepaidCommitInput,
  ): boolean {
    const customFields = commit.custom_fields;

    return (
      customFields?.myah_funding_action_id === input.fundingActionId ||
      customFields?.myah_funding_identity === input.fundingIdentity
    );
  }

  private async listPaymentGatedPrepaidCommits(
    client: Metronome,
    customerId: string,
    commitmentId?: string,
  ): Promise<Commit[]> {
    const commits: Commit[] = [];
    const seenPageCursors = new Set<string>();
    let nextPage: string | undefined;

    for (let page = 1; page <= METRONOME_MAX_LIST_PAGES; page += 1) {
      const response = await this.execute(() =>
        client.v1.customers.commits.list({
          ...(commitmentId === undefined ? {} : { commit_id: commitmentId }),
          customer_id: customerId,
          include_archived: true,
          include_contract_commits: true,
          ...(nextPage === undefined ? {} : { next_page: nextPage }),
        }),
      );

      if (!Array.isArray(response.data) || typeof response.next_page !== 'string') {
        throw new Error('Metronome commitment pagination response is invalid');
      }
      commits.push(...response.data);

      if (response.next_page === '') {
        return commits;
      }
      if (seenPageCursors.has(response.next_page)) {
        throw new Error('Metronome commitment pagination cursor repeated');
      }
      seenPageCursors.add(response.next_page);
      nextPage = response.next_page;
    }

    throw new Error('Metronome commitment pagination exceeded its limit');
  }

  private getPaymentGatedPrepaidCommitRecoveryDetails(
    commit: MetronomePaymentGatedPrepaidCommitCommercialRecord,
    input: MetronomePaymentGatedPrepaidCommitInput,
    startingAt: string,
    endingBefore: string,
  ): {
    accessScheduleItemId: string;
    invoiceId: string | null;
    invoiceScheduleItemId: string;
  } | null {
    const accessScheduleItems = commit.access_schedule?.schedule_items;
    const invoiceScheduleItems = commit.invoice_schedule?.schedule_items;

    if (
      commit.id.trim() === '' ||
      commit.type !== 'PREPAID' ||
      commit.product.id !== input.commitmentProductId ||
      commit.applicable_product_ids?.length !== 1 ||
      commit.applicable_product_ids[0] !== input.chargeProductId ||
      commit.priority !== 100 ||
      accessScheduleItems?.length !== 1 ||
      invoiceScheduleItems?.length !== 1
    ) {
      return null;
    }

    const accessScheduleItem = accessScheduleItems[0];
    const invoiceScheduleItem = invoiceScheduleItems[0];
    const accessScheduleItemId = accessScheduleItem.id;
    const invoiceScheduleItemId = invoiceScheduleItem.id;
    const invoiceId = invoiceScheduleItem.invoice_id ?? null;

    if (
      accessScheduleItemId.trim() === '' ||
      invoiceScheduleItemId.trim() === '' ||
      accessScheduleItem.amount !== input.principalCents ||
      accessScheduleItem.starting_at !== startingAt ||
      accessScheduleItem.ending_before !== endingBefore ||
      invoiceScheduleItem.amount !== input.principalCents ||
      invoiceScheduleItem.timestamp !== startingAt ||
      (invoiceId !== null && invoiceId.trim() === '')
    ) {
      return null;
    }

    return { accessScheduleItemId, invoiceId, invoiceScheduleItemId };
  }

  private validatePaymentGatedPrepaidCommitExpiryInput(
    input: MetronomePaymentGatedPrepaidCommitExpiryInput,
  ): void {
    this.validateSubscriptionDate(input.paidAt);
    this.validatePaymentGatedPrepaidCommitIdentifiers([
      input.accessScheduleItemId,
      input.commitmentId,
      input.contractId,
      input.customerId,
      input.uniquenessKey,
    ]);
  }

  private validatePaymentGatedPrepaidCommitArchiveInput(
    input: MetronomePaymentGatedPrepaidCommitArchiveInput,
  ): void {
    this.validatePaymentGatedPrepaidCommitIdentifiers([
      input.commitmentId,
      input.contractId,
      input.customerId,
      input.uniquenessKey,
    ]);
  }

  private validatePaymentGatedPrepaidCommitIdentifiers(
    values: string[],
  ): void {
    if (values.some((value) => typeof value !== 'string' || value.trim() === '')) {
      throw new Error('Metronome payment-gated commit identifiers are required');
    }
  }

  private validatePositiveSubscriptionQuantity(quantity: number): void {
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      throw new Error(
        'Metronome subscription quantity must be a safe positive integer',
      );
    }
  }

  private validateNonnegativeSubscriptionQuantity(quantity: number): void {
    if (!Number.isSafeInteger(quantity) || quantity < 0) {
      throw new Error(
        'Metronome subscription quantity must be a safe nonnegative integer',
      );
    }
  }

  private validateSubscriptionDate(value: string): void {
    const parsed = new Date(value);

    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
      throw new Error('Metronome subscription date must be an ISO instant');
    }
  }

  private validateProrationRounding(
    rounding: { decimalPlaces: number } | undefined,
  ): void {
    if (
      rounding !== undefined &&
      Number.isSafeInteger(rounding.decimalPlaces) === false
    ) {
      throw new Error(
        'Metronome proration decimal places must be a safe integer',
      );
    }
  }
  private validatePaymentGatedPrepaidCommitInput(
    input: MetronomePaymentGatedPrepaidCommitInput,
  ): void {
    if (!Number.isSafeInteger(input.principalCents) || input.principalCents <= 0) {
      throw new Error(
        'Metronome payment-gated commit amount must be positive safe cents',
      );
    }

    this.validateSubscriptionDate(input.purchaseAt);
    this.validatePaymentGatedPrepaidCommitIdentifiers([
      input.chargeProductId,
      input.commitmentProductId,
      input.contractId,
      input.customerId,
      input.fundingActionId,
      input.fundingIdentity,
      input.uniquenessKey,
    ]);
  }

  private addCalendarMonths(value: string, months: number): string {
    const date = new Date(value);
    const day = date.getUTCDate();
    const month = date.getUTCMonth() + months;
    const year = date.getUTCFullYear() + Math.floor(month / 12);
    const targetMonth = month % 12;

    date.setUTCDate(1);
    date.setUTCFullYear(year, targetMonth);
    date.setUTCDate(
      Math.min(day, new Date(Date.UTC(year, targetMonth + 1, 0)).getUTCDate()),
    );

    return date.toISOString();
  }


  private toWriteException(error: unknown): MetronomeClientException {
    if (error instanceof MetronomeClientException) {
      return error;
    }

    const status = this.getErrorStatus(error);

    return new MetronomeClientException(
      this.isUniquenessConflict(error)
        ? MetronomeClientExceptionCode.CONFLICT
        : status === 429
          ? MetronomeClientExceptionCode.RATE_LIMITED
          : status === undefined || status >= 500
            ? MetronomeClientExceptionCode.CREATE_OUTCOME_UNCERTAIN
            : MetronomeClientExceptionCode.REQUEST_FAILED,
    );
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

  private isUniquenessConflict(error: unknown): boolean {
    const status = this.getErrorStatus(error);

    return (
      status === 409 ||
      (status === 422 &&
        this.getErrorMessage(error)
          ?.toLowerCase()
          .includes('uniqueness key already exists') === true)
    );
  }

  private getErrorMessage(error: unknown): string | undefined {
    return typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      typeof error.message === 'string'
      ? error.message
      : undefined;
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
    if (
      !this.twentyConfigService.get('METRONOME_ENABLED') &&
      !this.twentyConfigService.get('MANAGED_EMAIL_ENABLED')
    ) {
      throw new MetronomeClientException(
        MetronomeClientExceptionCode.CONFIGURATION_DISABLED,
      );
    }

    if (this.client) {
      return this.client;
    }

    try {
      this.client = new Metronome({
        baseURL: this.baseURL,
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
