import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { MyahWorkspaceInstallationEntity } from 'src/engine/core-modules/customer-account/entities/myah-workspace-installation.entity';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';

import { DeliverManagedProviderUsageJob } from '../jobs/deliver-managed-provider-usage.job';
import { ManagedProviderOperationEntity } from '../entities/managed-provider-operation.entity';
import { ManagedProviderOperationState } from '../enums/managed-provider-operation-state.enum';
import { type ReserveManagedProviderOperationInput } from '../types/reserve-managed-provider-operation.input';
import { type CompleteManagedProviderOperationInput } from '../types/complete-managed-provider-operation.input';
import { type DeliverManagedProviderUsageJobData } from '../types/deliver-managed-provider-usage-job-data.type';
import {
  ManagedProviderBillingException,
  ManagedProviderBillingExceptionCode,
} from '../managed-provider-billing.exception';
import {
  MetronomeClientException,
  MetronomeClientExceptionCode,
} from '../metronome-client.exception';
import { validateSafeMetronomeEventProperties } from '../utils/validate-safe-metronome-event-properties.util';
import { getValidatedMetronomeUsageAmountCents } from '../utils/get-validated-metronome-usage-amount-cents.util';

import { MetronomeClientService } from './metronome-client.service';
import { MetronomeWorkspaceCustomerService } from './metronome-workspace-customer.service';

@Injectable()
export class ManagedProviderOperationService {
  constructor(
    // The journal accepts an explicit workspaceId before request context exists and enforces it on every lookup.
    // eslint-disable-next-line twenty/prefer-workspace-scoped-repository
    @InjectRepository(ManagedProviderOperationEntity)
    private readonly operationRepository: Repository<ManagedProviderOperationEntity>,

    private readonly metronomeClientService: MetronomeClientService,
    private readonly metronomeWorkspaceCustomerService: MetronomeWorkspaceCustomerService,
    private readonly twentyConfigService: TwentyConfigService,

    @InjectMessageQueue(MessageQueue.workspaceQueue)
    private readonly messageQueueService: MessageQueueService,
  ) {}

  async reserveOperation(
    input: ReserveManagedProviderOperationInput,
  ): Promise<ManagedProviderOperationEntity> {
    if (!this.twentyConfigService.get('METRONOME_ENABLED')) {
      throw new MetronomeClientException(
        MetronomeClientExceptionCode.CONFIGURATION_DISABLED,
      );
    }

    const operationInput = {
      ...input,
      maximumUsageProperties: validateSafeMetronomeEventProperties(
        input.maximumUsageProperties,
      ),
    };

    const { expectedProductIds: inputExpectedProductIds, ...operationValues } =
      operationInput;
    const expectedProductIds = this.normalizeExpectedProductIds(
      inputExpectedProductIds,
    );

    const existingOperation = await this.operationRepository.findOneBy({
      requestId: operationInput.requestId,
      workspaceId: operationInput.workspaceId,
    });

    if (existingOperation) {
      return this.getExactReplay(
        existingOperation,
        operationInput,
        expectedProductIds,
      );
    }
    const customerId =
      await this.metronomeWorkspaceCustomerService.ensureWorkspaceCustomer(
        operationInput.workspaceId,
      );
    const contractId =
      await this.metronomeWorkspaceCustomerService.ensureWorkspaceContract(
        operationInput.workspaceId,
      );
    const preview = await this.metronomeClientService.previewUsage({
      customerId,
      eventType: operationInput.metronomeEventType,
      properties: operationInput.maximumUsageProperties,
    });
    const reservedAmountCents = getValidatedMetronomeUsageAmountCents({
      contractId,
      customerId,
      expectedProductIds,
      preview,
    });
    const expectedBillableMetricIds =
      await this.metronomeClientService.getBillableMetricIds(
        expectedProductIds,
      );

    return this.operationRepository.manager.transaction(async (manager) => {
      const installation = await manager.findOne(
        MyahWorkspaceInstallationEntity,
        {
          lock: { mode: 'pessimistic_write' },
          where: { workspaceId: operationInput.workspaceId },
        },
      );

      if (!installation || installation.metronomeCustomerId !== customerId) {
        throw new Error('Metronome workspace customer mapping is unavailable');
      }

      const transactionOperationRepository = manager.getRepository(
        ManagedProviderOperationEntity,
      );
      const concurrentOperation =
        await transactionOperationRepository.findOneBy({
          requestId: operationInput.requestId,
          workspaceId: operationInput.workspaceId,
        });

      if (concurrentOperation) {
        return this.getExactReplay(
          concurrentOperation,
          operationInput,
          expectedProductIds,
        );
      }

      const { balance } =
        await this.metronomeClientService.getPrepaidBalance(customerId);

      if (!Number.isSafeInteger(balance) || balance < 0) {
        throw new Error('Metronome prepaid balance is invalid');
      }

      const activeReservation = await transactionOperationRepository
        .createQueryBuilder('operation')
        .select(
          'COALESCE(SUM("operation"."reservedAmountCents"), 0)',
          'reservedAmountCents',
        )
        .where(
          '"operation"."workspaceId" = :workspaceId AND "operation"."state" IN (:...states)',
          {
            states: [
              ManagedProviderOperationState.RESERVED,
              ManagedProviderOperationState.USAGE_PENDING,
              ManagedProviderOperationState.USAGE_ACCEPTED,
              ManagedProviderOperationState.RECONCILIATION_REQUIRED,
            ],
            workspaceId: operationInput.workspaceId,
          },
        )
        .getRawOne<{ reservedAmountCents: string }>();
      const activeReservationCents = BigInt(
        activeReservation?.reservedAmountCents ?? '0',
      );

      if (BigInt(balance) - activeReservationCents < reservedAmountCents) {
        throw new ManagedProviderBillingException(
          ManagedProviderBillingExceptionCode.INSUFFICIENT_PREPAID_BALANCE,
        );
      }

      const operation = manager.create(ManagedProviderOperationEntity, {
        ...operationValues,
        actualUsageProperties: null,
        expectedProductIds,
        expectedBillableMetricIds,
        completedAt: null,
        lastDeliveryErrorCode: null,
        metronomeAcceptedAt: null,
        nextDeliveryAttemptAt: null,
        providerCostMicrousd: null,
        providerExecutionId: null,
        quotedActualAmountCents: null,
        releasedAt: null,
        reservedAmountCents: reservedAmountCents.toString(),
        settleAfter: null,
        settledAt: null,
        state: ManagedProviderOperationState.RESERVED,
      });

      return manager.save(ManagedProviderOperationEntity, operation);
    });
  }

  async completeOperation(
    input: CompleteManagedProviderOperationInput,
  ): Promise<ManagedProviderOperationEntity> {
    const actualUsageProperties = validateSafeMetronomeEventProperties(
      input.actualUsageProperties,
    );
    this.validateCompletionInput(input);

    const completedOperation =
      await this.operationRepository.manager.transaction(async (manager) => {
        const operation = await manager.findOne(
          ManagedProviderOperationEntity,
          {
            lock: { mode: 'pessimistic_write' },
            where: { id: input.operationId, workspaceId: input.workspaceId },
          },
        );

        if (!operation) {
          throw new Error('Managed provider operation was not found');
        }

        this.validateCompletionIdentity(operation, input);

        const state =
          input.outcome === 'BILLABLE'
            ? ManagedProviderOperationState.USAGE_PENDING
            : input.outcome === 'NON_BILLABLE_FAILURE'
              ? ManagedProviderOperationState.RELEASED
              : ManagedProviderOperationState.RECONCILIATION_REQUIRED;

        if (operation.state !== ManagedProviderOperationState.RESERVED) {
          return this.getExactCompletionReplay(
            operation,
            input,
            actualUsageProperties,
            state,
          );
        }

        const completedAt = new Date();

        return manager.save(ManagedProviderOperationEntity, {
          ...operation,
          actualUsageProperties,
          completedAt,
          completionOutcome: input.outcome,
          nextDeliveryAttemptAt:
            state === ManagedProviderOperationState.USAGE_PENDING
              ? completedAt
              : null,
          providerCostMicrousd: input.providerCostMicrousd,
          providerExecutionId: input.providerExecutionId,
          releasedAt:
            state === ManagedProviderOperationState.RELEASED
              ? completedAt
              : null,
          state,
        });
      });

    if (
      completedOperation.state === ManagedProviderOperationState.USAGE_PENDING
    ) {
      await this.messageQueueService.add<DeliverManagedProviderUsageJobData>(
        DeliverManagedProviderUsageJob.name,
        { operationId: completedOperation.id },
        {
          id: `managed-provider-usage:${completedOperation.id}`,
          retryLimit: 3,
        },
      );
    }

    return completedOperation;
  }

  private validateCompletionInput(
    input: CompleteManagedProviderOperationInput,
  ): void {
    if (
      !['BILLABLE', 'NON_BILLABLE_FAILURE', 'UNKNOWN'].includes(
        input.outcome,
      ) ||
      (input.providerCostMicrousd !== null &&
        !/^(?:0|[1-9]\d*)$/.test(input.providerCostMicrousd)) ||
      (input.providerExecutionId !== null &&
        input.providerExecutionId.trim().length === 0) ||
      (input.outcome === 'BILLABLE' && input.providerExecutionId === null)
    ) {
      throw new Error('Managed provider completion facts are invalid');
    }
  }

  private validateCompletionIdentity(
    operation: ManagedProviderOperationEntity,
    input: CompleteManagedProviderOperationInput,
  ): void {
    if (
      operation.actorUserWorkspaceId !== input.actorUserWorkspaceId ||
      operation.providerKey !== input.providerKey ||
      operation.providerConfigurationKey !== input.providerConfigurationKey ||
      operation.operationKey !== input.operationKey
    ) {
      throw new ManagedProviderBillingException(
        ManagedProviderBillingExceptionCode.OPERATION_REPLAY_CONFLICT,
      );
    }
  }

  private getExactCompletionReplay(
    operation: ManagedProviderOperationEntity,
    input: CompleteManagedProviderOperationInput,
    actualUsageProperties: Record<string, boolean | number | string>,
    expectedState: ManagedProviderOperationState,
  ): ManagedProviderOperationEntity {
    const isExpectedLifecycleState =
      expectedState === ManagedProviderOperationState.USAGE_PENDING
        ? [
            ManagedProviderOperationState.USAGE_PENDING,
            ManagedProviderOperationState.USAGE_ACCEPTED,
            ManagedProviderOperationState.USAGE_SETTLED,
            ManagedProviderOperationState.RECONCILIATION_REQUIRED,
          ].includes(operation.state)
        : operation.state === expectedState;

    if (
      !isExpectedLifecycleState ||
      operation.completionOutcome !== input.outcome ||
      this.getCanonicalProperties(operation.actualUsageProperties ?? {}) !==
        this.getCanonicalProperties(actualUsageProperties) ||
      operation.providerCostMicrousd !== input.providerCostMicrousd ||
      operation.providerExecutionId !== input.providerExecutionId
    ) {
      throw new ManagedProviderBillingException(
        ManagedProviderBillingExceptionCode.OPERATION_REPLAY_CONFLICT,
      );
    }

    return operation;
  }

  private getExactReplay(
    operation: ManagedProviderOperationEntity,
    input: ReserveManagedProviderOperationInput,
    expectedProductIds: string[],
  ): ManagedProviderOperationEntity {
    if (
      operation.actorUserWorkspaceId !== input.actorUserWorkspaceId ||
      operation.providerKey !== input.providerKey ||
      operation.providerConfigurationKey !== input.providerConfigurationKey ||
      operation.operationKey !== input.operationKey ||
      operation.metronomeEventType !== input.metronomeEventType ||
      !this.areEqualStringArrays(
        operation.expectedProductIds,
        expectedProductIds,
      ) ||
      this.getCanonicalProperties(operation.maximumUsageProperties) !==
        this.getCanonicalProperties(input.maximumUsageProperties)
    ) {
      throw new ManagedProviderBillingException(
        ManagedProviderBillingExceptionCode.OPERATION_REPLAY_CONFLICT,
      );
    }

    return operation;
  }

  private normalizeExpectedProductIds(productIds: string[]): string[] {
    if (
      productIds.length === 0 ||
      productIds.some((productId) => productId.trim().length === 0) ||
      new Set(productIds).size !== productIds.length
    ) {
      throw new Error('Expected Metronome product mapping is invalid');
    }

    return [...productIds].sort();
  }

  private areEqualStringArrays(first: string[], second: string[]): boolean {
    return (
      first.length === second.length &&
      first.every((value, index) => value === second[index])
    );
  }

  private getCanonicalProperties(
    properties: Record<string, boolean | number | string>,
  ): string {
    return JSON.stringify(
      Object.fromEntries(
        Object.entries(properties).sort(([firstKey], [secondKey]) =>
          firstKey.localeCompare(secondKey),
        ),
      ),
    );
  }
}
