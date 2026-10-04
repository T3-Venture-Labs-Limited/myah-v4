import { CampaignInitialDueTimeAdapter } from 'src/modules/campaign-execution/adapters/campaign-execution-runtime.adapter';

// Same rolling limits as InstagramActionBudgetService. Sequence steps are cold:
// a creator who replies stops their sequence.
export const INSTAGRAM_COLD_HOURLY_LIMIT = 10;
export const INSTAGRAM_COLD_DAILY_LIMIT = 100;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const windowAdjuster = new CampaignInitialDueTimeAdapter();

export type InstagramForecastStep = {
  occurrenceId: string;
  dueAt: Date;
  // The Campaign's Instagram account; null when none is connected.
  instagramAccountId: string | null;
  window: { timeZone: string; startLocalTime: string; endLocalTime: string };
};

// When the rolling limit next allows a send at or after `candidate`.
const nextAllowed = (
  candidate: number,
  sends: number[],
  windowMs: number,
  limit: number,
): number => {
  const inWindow = sends.filter(
    (sent) => sent > candidate - windowMs && sent <= candidate,
  );
  if (inWindow.length < limit) return candidate;
  // Free up the oldest send that keeps the window at the limit.
  const sorted = inWindow.sort((left, right) => left - right);
  return sorted[inWindow.length - limit] + windowMs + 1;
};

// Estimates when each Instagram step sends: after it is due, inside the
// Campaign window, and paced by its account's cold limits, which are shared by
// every Campaign on that account (MYAH-445).
export const forecastInstagramSteps = (input: {
  generatedAt: Date;
  steps: InstagramForecastStep[];
  recentColdSendsByAccount: Map<string, Date[]>;
}): Map<string, Date | null> => {
  const sendsByAccount = new Map(
    [...input.recentColdSendsByAccount].map(([accountId, sends]) => [
      accountId,
      sends.map((sent) => sent.getTime()),
    ]),
  );
  const estimates = new Map<string, Date | null>();
  const ordered = [...input.steps].sort(
    (left, right) =>
      left.dueAt.getTime() - right.dueAt.getTime() ||
      left.occurrenceId.localeCompare(right.occurrenceId),
  );
  for (const step of ordered) {
    if (step.instagramAccountId === null) {
      estimates.set(step.occurrenceId, null);
      continue;
    }
    const sends = sendsByAccount.get(step.instagramAccountId) ?? [];
    let candidate = Math.max(step.dueAt.getTime(), input.generatedAt.getTime());
    for (let pass = 0; pass < 16; pass += 1) {
      const before = candidate;
      candidate = new Date(
        windowAdjuster.adjustInitialDueAt({
          anchorAt: new Date(candidate).toISOString(),
          delaySeconds: 0,
          window: step.window,
        }),
      ).getTime();
      candidate = nextAllowed(
        candidate,
        sends,
        HOUR_MS,
        INSTAGRAM_COLD_HOURLY_LIMIT,
      );
      candidate = nextAllowed(
        candidate,
        sends,
        DAY_MS,
        INSTAGRAM_COLD_DAILY_LIMIT,
      );
      if (candidate === before) break;
    }
    sends.push(candidate);
    sendsByAccount.set(step.instagramAccountId, sends);
    estimates.set(step.occurrenceId, new Date(candidate));
  }
  return estimates;
};
