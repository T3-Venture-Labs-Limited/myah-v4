import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { ManagedProviderPoolService } from 'src/engine/core-modules/managed-provider-billing/services/managed-provider-pool.service';
import { OpenRouterGenerationLookupService } from 'src/engine/core-modules/managed-provider-billing/services/openrouter-generation-lookup.service';
import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { MyahUsageService } from 'src/engine/core-modules/myah-subscription/myah-usage.service';

// Serializable so recovery keeps the call's original paid period across renewals.
export type MyahAiUsageReservation = {
  workspaceId: string;
  sourceKey: string;
  requestId: string;
  modelId: string;
  usagePeriodStart: string | null;
  estimatedCostMicrousd: string;
};

type MyahAiUsageRecovery = MyahAiUsageReservation & {
  providerExecutionId: string | null;
  lookupAttempt?: number;
};

// OpenRouter can take a while to publish a generation's cost. Look again at these
// delays before falling back to the reserved estimate, which is far higher.
const LOOKUP_RETRY_DELAYS_MS = [5 * 60_000, 15 * 60_000, 60 * 60_000];

@Injectable()
export class MyahAiUsageService {
  constructor(
    private readonly usage: MyahUsageService,
    private readonly pool: ManagedProviderPoolService,
    @InjectMessageQueue(MessageQueue.workspaceQueue)
    private readonly queue: MessageQueueService,
  ) {}

  async begin(input: {
    workspaceId: string;
    requestId: string;
    modelId: string;
    estimatedCostMicrousd: number;
  }): Promise<MyahAiUsageReservation> {
    await this.usage.assertCanSpend(input.workspaceId, 'AI');
    await this.pool.assertOpenRouterReservationAllowed();
    const { periodStart } = await this.usage.getUsage(input.workspaceId);
    if (
      !Number.isSafeInteger(input.estimatedCostMicrousd) ||
      input.estimatedCostMicrousd < 0
    ) {
      throw new Error('Invalid managed AI cost estimate');
    }
    return {
      workspaceId: input.workspaceId,
      // Each provider invocation costs money, even if its caller replays a root ID.
      // Recovery carries this same key, so retrying the ledger write stays idempotent.
      sourceKey: `ai:${randomUUID()}`,
      requestId: input.requestId,
      modelId: input.modelId,
      usagePeriodStart: periodStart?.toISOString() ?? null,
      estimatedCostMicrousd: input.estimatedCostMicrousd.toString(),
    };
  }

  complete(
    reservation: MyahAiUsageReservation,
    costMicrousd: string,
    providerExecutionId: string,
  ) {
    return this.usage.record({
      workspaceId: reservation.workspaceId,
      sourceKey: reservation.sourceKey,
      usagePeriodStart: reservation.usagePeriodStart
        ? new Date(reservation.usagePeriodStart)
        : null,
      category: 'AI',
      costMicrousd: BigInt(costMicrousd),
      details: {
        modelId: reservation.modelId,
        requestId: reservation.requestId,
        providerExecutionId,
      },
    });
  }

  recover(
    reservation: MyahAiUsageReservation,
    providerExecutionId: string | null,
  ) {
    return this.queue.add<MyahAiUsageRecovery>(
      MyahAiUsageRecoveryJob.name,
      { ...reservation, providerExecutionId },
      { delay: 60_000, retryLimit: 5 },
    );
  }
}

@Processor(MessageQueue.workspaceQueue)
export class MyahAiUsageRecoveryJob {
  constructor(
    private readonly lookup: OpenRouterGenerationLookupService,
    private readonly usage: MyahUsageService,
    @InjectMessageQueue(MessageQueue.workspaceQueue)
    private readonly queue: MessageQueueService,
  ) {}

  @Process(MyahAiUsageRecoveryJob.name)
  async handle(data: MyahAiUsageRecovery) {
    const result = data.providerExecutionId
      ? await this.lookup.lookup(data.providerExecutionId)
      : null;
    const attempt = data.lookupAttempt ?? 0;
    if (
      (result?.status === 'not_found' || result?.status === 'unavailable') &&
      attempt < LOOKUP_RETRY_DELAYS_MS.length
    ) {
      // Nothing is recorded yet, so a later lookup can still charge the real cost.
      await this.queue.add<MyahAiUsageRecovery>(
        MyahAiUsageRecoveryJob.name,
        { ...data, lookupAttempt: attempt + 1 },
        { delay: LOOKUP_RETRY_DELAYS_MS[attempt], retryLimit: 5 },
      );
      return;
    }
    // The generation ID came from our own request, so matching it is enough.
    // OpenRouter may report a routed model slug that differs from the request.
    const cost =
      result?.status === 'found' && result.id === data.providerExecutionId
        ? Math.ceil(result.totalCostUsd * 1_000_000)
        : null;
    const estimated = cost === null || !Number.isSafeInteger(cost) || cost < 0;
    await this.usage.record({
      workspaceId: data.workspaceId,
      sourceKey: data.sourceKey,
      usagePeriodStart: data.usagePeriodStart
        ? new Date(data.usagePeriodStart)
        : null,
      category: 'AI',
      costMicrousd: estimated
        ? BigInt(data.estimatedCostMicrousd)
        : BigInt(cost ?? 0),
      details: {
        modelId: data.modelId,
        requestId: data.requestId,
        providerExecutionId: data.providerExecutionId,
        estimated,
      },
    });
  }
}
