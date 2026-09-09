import { Injectable } from '@nestjs/common';
import { type EntityManager, type QueryRunner } from 'typeorm';

import { type ReadyCampaignSenderReadiness } from 'src/modules/myah-campaign/types/campaign-sender-pool.type';
import {
  type LockAndRankMailboxCapacityInput,
  type LockAndRankMailboxCapacityResult,
  type LockedMailboxCapacityCandidate,
} from 'src/modules/campaign-execution/types/mailbox-capacity-candidate.type';

type ClockRow = {
  connectedAccountId: string;
  nextEligibleAt: Date | string | null;
};

type DayRow = {
  acceptedCount: number;
  connectedAccountId: string;
  reservedCount: number;
};

type TimeSampleRow = {
  localDate: string;
  nextLocalMidnightAt: Date | string;
  observedAt: Date | string;
};

const INVALID_INPUT_RESULT = {
  reason: 'INVALID_CAPACITY_INPUT',
  status: 'BLOCKED',
} as const;

const CLOCK_UPSERT_SQL = `
  INSERT INTO "core"."mailboxDispatchClock"
    ("workspaceId", "connectedAccountId")
  VALUES ($1, $2)
  ON CONFLICT DO NOTHING
`;

const CLOCK_LOCK_SQL = `
  SELECT "connectedAccountId", "nextEligibleAt"
  FROM "core"."mailboxDispatchClock"
  WHERE "workspaceId" = $1 AND "connectedAccountId" = $2
  FOR UPDATE
`;

const TIME_SAMPLE_SQL = `
  WITH sampled_time AS MATERIALIZED (
    SELECT clock_timestamp() AS observed_at
  )
  SELECT
    observed_at AS "observedAt",
    (observed_at AT TIME ZONE $1)::date::text AS "localDate",
    (((observed_at AT TIME ZONE $1)::date + 1)::timestamp AT TIME ZONE $1)
      AS "nextLocalMidnightAt"
  FROM sampled_time
`;

const DAY_UPSERT_SQL = `
  INSERT INTO "core"."mailboxCapacityDay"
    ("workspaceId", "connectedAccountId", "localDate")
  VALUES ($1, $2, $3)
  ON CONFLICT DO NOTHING
`;

const DAY_LOCK_SQL = `
  SELECT "connectedAccountId", "acceptedCount", "reservedCount"
  FROM "core"."mailboxCapacityDay"
  WHERE "workspaceId" = $1
    AND "connectedAccountId" = $2
    AND "localDate" = $3
  FOR UPDATE
`;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isCanonicalUuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);

const isValidTimeZone = (timeZone: string): boolean => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format();

    return true;
  } catch {
    return false;
  }
};

const toValidDate = (value: unknown): Date | null => {
  if (!(value instanceof Date) && typeof value !== 'string') {
    return null;
  }

  const date =
    value instanceof Date ? new Date(value.getTime()) : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
};

const compareAccountId = (
  left: ReadyCampaignSenderReadiness,
  right: ReadyCampaignSenderReadiness,
): number =>
  left.connectedAccountId < right.connectedAccountId
    ? -1
    : left.connectedAccountId > right.connectedAccountId
      ? 1
      : 0;

const isValidCandidate = (candidate: ReadyCampaignSenderReadiness): boolean =>
  candidate.bindingStatus === 'RESOLVED_BINDING' &&
  candidate.status === 'READY' &&
  isCanonicalUuid(candidate.connectedAccountId) &&
  isCanonicalUuid(candidate.messageChannelId) &&
  isNonEmptyString(candidate.senderHandle) &&
  Number.isInteger(candidate.dailySendLimit) &&
  candidate.dailySendLimit > 0 &&
  Number.isInteger(candidate.minimumSendIntervalMs) &&
  candidate.minimumSendIntervalMs >= 0;

const hasValidInput = (input: LockAndRankMailboxCapacityInput): boolean => {
  if (
    !isCanonicalUuid(input.workspaceId) ||
    !isNonEmptyString(input.workspaceTimeZone) ||
    !isValidTimeZone(input.workspaceTimeZone) ||
    !Array.isArray(input.candidates) ||
    input.candidates.length === 0 ||
    !input.candidates.every(isValidCandidate)
  ) {
    return false;
  }

  if (
    new Set(input.candidates.map((candidate) => candidate.connectedAccountId))
      .size !== input.candidates.length
  ) {
    return false;
  }

  return (
    input.selectionConstraint.kind === 'ROTATE' ||
    ((input.selectionConstraint.kind === 'PINNED_REPLY' ||
      input.selectionConstraint.kind === 'EXPLICIT') &&
      isCanonicalUuid(input.selectionConstraint.connectedAccountId) &&
      isCanonicalUuid(input.selectionConstraint.messageChannelId))
  );
};

const selectCandidates = (
  input: LockAndRankMailboxCapacityInput,
): ReadyCampaignSenderReadiness[] | null => {
  if (input.selectionConstraint.kind === 'ROTATE') {
    return [...input.candidates].sort(compareAccountId);
  }

  if (
    input.selectionConstraint.kind !== 'PINNED_REPLY' &&
    input.selectionConstraint.kind !== 'EXPLICIT'
  ) {
    return null;
  }

  const constraint = input.selectionConstraint;
  const normalizedHandle = constraint.senderHandle.trim().toLowerCase();
  const exact = input.candidates.find(
    (candidate) =>
      candidate.connectedAccountId === constraint.connectedAccountId &&
      candidate.messageChannelId === constraint.messageChannelId &&
      candidate.senderHandle.trim().toLowerCase() === normalizedHandle,
  );

  return exact === undefined ? [] : [exact];
};

const hasOneExpectedClockRow = (
  rows: ClockRow[],
  connectedAccountId: string,
): boolean =>
  rows.length === 1 && rows[0].connectedAccountId === connectedAccountId;

const hasOneExpectedDayRow = (
  rows: DayRow[],
  connectedAccountId: string,
): boolean =>
  rows.length === 1 &&
  rows[0].connectedAccountId === connectedAccountId &&
  Number.isInteger(rows[0].acceptedCount) &&
  rows[0].acceptedCount >= 0 &&
  Number.isInteger(rows[0].reservedCount) &&
  rows[0].reservedCount >= 0;

const maxDate = (...dates: Date[]): Date =>
  new Date(Math.max(...dates.map((date) => date.getTime())));

const compareLockedCandidates = (
  left: LockedMailboxCapacityCandidate,
  right: LockedMailboxCapacityCandidate,
): number => {
  const eligibilityDifference =
    left.earliestEligibleAt.getTime() - right.earliestEligibleAt.getTime();

  if (eligibilityDifference !== 0) {
    return eligibilityDifference;
  }

  const usageDifference =
    left.acceptedCount +
    left.reservedCount -
    (right.acceptedCount + right.reservedCount);

  if (usageDifference !== 0) {
    return usageDifference;
  }

  return compareAccountId(left.sender, right.sender);
};

@Injectable()
export class MailboxCapacityService {
  async lockAndRankForReservation(
    input: LockAndRankMailboxCapacityInput,
    manager: EntityManager,
  ): Promise<LockAndRankMailboxCapacityResult> {
    const queryRunner = manager.queryRunner;

    if (!this.isActiveQueryRunner(queryRunner) || !hasValidInput(input)) {
      return INVALID_INPUT_RESULT;
    }

    const candidates = selectCandidates(input);

    if (candidates === null) {
      return INVALID_INPUT_RESULT;
    }

    if (candidates.length === 0) {
      return {
        reason: 'PINNED_SENDER_NOT_READY',
        status: 'BLOCKED',
      };
    }

    for (const candidate of candidates) {
      await queryRunner.query(CLOCK_UPSERT_SQL, [
        input.workspaceId,
        candidate.connectedAccountId,
      ]);
    }

    const clockRows = new Map<string, ClockRow>();

    for (const candidate of candidates) {
      const rows = (await queryRunner.query(CLOCK_LOCK_SQL, [
        input.workspaceId,
        candidate.connectedAccountId,
      ])) as ClockRow[];

      if (hasOneExpectedClockRow(rows, candidate.connectedAccountId)) {
        clockRows.set(candidate.connectedAccountId, rows[0]);
      }
    }

    if (clockRows.size !== candidates.length) {
      return INVALID_INPUT_RESULT;
    }

    const sampleRows = (await queryRunner.query(TIME_SAMPLE_SQL, [
      input.workspaceTimeZone,
    ])) as TimeSampleRow[];
    const sample = sampleRows[0];
    const observedAt = toValidDate(sample?.observedAt);
    const nextLocalMidnightAt = toValidDate(sample?.nextLocalMidnightAt);

    if (
      sampleRows.length !== 1 ||
      observedAt === null ||
      nextLocalMidnightAt === null ||
      nextLocalMidnightAt <= observedAt ||
      typeof sample.localDate !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(sample.localDate)
    ) {
      return INVALID_INPUT_RESULT;
    }

    for (const candidate of candidates) {
      await queryRunner.query(DAY_UPSERT_SQL, [
        input.workspaceId,
        candidate.connectedAccountId,
        sample.localDate,
      ]);
    }

    const dayRows = new Map<string, DayRow>();

    for (const candidate of candidates) {
      const rows = (await queryRunner.query(DAY_LOCK_SQL, [
        input.workspaceId,
        candidate.connectedAccountId,
        sample.localDate,
      ])) as DayRow[];

      if (hasOneExpectedDayRow(rows, candidate.connectedAccountId)) {
        dayRows.set(candidate.connectedAccountId, rows[0]);
      }
    }

    if (dayRows.size !== candidates.length) {
      return INVALID_INPUT_RESULT;
    }

    const lockedCandidates: LockedMailboxCapacityCandidate[] = [];

    for (const sender of candidates) {
      const clockRow = clockRows.get(sender.connectedAccountId);
      const dayRow = dayRows.get(sender.connectedAccountId);
      const nextEligibleAt = toValidDate(clockRow?.nextEligibleAt ?? null);

      if (
        clockRow === undefined ||
        dayRow === undefined ||
        (clockRow.nextEligibleAt !== null && nextEligibleAt === null)
      ) {
        return INVALID_INPUT_RESULT;
      }

      const usage = dayRow.acceptedCount + dayRow.reservedCount;
      const capacityEligibleAt =
        usage < sender.dailySendLimit ? observedAt : nextLocalMidnightAt;
      const spacingEligibleAt = nextEligibleAt ?? observedAt;

      lockedCandidates.push({
        acceptedCount: dayRow.acceptedCount,
        earliestEligibleAt: maxDate(
          observedAt,
          capacityEligibleAt,
          spacingEligibleAt,
        ),
        localDate: sample.localDate,
        nextEligibleAt,
        nextLocalMidnightAt,
        reservedCount: dayRow.reservedCount,
        sender,
      });
    }

    const selected = [...lockedCandidates].sort(compareLockedCandidates)[0];

    if (selected.earliestEligibleAt <= observedAt) {
      return {
        lockedCandidates,
        observedAt,
        selected,
        status: 'ELIGIBLE_NOW',
      };
    }

    return {
      lockedCandidates,
      nextEligibleAt: selected.earliestEligibleAt,
      observedAt,
      status: 'NOT_READY',
    };
  }

  private isActiveQueryRunner(
    queryRunner: QueryRunner | undefined,
  ): queryRunner is QueryRunner {
    return (
      queryRunner !== undefined &&
      queryRunner.isTransactionActive &&
      typeof queryRunner.query === 'function'
    );
  }
}
