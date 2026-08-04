import { Injectable } from '@nestjs/common';

import { ManagedEmailAcquisitionOperationEntity } from 'src/engine/core-modules/managed-email/entities/managed-email-acquisition-operation.entity';
import { type ManagedEmailAcquisitionMode } from 'src/engine/core-modules/managed-email/enums/managed-email-acquisition-mode.enum';
import { type ManagedEmailQuote } from 'src/engine/core-modules/managed-email/types/managed-email-quote.type';
import {
  type ManagedEmailCorrelatedSubscriptionLine,
  type ManagedEmailExpectedLineItem,
} from 'src/engine/core-modules/managed-email/types/managed-email-persistence.type';
import { MetronomeClientService } from 'src/engine/core-modules/managed-provider-billing/services/metronome-client.service';
import { MetronomeWorkspaceCustomerService } from 'src/engine/core-modules/managed-provider-billing/services/metronome-workspace-customer.service';
import { matchExactPaidMetronomeInvoice } from 'src/engine/core-modules/managed-provider-billing/utils/match-exact-paid-metronome-invoice.util';
import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { type WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

export type BeginManagedEmailPurchaseInput = Readonly<{
  acquisitionMode: ManagedEmailAcquisitionMode;
  actorWorkspaceMemberId: string;
  idempotencyKey: string;
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
  ) {}

  async beginPurchase(
    input: BeginManagedEmailPurchaseInput,
  ): Promise<ManagedEmailAcquisitionOperationEntity> {
    this.validateInput(input);
    const prior = await this.acquisitionOperationRepository.findOneBy(
      input.workspaceId,
      { idempotencyKey: input.idempotencyKey },
    );

    if (prior !== null) {
      if (
        prior.quoteHash !== input.quote.quoteHash ||
        prior.proposalHash !== input.quote.proposalHash ||
        prior.acquisitionMode !== input.acquisitionMode ||
        prior.authorizedActorWorkspaceMemberId !== input.actorWorkspaceMemberId
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
    const operation: ManagedEmailAcquisitionOperationEntity =
      await this.acquisitionOperationRepository.save(input.workspaceId, {
        acquisitionMode: input.acquisitionMode,
        authorizedActorWorkspaceMemberId: input.actorWorkspaceMemberId,
        catalogVersion: input.quote.catalogVersion,
        correlatedSubscriptionLines: null,
        currency: 'USD',
        expectedAmountCents: String(input.quote.dueTodayCents),
        expectedLineItems,
        externalInvoiceId: null,
        externalPaymentId: null,
        idempotencyKey: input.idempotencyKey,
        metronomeContractId: null,
        metronomeCustomerId: null,
        metronomeEditIds: null,
        metronomeInvoiceId: null,
        metronomeRateCardAlias: input.quote.metronomeRateCardAlias,
        metronomeRateCardId: input.quote.metronomeRateCardId,
        metronomeSubscriptionIds: null,
        nextReconciliationAt: null,
        paymentStatus: null,
        proposalHash: input.quote.proposalHash,
        providerIntentHash: null,
        providerOutcome: null,
        providerReceipt: null,
        quoteHash: input.quote.quoteHash,
        reconciliationAttemptCount: 0,
        resourceSnapshot: input.quote.resourceSnapshot,
        safeFailureCode: null,
        servicePeriodEnd,
        servicePeriodStart,
        state: 'CREATING_SUBSCRIPTIONS',
        workspaceId: input.workspaceId,
      });
    const customerId =
      await this.metronomeWorkspaceCustomerService.ensureWorkspaceCustomer(
        input.workspaceId,
      );
    const contractId =
      await this.metronomeWorkspaceCustomerService.ensureWorkspaceManagedEmailContract(
        input.workspaceId,
      );

    await this.acquisitionOperationRepository.update(
      input.workspaceId,
      { id: operation.id },
      {
        metronomeContractId: contractId,
        metronomeCustomerId: customerId,
      },
    );
    operation.metronomeContractId = contractId;
    operation.metronomeCustomerId = customerId;

    const metronomeEditIds: string[] = [];
    const metronomeSubscriptionIds: string[] = [];

    for (const line of input.quote.lines) {
      const receipt = await this.metronomeClientService.addSubscription({
        billingFrequency: line.billingFrequency,
        contractId,
        customerId,
        productId: line.metronomeProductId,
        proration: {
          invoiceBehavior: 'BILL_IMMEDIATELY',
          isProrated: false,
        },
        quantity: line.quantity,
        startingAt: line.startingAt,
        uniquenessKey: `${operation.id}:${line.productKey}`,
      });

      metronomeEditIds.push(receipt.metronomeEditId);
      metronomeSubscriptionIds.push(receipt.subscriptionId);
      await this.acquisitionOperationRepository.update(
        input.workspaceId,
        { id: operation.id },
        {
          metronomeEditIds: [...metronomeEditIds],
          metronomeSubscriptionIds: [...metronomeSubscriptionIds],
        },
      );
      operation.metronomeEditIds = [...metronomeEditIds];
      operation.metronomeSubscriptionIds = [...metronomeSubscriptionIds];
    }

    await this.acquisitionOperationRepository.update(
      input.workspaceId,
      { id: operation.id },
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
      rateCard.fiatCreditType.name !== 'USD'
    ) {
      throw new Error('Managed email payment correlation is incomplete');
    }

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
    const receipt = matchExactPaidMetronomeInvoice(page, {
      contractId,
      customerId,
      endingBefore: operation.servicePeriodEnd.toISOString(),
      lines: correlatedSubscriptionLines,
      startingAt: operation.servicePeriodStart.toISOString(),
      total: Number(operation.expectedAmountCents),
      usdRateCardProof: {
        contractId,
        fiatCreditTypeId: rateCard.fiatCreditType.id,
        fiatCreditTypeName: rateCard.fiatCreditType.name,
        rateCardId: rateCard.id,
      },
    });

    if (receipt === null) {
      return operation;
    }

    const patch = {
      correlatedSubscriptionLines,
      externalInvoiceId: receipt.externalInvoiceId,
      externalPaymentId: receipt.externalPaymentId,
      metronomeInvoiceId: receipt.invoiceId,
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
      !input.quote.proposalHash.trim() ||
      !input.quote.quoteHash.trim() ||
      input.quote.lines.length !== 3
    ) {
      throw new Error('Managed email purchase input is invalid');
    }
  }
}
