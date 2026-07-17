import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThanOrEqual, MoreThan, Repository } from 'typeorm';

import { MyahWorkspaceInstallationEntity } from 'src/engine/core-modules/customer-account/entities/myah-workspace-installation.entity';
import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';

import { ManagedProviderOperationEntity } from '../entities/managed-provider-operation.entity';
import { ManagedProviderOperationState } from '../enums/managed-provider-operation-state.enum';
import { DeliverManagedProviderUsageJob } from '../jobs/deliver-managed-provider-usage.job';
import {
  MetronomeClientException,
  MetronomeClientExceptionCode,
} from '../metronome-client.exception';
import {
  MetronomeClientService,
  type MetronomeUsageEvent,
} from './metronome-client.service';
import { validateSafeMetronomeEventProperties } from '../utils/validate-safe-metronome-event-properties.util';

const INITIAL_SETTLEMENT_RETRY_DELAY_MS = 60_000;
const MAX_SETTLEMENT_RETRY_DELAY_MS = 15 * 60_000;
const RECOVERY_BATCH_SIZE = 100;
const STALE_RESERVATION_THRESHOLD_MS = 34 * 24 * 60 * 60 * 1_000;

@Injectable()
export class ManagedProviderBillingRecoveryService {
  private readonly logger = new Logger(
    ManagedProviderBillingRecoveryService.name,
  );

  constructor(
    // Recovery is a control-plane cron that must scan and lock operations across every workspace.
    // eslint-disable-next-line twenty/prefer-workspace-scoped-repository
    @InjectRepository(ManagedProviderOperationEntity)
    private readonly operationRepository: Repository<ManagedProviderOperationEntity>,
    // Customer mappings are resolved across workspaces before any tenant context exists.
    // eslint-disable-next-line twenty/prefer-workspace-scoped-repository
    @InjectRepository(MyahWorkspaceInstallationEntity)
    private readonly installationRepository: Repository<MyahWorkspaceInstallationEntity>,
    private readonly metronomeClientService: MetronomeClientService,
    @InjectMessageQueue(MessageQueue.workspaceQueue)
    private readonly messageQueueService: MessageQueueService,
    private readonly twentyConfigService: TwentyConfigService,
  ) {}

  async recover(): Promise<void> {
    const now = new Date();

    await this.reportOperationalCounts(now);

    if (!this.twentyConfigService.get('METRONOME_ENABLED')) {
      return;
    }

    await this.recoverPendingOperations(now);
    await this.recoverAcceptedOperations(now);
  }

  private async recoverPendingOperations(now: Date): Promise<void> {
    let cursor: string | undefined;

    while (true) {
      const cursorFilter = cursor === undefined ? {} : { id: MoreThan(cursor) };
      const pendingOperations = await this.operationRepository.find({
        order: { id: 'ASC' },
        take: RECOVERY_BATCH_SIZE,
        where: [
          {
            ...cursorFilter,
            nextDeliveryAttemptAt: IsNull(),
            state: ManagedProviderOperationState.USAGE_PENDING,
          },
          {
            ...cursorFilter,
            nextDeliveryAttemptAt: LessThanOrEqual(now),
            state: ManagedProviderOperationState.USAGE_PENDING,
          },
        ],
      });

      for (const operation of pendingOperations) {
        await this.messageQueueService.add(
          DeliverManagedProviderUsageJob.name,
          { operationId: operation.id },
          { id: `managed-provider-usage:${operation.id}`, retryLimit: 3 },
        );
      }

      if (pendingOperations.length < RECOVERY_BATCH_SIZE) {
        return;
      }

      cursor = pendingOperations[pendingOperations.length - 1].id;
    }
  }

  private async recoverAcceptedOperations(now: Date): Promise<void> {
    let cursor: string | undefined;
    let isSearchRateLimited = false;

    while (true) {
      const acceptedOperations = await this.operationRepository.find({
        order: { id: 'ASC' },
        take: RECOVERY_BATCH_SIZE,
        where: {
          ...(cursor === undefined ? {} : { id: MoreThan(cursor) }),
          settleAfter: LessThanOrEqual(now),
          state: ManagedProviderOperationState.USAGE_ACCEPTED,
        },
      });
      const operationsWithinSettlementWindow = acceptedOperations.filter(
        (operation) => !this.isPastSettlementWindow(operation, now),
      );

      await Promise.all(
        acceptedOperations
          .filter((operation) => this.isPastSettlementWindow(operation, now))
          .map((operation) => this.markReconciliationRequired(operation)),
      );

      if (operationsWithinSettlementWindow.length > 0) {
        if (isSearchRateLimited) {
          await Promise.all(
            operationsWithinSettlementWindow.map((operation) =>
              this.scheduleSettlementRetry(operation, now, true),
            ),
          );
        } else {
          let events: MetronomeUsageEvent[] | null = null;

          try {
            events = await this.metronomeClientService.searchUsageEvents(
              operationsWithinSettlementWindow.map((operation) =>
                this.getTransactionId(operation.id),
              ),
            );
          } catch (error) {
            isSearchRateLimited =
              error instanceof MetronomeClientException &&
              error.code === MetronomeClientExceptionCode.RATE_LIMITED;

            await Promise.all(
              operationsWithinSettlementWindow.map((operation) =>
                this.scheduleSettlementRetry(
                  operation,
                  now,
                  isSearchRateLimited,
                ),
              ),
            );
          }

          if (events !== null) {
            for (const operation of operationsWithinSettlementWindow) {
              await this.settleIfVerified(operation, events, now);
            }
          }
        }
      }

      if (acceptedOperations.length < RECOVERY_BATCH_SIZE) {
        return;
      }

      cursor = acceptedOperations[acceptedOperations.length - 1].id;
    }
  }

  private async settleIfVerified(
    operation: ManagedProviderOperationEntity,
    events: MetronomeUsageEvent[],
    now: Date,
  ): Promise<void> {
    const transactionId = this.getTransactionId(operation.id);
    const transactionEvents = events.filter(
      (event) => event.transactionId === transactionId,
    );
    const canonicalEvents = transactionEvents.filter(
      (event) => !event.isDuplicate,
    );

    if (transactionEvents.length === 0) {
      await this.scheduleSettlementRetry(operation, now, false);

      return;
    }

    if (canonicalEvents.length !== 1) {
      await this.markReconciliationRequired(operation);

      return;
    }

    const event = canonicalEvents[0];

    if (
      transactionEvents.some(
        (transactionEvent) =>
          transactionEvent !== event &&
          !this.hasEquivalentEventEvidence(event, transactionEvent),
      )
    ) {
      await this.markReconciliationRequired(operation);

      return;
    }

    const installation = await this.installationRepository.findOneBy({
      workspaceId: operation.workspaceId,
    });

    if (
      !installation?.metronomeCustomerId ||
      event.matchedCustomerId !== installation.metronomeCustomerId ||
      event.timestamp !== operation.deliveryEventAt?.toISOString() ||
      event.customerId !== installation.metronomeCustomerId ||
      event.eventType !== operation.metronomeEventType ||
      !this.hasProcessedEvent(event, now) ||
      !this.hasOnlyExpectedBillableMetrics(
        event.matchedBillableMetricIds,
        operation.expectedBillableMetricIds,
      ) ||
      !this.hasEquivalentProperties(
        operation.actualUsageProperties,
        event.properties,
      )
    ) {
      if (!this.hasProcessedEvent(event, now)) {
        await this.scheduleSettlementRetry(operation, now, false);
      } else {
        await this.markReconciliationRequired(operation);
      }

      return;
    }

    try {
      await this.metronomeClientService.getPrepaidBalance(
        installation.metronomeCustomerId,
      );
    } catch {
      await this.scheduleSettlementRetry(operation, now, false);

      return;
    }

    await this.operationRepository.manager.transaction(async (manager) => {
      const lockedInstallation = await manager.findOne(
        MyahWorkspaceInstallationEntity,
        {
          lock: { mode: 'pessimistic_write' },
          where: { workspaceId: operation.workspaceId },
        },
      );

      if (
        !lockedInstallation ||
        lockedInstallation.metronomeCustomerId !==
          installation.metronomeCustomerId
      ) {
        return;
      }

      const lockedOperation = await manager.findOne(
        ManagedProviderOperationEntity,
        {
          lock: { mode: 'pessimistic_write' },
          where: {
            id: operation.id,
            workspaceId: operation.workspaceId,
          },
        },
      );

      if (
        lockedOperation?.state !== ManagedProviderOperationState.USAGE_ACCEPTED
      ) {
        return;
      }

      lockedOperation.state = ManagedProviderOperationState.USAGE_SETTLED;
      lockedOperation.settledAt = new Date();
      await manager.save(ManagedProviderOperationEntity, lockedOperation);
    });
  }

  private async scheduleSettlementRetry(
    operation: ManagedProviderOperationEntity,
    now: Date,
    isRateLimited: boolean,
  ): Promise<void> {
    await this.operationRepository.manager.transaction(async (manager) => {
      const lockedOperation = await manager.findOne(
        ManagedProviderOperationEntity,
        {
          lock: { mode: 'pessimistic_write' },
          where: {
            id: operation.id,
            workspaceId: operation.workspaceId,
          },
        },
      );

      if (
        lockedOperation?.state !== ManagedProviderOperationState.USAGE_ACCEPTED
      ) {
        return;
      }

      const retryDelayMs = isRateLimited
        ? MAX_SETTLEMENT_RETRY_DELAY_MS
        : Math.min(
            INITIAL_SETTLEMENT_RETRY_DELAY_MS *
              2 ** lockedOperation.settlementAttemptCount,
            MAX_SETTLEMENT_RETRY_DELAY_MS,
          );

      await manager.save(ManagedProviderOperationEntity, {
        ...lockedOperation,
        settlementAttemptCount: lockedOperation.settlementAttemptCount + 1,
        settleAfter: new Date(now.getTime() + retryDelayMs),
      });
    });
  }

  private async markReconciliationRequired(
    operation: ManagedProviderOperationEntity,
  ): Promise<void> {
    await this.operationRepository.manager.transaction(async (manager) => {
      const lockedOperation = await manager.findOne(
        ManagedProviderOperationEntity,
        {
          lock: { mode: 'pessimistic_write' },
          where: {
            id: operation.id,
            workspaceId: operation.workspaceId,
          },
        },
      );

      if (
        lockedOperation?.state !== ManagedProviderOperationState.USAGE_ACCEPTED
      ) {
        return;
      }

      await manager.save(ManagedProviderOperationEntity, {
        ...lockedOperation,
        state: ManagedProviderOperationState.RECONCILIATION_REQUIRED,
      });
    });
  }

  private isPastSettlementWindow(
    operation: ManagedProviderOperationEntity,
    now: Date,
  ): boolean {
    const firstDeliveryAt =
      operation.deliveryEventAt ??
      operation.metronomeAcceptedAt ??
      operation.completedAt ??
      operation.createdAt;

    return (
      firstDeliveryAt instanceof Date &&
      now.getTime() - firstDeliveryAt.getTime() > STALE_RESERVATION_THRESHOLD_MS
    );
  }

  private async reportOperationalCounts(now: Date): Promise<void> {
    const staleBefore = new Date(
      now.getTime() - STALE_RESERVATION_THRESHOLD_MS,
    );
    const [pendingCount, staleReservedCount, reconciliationCount] =
      await Promise.all([
        this.operationRepository.countBy({
          state: ManagedProviderOperationState.USAGE_PENDING,
        }),
        this.operationRepository.countBy({
          createdAt: LessThanOrEqual(staleBefore),
          state: ManagedProviderOperationState.RESERVED,
        }),
        this.operationRepository.countBy({
          state: ManagedProviderOperationState.RECONCILIATION_REQUIRED,
        }),
      ]);
    const staleCount = staleReservedCount + reconciliationCount;

    if (pendingCount > 0 || staleCount > 0) {
      this.logger.warn(
        `Managed-provider billing recovery has ${pendingCount} pending and ${staleCount} stale operations`,
      );
    }
  }

  private hasEquivalentProperties(
    expectedProperties: Record<string, unknown> | null,
    actualProperties: Record<string, unknown>,
  ): boolean {
    if (!expectedProperties) {
      return false;
    }

    try {
      const normalizedActualProperties = validateSafeMetronomeEventProperties(
        Object.fromEntries(
          Object.entries(actualProperties).map(([key, value]) => [
            key,
            this.normalizePropertyValue(expectedProperties[key], value),
          ]),
        ),
      );

      return (
        JSON.stringify(Object.entries(expectedProperties).sort()) ===
        JSON.stringify(Object.entries(normalizedActualProperties).sort())
      );
    } catch {
      return false;
    }
  }

  private hasEquivalentEventEvidence(
    expectedEvent: MetronomeUsageEvent,
    actualEvent: MetronomeUsageEvent,
  ): boolean {
    return (
      expectedEvent.customerId === actualEvent.customerId &&
      expectedEvent.matchedCustomerId === actualEvent.matchedCustomerId &&
      expectedEvent.eventType === actualEvent.eventType &&
      expectedEvent.timestamp === actualEvent.timestamp &&
      expectedEvent.transactionId === actualEvent.transactionId &&
      this.areEqualStringArrays(
        expectedEvent.matchedBillableMetricIds,
        actualEvent.matchedBillableMetricIds,
      ) &&
      this.hasEquivalentProperties(
        expectedEvent.properties,
        actualEvent.properties,
      )
    );
  }

  private hasOnlyExpectedBillableMetrics(
    actualMetricIds: string[],
    expectedMetricIds: string[],
  ): boolean {
    return (
      actualMetricIds.length > 0 &&
      new Set(actualMetricIds).size === actualMetricIds.length &&
      actualMetricIds.every((metricId) => expectedMetricIds.includes(metricId))
    );
  }

  private hasProcessedEvent(event: MetronomeUsageEvent, now: Date): boolean {
    if (!event.processedAt) {
      return false;
    }

    const processedAt = Date.parse(event.processedAt);

    return Number.isFinite(processedAt) && processedAt <= now.getTime();
  }

  private normalizePropertyValue(
    expectedValue: unknown,
    actualValue: unknown,
  ): unknown {
    if (typeof expectedValue === 'number' && typeof actualValue === 'string') {
      const normalizedValue = Number(actualValue);

      return Number.isFinite(normalizedValue) ? normalizedValue : actualValue;
    }

    if (
      typeof expectedValue === 'boolean' &&
      (actualValue === 'true' || actualValue === 'false')
    ) {
      return actualValue === 'true';
    }

    return actualValue;
  }

  private areEqualStringArrays(first: string[], second: string[]): boolean {
    return (
      JSON.stringify([...first].sort()) === JSON.stringify([...second].sort())
    );
  }

  private getTransactionId(operationId: string): string {
    return `managed-provider-usage:${operationId}`;
  }
}
