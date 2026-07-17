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

    const deliveryEventAt = await this.getOrPersistDeliveryEventAt(operationId);
    const customerId =
      await this.metronomeWorkspaceCustomerService.ensureWorkspaceCustomer(
        operation.workspaceId,
      );
    const contractId =
      await this.metronomeWorkspaceCustomerService.ensureWorkspaceContract(
        operation.workspaceId,
      );
    const quotedActualAmountCents = await this.getOrPersistValidatedQuote({
      contractId,
      customerId,
      deliveryEventAt,
      operationId,
    });

    if (quotedActualAmountCents === null) {
      return;
    }

    const ingestionResult = await this.operationRepository.manager.transaction(
      async (manager) => {
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
          return { status: 'NOT_PENDING' } as const;
        }

        if (!lockedOperation.actualUsageProperties) {
          throw new Error('Managed provider usage facts are unavailable');
        }

        try {
          await this.metronomeClientService.ingestUsage({
            customerId,
            eventType: lockedOperation.metronomeEventType,
            properties: lockedOperation.actualUsageProperties,
            timestamp: deliveryEventAt.toISOString(),
            transactionId: `managed-provider-usage:${lockedOperation.id}`,
          });
        } catch (error) {
          await manager.save(ManagedProviderOperationEntity, {
            ...lockedOperation,
            deliveryAttemptCount: lockedOperation.deliveryAttemptCount + 1,
            lastDeliveryErrorCode:
              error instanceof MetronomeClientException
                ? error.code
                : MetronomeClientExceptionCode.REQUEST_FAILED,
            nextDeliveryAttemptAt: new Date(),
          });

          return { error, status: 'FAILED' } as const;
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

        return { status: 'ACCEPTED' } as const;
      },
    );

    if (ingestionResult.status === 'FAILED') {
      throw ingestionResult.error;
    }
  }

  private async getOrPersistDeliveryEventAt(
    operationId: string,
  ): Promise<Date> {
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

  private async getOrPersistValidatedQuote({
    contractId,
    customerId,
    deliveryEventAt,
    operationId,
  }: {
    contractId: string;
    customerId: string;
    deliveryEventAt: Date;
    operationId: string;
  }): Promise<bigint | null> {
    return this.operationRepository.manager.transaction(async (manager) => {
      const operation = await manager.findOne(ManagedProviderOperationEntity, {
        lock: { mode: 'pessimistic_write' },
        where: { id: operationId },
      });

      if (operation?.state !== ManagedProviderOperationState.USAGE_PENDING) {
        return null;
      }

      let quotedActualAmountCents: bigint;
      const persistedQuote = operation.quotedActualAmountCents;
      const hasPersistedQuote = persistedQuote != null;

      if (persistedQuote != null) {
        quotedActualAmountCents = BigInt(persistedQuote);
      } else {
        if (!operation.actualUsageProperties) {
          throw new Error('Managed provider usage facts are unavailable');
        }

        const preview = await this.metronomeClientService.previewUsage({
          customerId,
          eventType: operation.metronomeEventType,
          properties: operation.actualUsageProperties,
          timestamp: deliveryEventAt.toISOString(),
        });

        try {
          quotedActualAmountCents = getValidatedMetronomeUsageAmountCents({
            contractId,
            customerId,
            expectedProductIds: operation.expectedProductIds,
            preview,
          });
        } catch {
          await manager.save(ManagedProviderOperationEntity, {
            ...operation,
            state: ManagedProviderOperationState.RECONCILIATION_REQUIRED,
          });

          return null;
        }
      }

      if (quotedActualAmountCents > BigInt(operation.reservedAmountCents)) {
        await manager.save(ManagedProviderOperationEntity, {
          ...operation,
          quotedActualAmountCents: quotedActualAmountCents.toString(),
          state: ManagedProviderOperationState.RECONCILIATION_REQUIRED,
        });

        return null;
      }

      if (!hasPersistedQuote) {
        await manager.save(ManagedProviderOperationEntity, {
          ...operation,
          quotedActualAmountCents: quotedActualAmountCents.toString(),
        });
      }

      return quotedActualAmountCents;
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
