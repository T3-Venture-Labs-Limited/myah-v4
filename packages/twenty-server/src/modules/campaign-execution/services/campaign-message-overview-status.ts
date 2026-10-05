export type CampaignMessageOverviewStatus =
  | 'CANCELLED'
  | 'NEEDS_ATTENTION'
  | 'SCHEDULED'
  | 'SENT';

type StatusInput = {
  attemptState: string | null;
  occurrenceState: string;
  projectedMessageThreadId: string | null;
  providerAcceptedAt: Date | string | null;
  stepChannel?: string | null;
  receiptState?: string | null;
};

export const deriveCampaignMessageOverviewStatus = (
  input: StatusInput,
): CampaignMessageOverviewStatus => {
  if (
    input.occurrenceState === 'CANCELLED' ||
    input.occurrenceState === 'SKIPPED'
  )
    return 'CANCELLED';
  // Instagram steps settle from their send receipt (MYAH-445).
  if (input.stepChannel === 'INSTAGRAM') {
    if (
      input.receiptState === 'SENT' ||
      input.receiptState === 'PROVIDER_ACCEPTED'
    )
      return 'SENT';
    // Being sent right now, or waiting (including after a rate limit), is
    // not a problem; only held, failed or unconfirmed steps need attention.
    const sending =
      input.occurrenceState === 'IN_FLIGHT' &&
      (input.receiptState == null || input.receiptState === 'PROCESSING');
    const waiting =
      input.occurrenceState === 'PENDING' &&
      input.receiptState !== 'FAILED' &&
      input.receiptState !== 'UNKNOWN';
    return sending || waiting ? 'SCHEDULED' : 'NEEDS_ATTENTION';
  }
  if (
    input.occurrenceState === 'HELD' ||
    input.occurrenceState === 'UNKNOWN' ||
    input.occurrenceState === 'IN_FLIGHT' ||
    (input.occurrenceState === 'SUCCEEDED' &&
      (input.providerAcceptedAt === null ||
        input.projectedMessageThreadId === null)) ||
    input.attemptState === 'RESERVED' ||
    input.attemptState === 'PROCESSING' ||
    input.attemptState === 'UNKNOWN' ||
    input.attemptState === 'BLOCKED' ||
    (input.attemptState === 'ACCEPTED' &&
      (input.providerAcceptedAt === null ||
        input.projectedMessageThreadId === null))
  )
    return 'NEEDS_ATTENTION';
  if (input.attemptState === 'ACCEPTED' && input.providerAcceptedAt !== null)
    return 'SENT';

  return 'SCHEDULED';
};

export const campaignMessageOverviewStatusSql = (
  occurrenceState = 'o.state',
  attemptState = 'attempt."attemptState"',
  providerAcceptedAt = 'attempt."providerAcceptedAt"',
  projectedMessageThreadId = 'attempt."projectedMessageThreadId"',
): string => `CASE
  WHEN ${occurrenceState} IN ('CANCELLED','SKIPPED') THEN 'CANCELLED'
  WHEN ${occurrenceState} IN ('HELD','UNKNOWN','IN_FLIGHT')
    OR (${occurrenceState}='SUCCEEDED'
        AND (${providerAcceptedAt} IS NULL OR ${projectedMessageThreadId} IS NULL))
    OR ${attemptState} IN ('RESERVED','PROCESSING','UNKNOWN','BLOCKED')
    OR (${attemptState}='ACCEPTED' AND (${providerAcceptedAt} IS NULL OR ${projectedMessageThreadId} IS NULL)) THEN 'NEEDS_ATTENTION'
  WHEN ${attemptState}='ACCEPTED' AND ${providerAcceptedAt} IS NOT NULL THEN 'SENT'
  ELSE 'SCHEDULED'
END`;
