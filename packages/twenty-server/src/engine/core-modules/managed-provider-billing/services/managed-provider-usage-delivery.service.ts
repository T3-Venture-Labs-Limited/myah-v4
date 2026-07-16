import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';

import { ManagedProviderOperationEntity } from '../entities/managed-provider-operation.entity';
import { ManagedProviderOperationState } from '../enums/managed-provider-operation-state.enum';
import {
  MetronomeClientException,
  MetronomeClientExceptionCode,
} from '../metronome-client.exception';
import { getValidatedMetronomeUsageAmountCents } from '../utils/get-validated-metronome-usage-amount-cents.util';

import { MetronomeClientService } from './metronome-client.service';
import { MetronomeWorkspaceCustomerService } from './metronome-workspace-customer.service';

@Injectable()
export class ManagedProviderUsageDeliveryService {
  constructor(
    @InjectRepository(ManagedProviderOperationEntity)
    private readonly operationRepository: Repository<ManagedProviderOperationEntity>,
    private readonly metronomeClientService: MetronomeClientService,
    private readonly metronomeWorkspaceCustomerService: MetronomeWorkspaceCustomerService,
    private readonly twentyConfigService: TwentyConfigService,
  ) {}

  async deliverUsage(operationId: string): Promise<void> {
    const operation = await this.operationRepository.findOneBy({
      id: operationId,
    });

    if (operation?.state !== ManagedProviderOperationState.USAGE_PENDING) {
      return;
    }

    if (this.isPastInitialDeliveryWindow(operation)) {
      await this.markReconciliationRequired(operationId, null);

      return;
    }

    if (!operation.actualUsageProperties) {
      throw new Error('Managed provider usage facts are unavailable');
    }

    const customerId =
      await this.metronomeWorkspaceCustomerService.ensureWorkspaceCustomer(
        operation.workspaceId,
      );
    const contractId =
      await this.metronomeWorkspaceCustomerService.ensureWorkspaceContract(
        operation.workspaceId,
      );
    const preview = await this.metronomeClientService.previewUsage({
      customerId,
      eventType: operation.metronomeEventType,
      properties: operation.actualUsageProperties,
    });
    const quotedActualAmountCents = getValidatedMetronomeUsageAmountCents({
      contractId,
      customerId,
      expectedProductIds: operation.expectedProductIds,
      preview,
    });

    if (quotedActualAmountCents > BigInt(operation.reservedAmountCents)) {
      await this.markReconciliationRequired(
        operationId,
        quotedActualAmountCents,
      );

      return;
    }

    const deliveryEventAt = await this.getOrPersistDeliveryEventAt(operationId);

    try {
      await this.metronomeClientService.ingestUsage({
        customerId,
        eventType: operation.metronomeEventType,
        properties: operation.actualUsageProperties,
        timestamp: deliveryEventAt.toISOString(),
        transactionId: `managed-provider-usage:${operation.id}`,
      });
    } catch (error) {
      await this.markDeliveryFailure(
        operationId,
        error instanceof MetronomeClientException
          ? error.code
          : MetronomeClientExceptionCode.REQUEST_FAILED,
      );

      throw error;
    }

    await this.operationRepository.manager.transaction(async (manager) => {
      const lockedOperation = await manager.findOne(
        ManagedProviderOperationEntity,
        {
          lock: { mode: 'pessimistic_write' },
          where: { id: operationId },
        },
      );

      if (
        lockedOperation?.state !== ManagedProviderOperationState.USAGE_PENDING
      ) {
        return;
      }

      const metronomeAcceptedAt = new Date();
      const settlementDelayMilliseconds = this.twentyConfigService.get(
        'METRONOME_USAGE_SETTLEMENT_DELAY_MS',
      );

      await manager.save(ManagedProviderOperationEntity, {
        ...lockedOperation,
        metronomeAcceptedAt,
        nextDeliveryAttemptAt: null,
        deliveryAttemptCount: lockedOperation.deliveryAttemptCount + 1,
        lastDeliveryErrorCode: null,
        quotedActualAmountCents: quotedActualAmountCents.toString(),
        settleAfter: new Date(
          metronomeAcceptedAt.getTime() + settlementDelayMilliseconds,
        ),
        state: ManagedProviderOperationState.USAGE_ACCEPTED,
      });
    });
  }

  private async getOrPersistDeliveryEventAt(operationId: string): Promise<Date> {
    return this.operationRepository.manager.transaction(async (manager) => {
      const operation = await manager.findOne(ManagedProviderOperationEntity, {
        lock: { mode: 'pessimistic_write' },
        where: { id: operationId },
      });

      if (operation?.state !== ManagedProviderOperationState.USAGE_PENDING) {
        throw new Error('Managed provider operation is no longer pending');
      }

      if (operation.deliveryEventAt) {
        return operation.deliveryEventAt;
      }

      const deliveryEventAt = new Date();

      await manager.save(ManagedProviderOperationEntity, {
        ...operation,
        deliveryEventAt,
      });

      return deliveryEventAt;
    });
  }

  private isPastInitialDeliveryWindow(
    operation: ManagedProviderOperationEntity,
  ): boolean {
    const firstDeliveryAt = operation.completedAt ?? operation.createdAt;

    return (
      firstDeliveryAt instanceof Date &&
      Date.now() - firstDeliveryAt.getTime() > 34 * 24 * 60 * 60 * 1_000
    );
  }

  private async markDeliveryFailure(
    operationId: string,
    errorCode: MetronomeClientExceptionCode,
  ): Promise<void> {
    await this.operationRepository.manager.transaction(async (manager) => {
      const operation = await manager.findOne(ManagedProviderOperationEntity, {
        lock: { mode: 'pessimistic_write' },
        where: { id: operationId },
      });

      if (operation?.state !== ManagedProviderOperationState.USAGE_PENDING) {
        return;
      }

      await manager.save(ManagedProviderOperationEntity, {
        ...operation,
        deliveryAttemptCount: operation.deliveryAttemptCount + 1,
        lastDeliveryErrorCode: errorCode,
        nextDeliveryAttemptAt: new Date(),
      });
    });
  }

  private async markReconciliationRequired(
    operationId: string,
    quotedActualAmountCents: bigint | null,
  ): Promise<void> {
    await this.operationRepository.manager.transaction(async (manager) => {
      const operation = await manager.findOne(ManagedProviderOperationEntity, {
        lock: { mode: 'pessimistic_write' },
        where: { id: operationId },
      });

      if (operation?.state !== ManagedProviderOperationState.USAGE_PENDING) {
        return;
      }

      await manager.save(ManagedProviderOperationEntity, {
        ...operation,
        ...(quotedActualAmountCents === null
          ? {}
          : { quotedActualAmountCents: quotedActualAmountCents.toString() }),
        state: ManagedProviderOperationState.RECONCILIATION_REQUIRED,
      });
    });
  }
}
