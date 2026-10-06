import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import {
  MyahWorkspaceAccess,
  MyahWorkspaceAccessService,
} from 'src/engine/core-modules/myah-subscription/myah-workspace-access.service';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import {
  AiException,
  AiExceptionCode,
} from 'src/engine/metadata-modules/ai/ai.exception';

@Injectable()
export class MyahUsageService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly access: MyahWorkspaceAccessService,
    private readonly config: TwentyConfigService,
  ) {}

  async assertCanAct(workspaceId: string) {
    const state = await this.access.getAccess(workspaceId);

    if (
      state === MyahWorkspaceAccess.NEEDS_SUBSCRIPTION ||
      state === MyahWorkspaceAccess.LAPSED
    ) {
      throw new AiException(
        'This workspace has no active subscription.',
        AiExceptionCode.SUBSCRIPTION_REQUIRED,
      );
    }

    return state;
  }

  async getUsage(workspaceId: string) {
    const state = await this.access.getAccess(workspaceId);
    const subscription = await this.access.getSubscription(workspaceId);
    const periodStart =
      state === MyahWorkspaceAccess.COMPLIMENTARY
        ? null
        : (subscription?.usagePeriodStart ?? null);
    const [total] = await this.dataSource.query<{ cost: string }[]>(
      `SELECT COALESCE(SUM("costMicrousd"), 0)::text AS cost
       FROM core."myahUsageEntry"
       WHERE "workspaceId" = $1 AND "usagePeriodStart" IS NOT DISTINCT FROM $2::timestamptz
         AND category = 'AI'`,
      [workspaceId, periodStart],
    );
    const limit = this.config.get('MYAH_INCLUDED_USAGE_MICROUSD');
    const cost = BigInt(total.cost);

    return {
      state,
      instagramReconnectRequired:
        !!subscription?.instagramDisconnectedForLapseAt,
      periodStart,
      resetAt: subscription?.usagePeriodEnd ?? null,
      paymentRetrying: state === MyahWorkspaceAccess.PAYMENT_RETRYING,
      percentUsed:
        state === MyahWorkspaceAccess.COMPLIMENTARY
          ? null
          : Number((cost * BigInt(100)) / BigInt(limit)),
      exhausted:
        state !== MyahWorkspaceAccess.COMPLIMENTARY && cost >= BigInt(limit),
    };
  }

  async assertCanSpend(workspaceId: string, _category: 'AI') {
    const state = await this.assertCanAct(workspaceId);

    if (state === MyahWorkspaceAccess.COMPLIMENTARY) return;

    const usage = await this.getUsage(workspaceId);

    if (usage.exhausted) {
      const reset = usage.paymentRetrying
        ? 'It resets when the renewal payment goes through.'
        : usage.resetAt
          ? `It resets on ${usage.resetAt.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              timeZone: 'UTC',
            })}.`
          : 'It resets with the next paid renewal.';

      throw new AiException(
        `This month's AI usage is used up. ${reset}`,
        AiExceptionCode.INCLUDED_USAGE_EXHAUSTED,
      );
    }
  }

  async record(input: {
    workspaceId: string;
    category: 'AI';
    costMicrousd: bigint;
    sourceKey: string;
    quantity?: number;
    details?: Record<string, unknown>;
    // Capture the period before an asynchronous provider call, not when it finishes.
    usagePeriodStart?: Date | null;
  }) {
    if (
      input.category !== 'AI' ||
      input.costMicrousd < BigInt(0) ||
      !input.sourceKey ||
      !Number.isFinite(input.quantity ?? 1) ||
      (input.quantity ?? 1) < 0
    ) {
      throw new Error('Invalid usage entry');
    }

    const usagePeriodStart =
      input.usagePeriodStart !== undefined
        ? input.usagePeriodStart
        : (await this.access.getAccess(input.workspaceId)) ===
            MyahWorkspaceAccess.COMPLIMENTARY
          ? null
          : ((await this.access.getSubscription(input.workspaceId))
              ?.usagePeriodStart ?? null);

    await this.dataSource.query(
      `INSERT INTO core."myahUsageEntry"
         ("workspaceId", "usagePeriodStart", "category", "costMicrousd", "quantity", "sourceKey", "details")
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT ("workspaceId", "sourceKey") DO NOTHING`,
      [
        input.workspaceId,
        usagePeriodStart,
        input.category,
        input.costMicrousd.toString(),
        input.quantity ?? 1,
        input.sourceKey,
        input.details ?? null,
      ],
    );
  }
}
