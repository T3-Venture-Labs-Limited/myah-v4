import { Injectable } from '@nestjs/common';
import { Temporal } from 'temporal-polyfill';

import { CampaignInitialDueTimeAdapter } from 'src/modules/campaign-execution/adapters/campaign-execution-runtime.adapter';

const FORECAST_HOURS = 48;
const windowAdjuster = new CampaignInitialDueTimeAdapter();

type ForecastWindow = {
  endLocalTime: string;
  startLocalTime: string;
  timeZone: string;
};

type ForecastSender =
  | { kind: 'PINNED'; connectedAccountId: string }
  | { kind: 'ROTATE'; connectedAccountIds: string[] };

type ForecastOccurrence = {
  campaignId: string;
  dueAt: Date;
  occurrenceId: string;
  sender: ForecastSender;
  window: ForecastWindow;
};

type ForecastAccount = {
  acceptedByLocalDate: Record<string, number>;
  capacityTimeZone: string;
  connectedAccountId: string;
  dailySendLimit: number;
  minimumSendIntervalMs: number;
  nextEligibleAt: Date | null;
  reservedByLocalDate: Record<string, number>;
};

type ForecastInput = {
  accounts: ForecastAccount[];
  generatedAt: Date;
  maxItems: number;
  occurrences: ForecastOccurrence[];
};

type AccountState = ForecastAccount & {
  nextEligibleAtMs: number;
  usageByLocalDate: Map<string, number>;
};

const localDate = (instant: Temporal.Instant, timeZone: string): string =>
  instant.toZonedDateTimeISO(timeZone).toPlainDate().toString();

const nextLocalMidnight = (
  instant: Temporal.Instant,
  timeZone: string,
): Temporal.Instant =>
  instant
    .toZonedDateTimeISO(timeZone)
    .toPlainDate()
    .add({ days: 1 })
    .toPlainDateTime(Temporal.PlainTime.from('00:00'))
    .toZonedDateTime(timeZone, { disambiguation: 'compatible' })
    .toInstant();

const adjustForCapacity = (
  candidate: Temporal.Instant,
  account: AccountState,
): Temporal.Instant => {
  let adjusted = candidate;

  for (let day = 0; day < 4; day += 1) {
    const date = localDate(adjusted, account.capacityTimeZone);
    const usage = account.usageByLocalDate.get(date) ?? 0;

    if (usage < account.dailySendLimit) return adjusted;
    adjusted = nextLocalMidnight(adjusted, account.capacityTimeZone);
  }

  return adjusted;
};

const adjustForWindowAndCapacity = (
  candidateMs: number,
  occurrence: ForecastOccurrence,
  account: AccountState,
): Temporal.Instant => {
  let candidate = Temporal.Instant.fromEpochMilliseconds(candidateMs);

  for (let pass = 0; pass < 8; pass += 1) {
    const before = candidate.epochMilliseconds;
    candidate = Temporal.Instant.from(
      windowAdjuster.adjustInitialDueAt({
        anchorAt: candidate.toString(),
        delaySeconds: 0,
        window: occurrence.window,
      }),
    );
    candidate = adjustForCapacity(candidate, account);

    if (candidate.epochMilliseconds === before) return candidate;
  }

  throw new Error('Campaign forecast constraints did not converge');
};

const accountState = (account: ForecastAccount): AccountState => {
  const dates = new Set([
    ...Object.keys(account.acceptedByLocalDate),
    ...Object.keys(account.reservedByLocalDate),
  ]);

  return {
    ...account,
    nextEligibleAtMs: account.nextEligibleAt?.getTime() ?? 0,
    usageByLocalDate: new Map(
      [...dates].map((date) => [
        date,
        (account.acceptedByLocalDate[date] ?? 0) +
          (account.reservedByLocalDate[date] ?? 0),
      ]),
    ),
  };
};

@Injectable()
export class CampaignMessageForecastService {
  forecast(input: ForecastInput) {
    if (
      !Number.isSafeInteger(input.maxItems) ||
      input.maxItems < 1 ||
      !Number.isFinite(input.generatedAt.getTime())
    ) {
      throw new Error('Invalid campaign forecast input');
    }

    const generatedAtMs = input.generatedAt.getTime();
    const horizonEndsAt = new Date(
      Temporal.Instant.fromEpochMilliseconds(generatedAtMs).add({
        hours: FORECAST_HOURS,
      }).epochMilliseconds,
    );
    const accounts = new Map(
      input.accounts.map((account) => [
        account.connectedAccountId,
        accountState(account),
      ]),
    );
    const occurrences = [...input.occurrences].sort(
      (left, right) =>
        left.dueAt.getTime() - right.dueAt.getTime() ||
        left.occurrenceId.localeCompare(right.occurrenceId),
    );
    const evaluated = occurrences.slice(0, input.maxItems);
    const projections: Array<{
      campaignId: string;
      connectedAccountId: string;
      estimatedSendAt: Date;
      occurrenceId: string;
    }> = [];

    for (const occurrence of evaluated) {
      const accountIds =
        occurrence.sender.kind === 'PINNED'
          ? [occurrence.sender.connectedAccountId]
          : occurrence.sender.connectedAccountIds;
      const candidates = accountIds
        .map((id) => accounts.get(id))
        .filter((account): account is AccountState => account !== undefined)
        .map((account) => {
          const candidate = adjustForWindowAndCapacity(
            Math.max(
              generatedAtMs,
              occurrence.dueAt.getTime(),
              account.nextEligibleAtMs,
            ),
            occurrence,
            account,
          );
          const date = localDate(candidate, account.capacityTimeZone);

          return {
            account,
            candidate,
            usage: account.usageByLocalDate.get(date) ?? 0,
          };
        })
        .sort(
          (left, right) =>
            left.candidate.epochMilliseconds -
              right.candidate.epochMilliseconds ||
            left.usage - right.usage ||
            left.account.connectedAccountId.localeCompare(
              right.account.connectedAccountId,
            ),
        );
      const selected = candidates[0];

      if (
        selected === undefined ||
        selected.candidate.epochMilliseconds >= horizonEndsAt.getTime()
      ) {
        continue;
      }

      const date = localDate(
        selected.candidate,
        selected.account.capacityTimeZone,
      );

      selected.account.usageByLocalDate.set(date, selected.usage + 1);
      selected.account.nextEligibleAtMs =
        selected.candidate.epochMilliseconds +
        selected.account.minimumSendIntervalMs;
      projections.push({
        campaignId: occurrence.campaignId,
        connectedAccountId: selected.account.connectedAccountId,
        estimatedSendAt: new Date(selected.candidate.epochMilliseconds),
        occurrenceId: occurrence.occurrenceId,
      });
    }

    return {
      coverage: {
        complete: evaluated.length === occurrences.length,
        evaluatedCount: evaluated.length,
      },
      generatedAt: new Date(generatedAtMs),
      horizonEndsAt,
      projections,
    };
  }
}
