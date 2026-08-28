import { Injectable } from '@nestjs/common';

import { ManagedEmailAcquisitionOperationEntity } from 'src/engine/core-modules/managed-email/entities/managed-email-acquisition-operation.entity';
import { type ManagedEmailAcquisitionMode } from 'src/engine/core-modules/managed-email/enums/managed-email-acquisition-mode.enum';
import { type ManagedEmailQuote } from 'src/engine/core-modules/managed-email/types/managed-email-quote.type';
import {
  type ManagedEmailCorrelatedSubscriptionLine,
  type ManagedEmailExpectedLineItem,
} from 'src/engine/core-modules/managed-email/types/managed-email-persistence.type';
import { METRONOME_USD_CREDIT_TYPE_NAME } from 'src/engine/core-modules/managed-provider-billing/constants/metronome-workspace-alias-prefix.constant';
import { MetronomeClientService } from 'src/engine/core-modules/managed-provider-billing/services/metronome-client.service';
import {
  MetronomeClientException,
  MetronomeClientExceptionCode,
} from 'src/engine/core-modules/managed-provider-billing/metronome-client.exception';
import { type MetronomeSubscriptionReceipt } from 'src/engine/core-modules/managed-provider-billing/types/metronome-subscription.type';
import { MetronomeWorkspaceCustomerService } from 'src/engine/core-modules/managed-provider-billing/services/metronome-workspace-customer.service';
import { matchExactPaidMetronomeInvoices } from 'src/engine/core-modules/managed-provider-billing/utils/match-exact-paid-metronome-invoice.util';
import { ManagedProviderStripeService } from 'src/engine/core-modules/managed-provider-billing/stripe/managed-provider-stripe.service';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';

import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { type WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

export type BeginManagedEmailPurchaseInput = Readonly<{
  acquisitionMode: ManagedEmailAcquisitionMode;
  actorWorkspaceMemberId: string;
  idempotencyKey: string;
  operationId: string;
  providerConfigurationKey: string;
  readinessPolicyVersion: string;
  quote: ManagedEmailQuote;
  workspaceId: string;
}>;

@Injectable()
export class ManagedEmailSubscriptionService {
  constructor(
    @InjectWorkspaceScopedRepository(ManagedEmailAcquisitionOperationEntity)
    private readonly acquisitionOperationRepository: WorkspaceScopedRepository<ManagedEmailAcquisitionOperationEntity>,
    private readonly metronomeClientService: MetronomeClientService,
    private readonly metronomeWorkspaceCustomerService: MetronomeWorkspaceCustomerService,
    private readonly managedProviderStripeService: ManagedProviderStripeService,
    private readonly twentyConfigService: TwentyConfigService,
  ) {}

  async beginPurchase(
    input: BeginManagedEmailPurchaseInput,
  ): Promise<ManagedEmailAcquisitionOperationEntity> {
    const operation = await this.createPurchaseOperation(input);
    return this.continueSubscriptionCreation({
      operationId: operation.id,
      workspaceId: input.workspaceId,
    });
  }
  async createPurchaseOperation(
    input: BeginManagedEmailPurchaseInput,
  ): Promise<ManagedEmailAcquisitionOperationEntity> {
    this.validateInput(input);
    const prior = await this.acquisitionOperationRepository.findOneBy(
      input.workspaceId,
      { idempotencyKey: input.idempotencyKey },
    );
    if (prior !== null) {
      if (
        prior.id !== input.operationId ||
        prior.quoteHash !== input.quote.quoteHash ||
        prior.proposalHash !== input.quote.proposalHash ||
        prior.acquisitionMode !== input.acquisitionMode ||
        prior.authorizedActorWorkspaceMemberId !==
          input.actorWorkspaceMemberId ||
        prior.providerConfigurationKey !== input.providerConfigurationKey ||
        prior.readinessPolicyVersion !== input.readinessPolicyVersion
      ) {
        throw new Error('Managed email purchase idempotency conflict');
      }
      return prior;
    }
    const servicePeriodStart = new Date(
      Math.min(
        ...input.quote.lines.map(({ startingAt }) => Date.parse(startingAt)),
      ),
    );
    const servicePeriodEnd = new Date(
      Math.max(
        ...input.quote.lines.map(({ endingBefore }) =>
          Date.parse(endingBefore),
        ),
      ),
    );
    const expectedLineItems: readonly ManagedEmailExpectedLineItem[] =
      input.quote.lines.map((line) => ({
        billingFrequency: line.billingFrequency,
        currency: 'USD',
        metronomeProductId: line.metronomeProductId,
        periodEnd: line.endingBefore,
        periodStart: line.startingAt,
        productKey: line.productKey,
        productTag: line.productTag,
        quantity: line.quantity,
        totalCents: line.amountCents,
        unitPriceCents: line.unitPriceCents,
      }));
    return this.acquisitionOperationRepository.save(input.workspaceId, {
      id: input.operationId,
      acquisitionMode: input.acquisitionMode,
      authorizedActorWorkspaceMemberId: input.actorWorkspaceMemberId,
      catalogVersion: input.quote.catalogVersion,
      correlatedSubscriptionLines: null,
      currency: 'USD',
      expectedAmountCents: String(input.quote.dueTodayCents),
      expectedLineItems,
      paymentReceipts: null,
      idempotencyKey: input.idempotencyKey,
      metronomeContractId: null,
      metronomeCustomerId: null,
      metronomeEditIds: null,
      metronomeInvoiceId: null,
      metronomeRateCardAlias: input.quote.metronomeRateCardAlias,
      metronomeRateCardId: input.quote.metronomeRateCardId,
      metronomeSubscriptionIds: null,
      nextReconciliationAt: new Date(),
      paymentStatus: null,
      proposalHash: input.quote.proposalHash,
      providerIntentHash: null,
      providerConfigurationKey: input.providerConfigurationKey,
      providerOutcome: null,
      providerReceipt: null,
      quoteHash: input.quote.quoteHash,
      reconciliationAttemptCount: 0,
      resourceSnapshot: input.quote.resourceSnapshot,
      readinessPolicyVersion: input.readinessPolicyVersion,
      safeFailureCode: null,
      servicePeriodEnd,
      servicePeriodStart,
      state: 'CREATING_SUBSCRIPTIONS',
      workspaceId: input.workspaceId,
    });
  }
  async continueSubscriptionCreation({
    operationId,
    workspaceId,
  }: {
    operationId: string;
    workspaceId: string;
  }): Promise<ManagedEmailAcquisitionOperationEntity> {
    const operation = await this.acquisitionOperationRepository.findOneBy(
      workspaceId,
      { id: operationId },
    );
    if (operation === null) {
      throw new Error('Managed email acquisition operation was not found');
    }
    if (operation.state !== 'CREATING_SUBSCRIPTIONS') {
      return operation;
    }
    const paymentMethod =
      await this.managedProviderStripeService.assertWorkspacePaymentMethodReady(
        {
          metronomeBaseUrlEnvironment: this.twentyConfigService.get(
            'METRONOME_BASE_URL_ENVIRONMENT',
          )!,
          workspaceId,
        },
      );
    const customerId =
      await this.metronomeWorkspaceCustomerService.ensureWorkspaceCustomer(
        workspaceId,
      );
    await this.metronomeWorkspaceCustomerService.ensureStripeBillingConfiguration(
      workspaceId,
      paymentMethod.stripeCustomerId,
    );
    const contract =
      await this.metronomeWorkspaceCustomerService.ensureWorkspaceManagedEmailContract(
        workspaceId,
      );
    if (contract.rateCardId !== operation.metronomeRateCardId) {
      throw new Error('Managed email subscription rate card mismatch');
    }
    const contractId = contract.contractId;
    if (
      (operation.metronomeCustomerId !== null &&
        operation.metronomeCustomerId !== customerId) ||
      (operation.metronomeContractId !== null &&
        operation.metronomeContractId !== contractId)
    ) {
      throw new Error('Managed email subscription identity conflict');
    }
    await this.metronomeClientService.assertRateCardLineItems({
      lines: operation.expectedLineItems.map((line) => ({
        billingFrequency: line.billingFrequency,
        productId: line.metronomeProductId,
        startingAt: line.periodStart,
        unitPriceCents: line.unitPriceCents,
      })),
      rateCardId: operation.metronomeRateCardId,
    });
    await this.acquisitionOperationRepository.update(
      workspaceId,
      { id: operation.id, state: 'CREATING_SUBSCRIPTIONS' },
      {
        metronomeContractId: contractId,
        metronomeCustomerId: customerId,
      },
    );
    operation.metronomeContractId = contractId;
    operation.metronomeCustomerId = customerId;
    const metronomeEditIds = [...(operation.metronomeEditIds ?? [])];
    const metronomeSubscriptionIds = [
      ...(operation.metronomeSubscriptionIds ?? []),
    ];
    if (
      metronomeEditIds.length !== metronomeSubscriptionIds.length ||
      metronomeSubscriptionIds.length > operation.expectedLineItems.length
    ) {
      throw new Error('Managed email subscription correlation is incomplete');
    }
    for (
      let index = metronomeSubscriptionIds.length;
      index < operation.expectedLineItems.length;
      index += 1
    ) {
      const line = operation.expectedLineItems[index];
      const subscriptionInput = {
        billingFrequency: line.billingFrequency,
        contractId,
        customerId,
        productId: line.metronomeProductId,
        proration: {
          invoiceBehavior: 'BILL_IMMEDIATELY' as const,
          isProrated: false,
        },
        quantity: line.quantity,
        startingAt: line.periodStart,
        uniquenessKey: `${operation.id}:${line.productKey}`,
      };
      let receipt: MetronomeSubscriptionReceipt;

      try {
        receipt =
          await this.metronomeClientService.addSubscription(subscriptionInput);
      } catch (error) {
        if (
          !(error instanceof MetronomeClientException) ||
          ![
            MetronomeClientExceptionCode.CONFLICT,
            MetronomeClientExceptionCode.CREATE_OUTCOME_UNCERTAIN,
          ].includes(error.code)
        ) {
          throw error;
        }
        const recovered =
          await this.metronomeClientService.recoverAddedSubscription(
            subscriptionInput,
          );

        if (recovered === null) {
          throw error;
        }
        receipt = recovered;
      }
      metronomeEditIds.push(receipt.metronomeEditId);
      metronomeSubscriptionIds.push(receipt.subscriptionId);
      await this.acquisitionOperationRepository.update(
        workspaceId,
        { id: operation.id, state: 'CREATING_SUBSCRIPTIONS' },
        {
          metronomeEditIds: [...metronomeEditIds],
          metronomeSubscriptionIds: [...metronomeSubscriptionIds],
        },
      );
      operation.metronomeEditIds = [...metronomeEditIds];
      operation.metronomeSubscriptionIds = [...metronomeSubscriptionIds];
    }
    await this.acquisitionOperationRepository.update(
      workspaceId,
      { id: operation.id, state: 'CREATING_SUBSCRIPTIONS' },
      { state: 'PAYMENT_PENDING' },
    );
    operation.state = 'PAYMENT_PENDING';
    return operation;
  }

  async reconcilePayment({
    operationId,
    workspaceId,
  }: {
    operationId: string;
    workspaceId: string;
  }): Promise<ManagedEmailAcquisitionOperationEntity> {
    const operation = await this.acquisitionOperationRepository.findOneBy(
      workspaceId,
      { id: operationId },
    );

    if (operation === null || operation.workspaceId !== workspaceId) {
      throw new Error('Managed email acquisition operation was not found');
    }

    if (operation.state === 'PAYMENT_PAID') {
      return operation;
    }

    const subscriptionIds = operation.metronomeSubscriptionIds;
    const customerId = operation.metronomeCustomerId;
    const contractId = operation.metronomeContractId;

    if (
      operation.state !== 'PAYMENT_PENDING' ||
      customerId === null ||
      contractId === null ||
      subscriptionIds === null ||
      subscriptionIds.length !== operation.expectedLineItems.length
    ) {
      throw new Error('Managed email payment correlation is incomplete');
    }

    const rateCard = await this.metronomeClientService.getRateCard(
      operation.metronomeRateCardId,
    );

    if (
      rateCard.id !== operation.metronomeRateCardId ||
      rateCard.fiatCreditType === null ||
      rateCard.fiatCreditType.id.trim() === '' ||
      rateCard.fiatCreditType.name !== METRONOME_USD_CREDIT_TYPE_NAME
    ) {
      throw new Error('Managed email payment correlation is incomplete');
    }
    const fiatCreditType = rateCard.fiatCreditType;

    const page = await this.metronomeClientService.listInvoicesFirstPage({
      contractId,
      customerId,
      endingBefore: operation.servicePeriodEnd.toISOString(),
      startingOn: operation.servicePeriodStart.toISOString(),
    });
    const correlatedSubscriptionLines: ManagedEmailCorrelatedSubscriptionLine[] =
      operation.expectedLineItems.map((line, index) => ({
        endingBefore: line.periodEnd,
        isProrated: false,
        productId: line.metronomeProductId,
        quantity: line.quantity,
        startingAt: line.periodStart,
        subscriptionId: subscriptionIds[index],
        total: line.totalCents,
        unitPrice: line.unitPriceCents,
      }));
    const expectedInvoices = [
      {
        contractId,
        customerId,
        endingBefore: new Date(
          Math.max(
            ...operation.expectedLineItems.map(({ periodEnd }) =>
              Date.parse(periodEnd),
            ),
          ),
        ).toISOString(),
        lines: correlatedSubscriptionLines,
        startingAt: new Date(
          Math.min(
            ...operation.expectedLineItems.map(({ periodStart }) =>
              Date.parse(periodStart),
            ),
          ),
        ).toISOString(),
        total: correlatedSubscriptionLines.reduce(
          (sum, line) => sum + line.total,
          0,
        ),
        usdRateCardProof: {
          contractId,
          fiatCreditTypeId: fiatCreditType.id,
          fiatCreditTypeName: fiatCreditType.name,
          rateCardId: rateCard.id,
        },
      },
    ];
    if (
      expectedInvoices.reduce((sum, invoice) => sum + invoice.total, 0) !==
      Number(operation.expectedAmountCents)
    ) {
      throw new Error('Managed email payment correlation is incomplete');
    }
    const receipts = matchExactPaidMetronomeInvoices(page, expectedInvoices);

    if (receipts === null) {
      return operation;
    }
    for (const [index, receipt] of receipts.entries()) {
      await this.managedProviderStripeService.assertPaidExternalInvoice({
        currency: operation.currency,
        expectedAmountCents: expectedInvoices[index].total,
        expectedPaymentIntentId: receipt.externalPaymentId,
        metronomeBaseUrlEnvironment: this.twentyConfigService.get(
          'METRONOME_BASE_URL_ENVIRONMENT',
        )!,
        metronomeInvoiceId: receipt.invoiceId,
        stripeInvoiceId: receipt.externalInvoiceId,
        workspaceId,
      });
    }

    const patch = {
      correlatedSubscriptionLines,
      paymentReceipts: receipts.map((receipt) => ({
        externalInvoiceId: receipt.externalInvoiceId,
        externalPaymentId: receipt.externalPaymentId,
        metronomeInvoiceId: receipt.invoiceId,
      })),
      paymentStatus: 'PAID',
      state: 'PAYMENT_PAID',
    };

    await this.acquisitionOperationRepository.update(
      workspaceId,
      { id: operation.id },
      patch,
    );
    Object.assign(operation, patch);

    return operation;
  }

  private validateInput(input: BeginManagedEmailPurchaseInput): void {
    if (
      input.workspaceId !== input.quote.workspaceId ||
      !input.workspaceId.trim() ||
      !input.actorWorkspaceMemberId.trim() ||
      !input.idempotencyKey.trim() ||
      !input.operationId.trim() ||
      !input.providerConfigurationKey.trim() ||
      !input.readinessPolicyVersion.trim() ||
      !input.quote.proposalHash.trim() ||
      !input.quote.quoteHash.trim() ||
      input.quote.lines.length !== 3
    ) {
      throw new Error('Managed email purchase input is invalid');
    }
  }
}
