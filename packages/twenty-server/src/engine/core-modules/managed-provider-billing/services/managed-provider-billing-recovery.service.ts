import { Injectable, Logger, Optional } from '@nestjs/common';
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
import { OpenRouterGenerationLookupService } from './openrouter-generation-lookup.service';
import { validateSafeMetronomeEventProperties } from '../utils/validate-safe-metronome-event-properties.util';

const INITIAL_SETTLEMENT_RETRY_DELAY_MS = 60_000;
const MAX_SETTLEMENT_RETRY_DELAY_MS = 15 * 60_000;
const RECOVERY_BATCH_SIZE = 100;
const RECONCILIATION_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1_000;
const RECONCILIATION_RETRY_DELAY_MS = 24 * 60 * 60 * 1_000;
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
    @Optional()
    private readonly openRouterGenerationLookupService?: OpenRouterGenerationLookupService,
  ) {}

  async recover(): Promise<void> {
    const now = new Date();

    await this.reportOperationalCounts(now);

    if (!this.twentyConfigService.get('METRONOME_ENABLED')) {
      return;
    }

    await this.recoverPendingOperations(now);
    await this.recoverAcceptedOperations(now);
    await this.recoverUnknownOpenRouterOperations(now);
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
  private async recoverUnknownOpenRouterOperations(now: Date): Promise<void> {
    if (!this.openRouterGenerationLookupService) return;

    const operations = await this.operationRepository.find({
      take: RECOVERY_BATCH_SIZE,
      where: [
        {
          completionOutcome: 'UNKNOWN',
          providerKey: 'openrouter',
          state: ManagedProviderOperationState.RECONCILIATION_REQUIRED,
        },
        {
          completionOutcome: 'UNKNOWN',
          providerCostMicrousd: IsNull(),
          providerExecutionId: MoreThan(''),
          providerKey: 'openrouter',
          state: ManagedProviderOperationState.RELEASED,
        },
      ],
    });

    await Promise.all(
      operations.map(async (operation) => {
        if (!operation.providerExecutionId) return;

        if (
          operation.state ===
            ManagedProviderOperationState.RECONCILIATION_REQUIRED &&
          operation.createdAt instanceof Date &&
          now.getTime() - operation.createdAt.getTime() >=
            RECONCILIATION_TIMEOUT_MS
        ) {
          await this.operationRepository.manager.transaction(
            async (manager) => {
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
                lockedOperation?.state !==
                ManagedProviderOperationState.RECONCILIATION_REQUIRED
              )
                return;
              await manager.save(ManagedProviderOperationEntity, {
                ...lockedOperation,
                lastDeliveryErrorCode: 'OPENROUTER_RECONCILIATION_TIMEOUT',
                nextDeliveryAttemptAt: null,
                releasedAt: now,
                state: ManagedProviderOperationState.RELEASED,
              });
            },
          );
          return;
        }

        const generation = await this.openRouterGenerationLookupService!.lookup(
          operation.providerExecutionId,
        );
        if (
          generation.status !== 'found' ||
          generation.id !== operation.providerExecutionId ||
          `openrouter/${generation.model}` !==
            operation.providerConfigurationKey ||
          !this.isMatchingGenerationUsage(operation, generation)
        ) {
          await this.scheduleUnknownRetry(operation, now);
          return;
        }

        const providerCostMicrousd = Math.ceil(
          generation.totalCostUsd * 1_000_000,
        );
        if (!Number.isSafeInteger(providerCostMicrousd)) {
          await this.scheduleUnknownRetry(operation, now);
          return;
        }
        const recoveredUsageProperties = this.getRecoveredUsageProperties(
          operation,
          generation,
          providerCostMicrousd,
        );
        if (!recoveredUsageProperties) {
          await this.scheduleUnknownRetry(operation, now);
          return;
        }
        if (
          operation.providerCostMicrousd !== null &&
          operation.providerCostMicrousd !== providerCostMicrousd.toString()
        ) {
          await this.scheduleUnknownRetry(operation, now);
          return;
        }

        let delivered = false;
        await this.operationRepository.manager.transaction(async (manager) => {
          const lockedOperation = await manager.findOne(
            ManagedProviderOperationEntity,
            {
              lock: { mode: 'pessimistic_write' },
              where: { id: operation.id, workspaceId: operation.workspaceId },
            },
          );
          if (
            !lockedOperation ||
            (lockedOperation.state !==
              ManagedProviderOperationState.RECONCILIATION_REQUIRED &&
              lockedOperation.state !==
                ManagedProviderOperationState.RELEASED) ||
            lockedOperation.completionOutcome !== 'UNKNOWN' ||
            lockedOperation.providerCostMicrousd !== null
          )
            return;

          if (
            lockedOperation.state === ManagedProviderOperationState.RELEASED
          ) {
            await manager.save(ManagedProviderOperationEntity, {
              ...lockedOperation,
              actualUsageProperties: recoveredUsageProperties,
              providerCostMicrousd: providerCostMicrousd.toString(),
            });
            this.logger.error(
              `Late OpenRouter generation evidence absorbed for released operation ${operation.id}`,
            );
            return;
          }

          const completedAt = new Date();
          await manager.save(ManagedProviderOperationEntity, {
            ...lockedOperation,
            actualUsageProperties: recoveredUsageProperties,
            completionOutcome: 'BILLABLE',
            completedAt,
            nextDeliveryAttemptAt: completedAt,
            providerCostMicrousd: providerCostMicrousd.toString(),
            state: ManagedProviderOperationState.USAGE_PENDING,
          });
          delivered = true;
        });

        if (delivered) {
          await this.messageQueueService.add(
            DeliverManagedProviderUsageJob.name,
            { operationId: operation.id },
            { id: `managed-provider-usage:${operation.id}`, retryLimit: 3 },
          );
        }
      }),
    );
  }

  private async scheduleUnknownRetry(
    operation: ManagedProviderOperationEntity,
    now: Date,
  ): Promise<void> {
    await this.operationRepository.manager.transaction(async (manager) => {
      const lockedOperation = await manager.findOne(
        ManagedProviderOperationEntity,
        {
          lock: { mode: 'pessimistic_write' },
          where: { id: operation.id, workspaceId: operation.workspaceId },
        },
      );
      if (
        lockedOperation?.state !==
        ManagedProviderOperationState.RECONCILIATION_REQUIRED
      )
        return;
      await manager.save(ManagedProviderOperationEntity, {
        ...lockedOperation,
        lastDeliveryErrorCode: 'OPENROUTER_RECONCILIATION_PENDING',
        nextDeliveryAttemptAt: new Date(
          now.getTime() + RECONCILIATION_RETRY_DELAY_MS,
        ),
      });
    });
  }

  private isMatchingGenerationUsage(
    operation: ManagedProviderOperationEntity,
    generation: { promptTokens: number; completionTokens: number },
  ): boolean {
    const maximum = operation.maximumUsageProperties;
    if (!maximum) {
      return false;
    }
    return (
      typeof maximum.inputUnits === 'number' &&
      Number.isSafeInteger(maximum.inputUnits) &&
      generation.promptTokens <= maximum.inputUnits &&
      typeof maximum.outputUnits === 'number' &&
      Number.isSafeInteger(maximum.outputUnits) &&
      generation.completionTokens <= maximum.outputUnits
    );
  }

  private getRecoveredUsageProperties(
    operation: ManagedProviderOperationEntity,
    generation: {
      cachedPromptTokens: number;
      completionTokens: number;
      model: string;
      promptTokens: number;
    },
    providerCostMicrousd: number,
  ): Record<string, boolean | number | string> | null {
    const maximum = operation.maximumUsageProperties;
    if (!maximum) {
      return null;
    }
    const inputRate = maximum.inputRate;
    const outputRate = maximum.outputRate;
    const cachedInputRate = maximum.cachedInputRate;
    const baseInputRate = maximum.baseInputRate ?? inputRate;
    const baseOutputRate = maximum.baseOutputRate ?? outputRate;
    const baseCachedInputRate = maximum.baseCachedInputRate ?? cachedInputRate;
    const longContextThreshold = maximum.longContextThreshold;
    const tariffVersion = maximum.tariffVersion;
    const reservedAmountCents = Number(operation.reservedAmountCents);

    if (
      typeof inputRate !== 'number' ||
      !Number.isFinite(inputRate) ||
      inputRate < 0 ||
      typeof outputRate !== 'number' ||
      !Number.isFinite(outputRate) ||
      outputRate < 0 ||
      typeof cachedInputRate !== 'number' ||
      !Number.isFinite(cachedInputRate) ||
      cachedInputRate < 0 ||
      typeof baseInputRate !== 'number' ||
      !Number.isFinite(baseInputRate) ||
      baseInputRate < 0 ||
      typeof baseOutputRate !== 'number' ||
      !Number.isFinite(baseOutputRate) ||
      baseOutputRate < 0 ||
      typeof baseCachedInputRate !== 'number' ||
      !Number.isFinite(baseCachedInputRate) ||
      baseCachedInputRate < 0 ||
      (longContextThreshold !== undefined &&
        (typeof longContextThreshold !== 'number' ||
          !Number.isSafeInteger(longContextThreshold) ||
          longContextThreshold < 0)) ||
      typeof tariffVersion !== 'string' ||
      !tariffVersion ||
      !Number.isSafeInteger(reservedAmountCents) ||
      reservedAmountCents < 0 ||
      generation.cachedPromptTokens > generation.promptTokens
    ) {
      return null;
    }

    const usesLongContextTariff =
      typeof longContextThreshold === 'number' &&
      generation.promptTokens >= longContextThreshold;
    const effectiveInputRate = usesLongContextTariff
      ? inputRate
      : baseInputRate;
    const effectiveOutputRate = usesLongContextTariff
      ? outputRate
      : baseOutputRate;
    const effectiveCachedInputRate = usesLongContextTariff
      ? cachedInputRate
      : baseCachedInputRate;

    const retailMicrousd = Math.ceil(
      (generation.promptTokens - generation.cachedPromptTokens) *
        effectiveInputRate +
        generation.cachedPromptTokens * effectiveCachedInputRate +
        generation.completionTokens * effectiveOutputRate,
    );
    if (!Number.isSafeInteger(retailMicrousd)) {
      return null;
    }

    const isApprovedFreeModel =
      operation.providerConfigurationKey ===
        'openrouter/google/gemma-4-31b-it:free' &&
      effectiveInputRate === 0 &&
      effectiveOutputRate === 0 &&
      effectiveCachedInputRate === 0;
    const uncappedChargeCentUnits = isApprovedFreeModel
      ? 0
      : Math.max(1, Math.ceil(retailMicrousd / 10_000));
    const hasOverrun = uncappedChargeCentUnits > reservedAmountCents;

    return {
      cachedInputRate: effectiveCachedInputRate,
      chargeCentUnits: hasOverrun
        ? reservedAmountCents
        : uncappedChargeCentUnits,
      inputCacheReadUnits: generation.cachedPromptTokens,
      inputCacheWriteUnits: 0,
      inputNoCacheUnits:
        generation.promptTokens - generation.cachedPromptTokens,
      inputRate: effectiveInputRate,
      inputUnits: generation.promptTokens,
      model: operation.providerConfigurationKey,
      outputRate: effectiveOutputRate,
      outputUnits: generation.completionTokens,
      tariffVersion,
      ...(hasOverrun && {
        absorbedCostMicrousd: providerCostMicrousd,
        excessChargeCentUnits: uncappedChargeCentUnits - reservedAmountCents,
        overrun: true,
        uncappedChargeCentUnits,
      }),
    };
  }

  private async recoverAcceptedOperations(now: Date): Promise<void> {
    let cursor: string | undefined;
    let isMetronomeRateLimited = false;

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
        if (isMetronomeRateLimited) {
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
            isMetronomeRateLimited =
              error instanceof MetronomeClientException &&
              error.code === MetronomeClientExceptionCode.RATE_LIMITED;

            await Promise.all(
              operationsWithinSettlementWindow.map((operation) =>
                this.scheduleSettlementRetry(
                  operation,
                  now,
                  isMetronomeRateLimited,
                ),
              ),
            );
          }

          if (events !== null) {
            for (const [
              index,
              operation,
            ] of operationsWithinSettlementWindow.entries()) {
              const isBalanceRateLimited = await this.settleIfVerified(
                operation,
                events,
                now,
              );

              if (!isBalanceRateLimited) {
                continue;
              }

              isMetronomeRateLimited = true;
              await Promise.all(
                operationsWithinSettlementWindow
                  .slice(index + 1)
                  .map((remainingOperation) =>
                    this.scheduleSettlementRetry(remainingOperation, now, true),
                  ),
              );
              break;
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
  ): Promise<boolean> {
    const transactionId = this.getTransactionId(operation.id);
    const transactionEvents = events.filter(
      (event) => event.transactionId === transactionId,
    );
    const canonicalEvents = transactionEvents.filter(
      (event) => !event.isDuplicate,
    );

    if (transactionEvents.length === 0) {
      await this.scheduleSettlementRetry(operation, now, false);

      return false;
    }

    if (canonicalEvents.length !== 1) {
      await this.markReconciliationRequired(operation);

      return false;
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

      return false;
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

      return false;
    }

    try {
      await this.metronomeClientService.getPrepaidBalance(
        installation.metronomeCustomerId,
      );
    } catch (error) {
      const isRateLimited =
        error instanceof MetronomeClientException &&
        error.code === MetronomeClientExceptionCode.RATE_LIMITED;

      await this.scheduleSettlementRetry(operation, now, isRateLimited);

      return isRateLimited;
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

    return false;
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
