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
};

export const deriveCampaignMessageOverviewStatus = (
  input: StatusInput,
): CampaignMessageOverviewStatus => {
  if (
    input.occurrenceState === 'CANCELLED' ||
    input.occurrenceState === 'SKIPPED'
  )
    return 'CANCELLED';
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
