import { Injectable } from '@nestjs/common';
import { type EntityManager, type QueryRunner } from 'typeorm';

import { type ReadyCampaignSenderReadiness } from 'src/modules/myah-campaign/types/campaign-sender-pool.type';
import {
  type LockAndRankMailboxCapacityInput,
  type LockedReservationDay,
  type LockAndRankMailboxCapacityResult,
  type LockedMailboxCapacityCandidate,
  type RevalidateMailboxCapacityForMutationInput,
  type RevalidateMailboxCapacityForMutationResult,
} from 'src/modules/campaign-execution/types/mailbox-capacity-candidate.type';

type ClockRow = {
  connectedAccountId: string;
  nextEligibleAt: Date | string | null;
};

type DayRow = {
  acceptedCount: number;
  connectedAccountId: string;
  localDate: string;
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
  SELECT "connectedAccountId", "localDate", "acceptedCount", "reservedCount"
  FROM "core"."mailboxCapacityDay"
  WHERE "workspaceId" = $1
    AND "connectedAccountId" = $2
    AND "localDate" = $3
  FOR UPDATE
`;

const INCREMENT_RESERVED_SQL = `
  UPDATE "core"."mailboxCapacityDay"
  SET "reservedCount" = "reservedCount" + 1
  WHERE "workspaceId" = $1
    AND "connectedAccountId" = $2
    AND "localDate" = $3
  RETURNING "connectedAccountId", "localDate", "acceptedCount", "reservedCount"
`;

const ADVANCE_CLOCK_SQL = `
  UPDATE "core"."mailboxDispatchClock"
  SET "nextEligibleAt" = GREATEST(
    COALESCE("nextEligibleAt", $3::timestamptz),
    $4::timestamptz
  )
  WHERE "workspaceId" = $1 AND "connectedAccountId" = $2
  RETURNING "connectedAccountId", "nextEligibleAt"
`;

const RELEASE_RESERVED_SQL = `
  UPDATE "core"."mailboxCapacityDay"
  SET "reservedCount" = "reservedCount" - 1
  WHERE "workspaceId" = $1
    AND "connectedAccountId" = $2
    AND "localDate" = $3
    AND "reservedCount" > 0
  RETURNING "connectedAccountId", "localDate", "acceptedCount", "reservedCount"
`;

const CONSUME_RESERVED_SQL = `
  UPDATE "core"."mailboxCapacityDay"
  SET "reservedCount" = "reservedCount" - 1,
      "acceptedCount" = "acceptedCount" + 1
  WHERE "workspaceId" = $1
    AND "connectedAccountId" = $2
    AND "localDate" = $3
    AND "reservedCount" > 0
  RETURNING "connectedAccountId", "localDate", "acceptedCount", "reservedCount"
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
  localDate: string,
): boolean =>
  rows.length === 1 &&
  rows[0].connectedAccountId === connectedAccountId &&
  rows[0].localDate === localDate &&
  Number.isInteger(rows[0].acceptedCount) &&
  rows[0].acceptedCount >= 0 &&
  Number.isInteger(rows[0].reservedCount) &&
  rows[0].reservedCount >= 0;

const maxDate = (...dates: Date[]): Date =>
  new Date(Math.max(...dates.map((date) => date.getTime())));

const isLocalDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
};

const oneStructuredRecord = (result: unknown): unknown | null => {
  if (
    result === null ||
    typeof result !== 'object' ||
    !('affected' in result) ||
    result.affected !== 1 ||
    !('records' in result) ||
    !Array.isArray(result.records) ||
    result.records.length !== 1
  ) {
    return null;
  }

  return result.records[0];
};

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

      if (
        hasOneExpectedDayRow(
          rows,
          candidate.connectedAccountId,
          sample.localDate,
        )
      ) {
        dayRows.set(candidate.connectedAccountId, rows[0]);
      }
    }

    if (dayRows.size !== candidates.length) {
      return INVALID_INPUT_RESULT;
    }

    return this.rankLockedRows(candidates, clockRows, dayRows, {
      localDate: sample.localDate,
      nextLocalMidnightAt,
      observedAt,
    });
  }

  async revalidateForReservationMutation(
    input: RevalidateMailboxCapacityForMutationInput,
    manager: EntityManager,
  ): Promise<RevalidateMailboxCapacityForMutationResult> {
    const queryRunner = manager.queryRunner;

    if (
      !this.isActiveQueryRunner(queryRunner) ||
      !hasValidInput(input.lockInput)
    ) {
      return INVALID_INPUT_RESULT;
    }

    const candidates = selectCandidates(input.lockInput);
    const initialDates = new Set(
      input.initial.lockedCandidates.map(({ localDate }) => localDate),
    );

    if (
      candidates === null ||
      candidates.length === 0 ||
      input.initial.lockedCandidates.length !== candidates.length ||
      initialDates.size !== 1 ||
      candidates.some(
        (candidate, index) =>
          input.initial.lockedCandidates[index]?.sender.connectedAccountId !==
          candidate.connectedAccountId,
      )
    ) {
      return INVALID_INPUT_RESULT;
    }

    const mutationSample = await this.sampleTime(
      queryRunner,
      input.lockInput.workspaceTimeZone,
    );

    if (mutationSample === null) return INVALID_INPUT_RESULT;

    const initialDate = [...initialDates][0];
    let decisiveSample = mutationSample;

    if (mutationSample.localDate !== initialDate) {
      for (const candidate of candidates) {
        await queryRunner.query(DAY_UPSERT_SQL, [
          input.lockInput.workspaceId,
          candidate.connectedAccountId,
          mutationSample.localDate,
        ]);
      }

      for (const candidate of candidates) {
        const rows = (await queryRunner.query(DAY_LOCK_SQL, [
          input.lockInput.workspaceId,
          candidate.connectedAccountId,
          mutationSample.localDate,
        ])) as DayRow[];

        if (
          !hasOneExpectedDayRow(
            rows,
            candidate.connectedAccountId,
            mutationSample.localDate,
          )
        ) {
          return INVALID_INPUT_RESULT;
        }
      }

      const finalSample = await this.sampleTime(
        queryRunner,
        input.lockInput.workspaceTimeZone,
      );

      if (finalSample === null) return INVALID_INPUT_RESULT;
      if (finalSample.localDate !== mutationSample.localDate) {
        return { status: 'MUTATION_WINDOW_STALE' };
      }

      decisiveSample = finalSample;
    }

    return this.rankAlreadyLockedCandidates(
      queryRunner,
      input.lockInput.workspaceId,
      candidates,
      decisiveSample,
    );
  }

  async lockReservationDay(
    input: {
      workspaceId: string;
      connectedAccountId: string;
      localDate: string;
    },
    manager: EntityManager,
  ): Promise<LockedReservationDay> {
    const queryRunner = manager.queryRunner;

    if (
      !this.isActiveQueryRunner(queryRunner) ||
      !isCanonicalUuid(input.workspaceId) ||
      !isCanonicalUuid(input.connectedAccountId) ||
      !isLocalDate(input.localDate)
    ) {
      throw new Error('Invalid reservation day lock input');
    }

    const rows = (await queryRunner.query(DAY_LOCK_SQL, [
      input.workspaceId,
      input.connectedAccountId,
      input.localDate,
    ])) as DayRow[];

    if (
      !hasOneExpectedDayRow(rows, input.connectedAccountId, input.localDate)
    ) {
      throw new Error('Reservation day lock did not return one valid row');
    }

    return { ...input, ...rows[0] };
  }

  async incrementReservedAndAdvanceClock(
    input: {
      lockedDay: LockedReservationDay;
      slotAt: Date;
      minimumSendIntervalMs: number;
    },
    manager: EntityManager,
  ): Promise<void> {
    const queryRunner = manager.queryRunner;
    const { lockedDay } = input;

    if (
      !this.isActiveQueryRunner(queryRunner) ||
      toValidDate(input.slotAt) === null ||
      !Number.isInteger(input.minimumSendIntervalMs) ||
      input.minimumSendIntervalMs < 0
    ) {
      throw new Error('Invalid reservation capacity mutation input');
    }

    const dayResult = await queryRunner.query(
      INCREMENT_RESERVED_SQL,
      [
        lockedDay.workspaceId,
        lockedDay.connectedAccountId,
        lockedDay.localDate,
      ],
      true,
    );
    const dayRecord = oneStructuredRecord(dayResult) as DayRow | null;

    if (
      dayRecord === null ||
      !hasOneExpectedDayRow(
        [dayRecord],
        lockedDay.connectedAccountId,
        lockedDay.localDate,
      ) ||
      dayRecord.acceptedCount !== lockedDay.acceptedCount ||
      dayRecord.reservedCount !== lockedDay.reservedCount + 1
    ) {
      throw new Error('Reservation day increment did not affect one valid row');
    }

    const nextEligibleAt = new Date(
      input.slotAt.getTime() + input.minimumSendIntervalMs,
    );
    const clockResult = await queryRunner.query(
      ADVANCE_CLOCK_SQL,
      [
        lockedDay.workspaceId,
        lockedDay.connectedAccountId,
        input.slotAt,
        nextEligibleAt,
      ],
      true,
    );
    const clockRecord = oneStructuredRecord(clockResult) as ClockRow | null;
    const returnedNextEligibleAt = toValidDate(clockRecord?.nextEligibleAt);

    if (
      clockRecord === null ||
      !hasOneExpectedClockRow([clockRecord], lockedDay.connectedAccountId) ||
      returnedNextEligibleAt === null ||
      returnedNextEligibleAt < nextEligibleAt
    ) {
      throw new Error('Mailbox clock advance did not affect one valid row');
    }
  }

  async releaseReserved(
    lockedDay: LockedReservationDay,
    manager: EntityManager,
  ): Promise<void> {
    await this.mutateReservedCount(
      lockedDay,
      RELEASE_RESERVED_SQL,
      false,
      manager,
    );
  }

  async consumeReserved(
    lockedDay: LockedReservationDay,
    manager: EntityManager,
  ): Promise<void> {
    await this.mutateReservedCount(
      lockedDay,
      CONSUME_RESERVED_SQL,
      true,
      manager,
    );
  }

  private async mutateReservedCount(
    lockedDay: LockedReservationDay,
    sql: string,
    accepted: boolean,
    manager: EntityManager,
  ): Promise<void> {
    const queryRunner = manager.queryRunner;

    if (
      !this.isActiveQueryRunner(queryRunner) ||
      lockedDay.reservedCount <= 0
    ) {
      throw new Error('Invalid reservation capacity transition');
    }

    const result = await queryRunner.query(
      sql,
      [
        lockedDay.workspaceId,
        lockedDay.connectedAccountId,
        lockedDay.localDate,
      ],
      true,
    );
    const record = oneStructuredRecord(result) as DayRow | null;

    if (
      record === null ||
      !hasOneExpectedDayRow(
        [record],
        lockedDay.connectedAccountId,
        lockedDay.localDate,
      ) ||
      record.reservedCount !== lockedDay.reservedCount - 1 ||
      record.acceptedCount !== lockedDay.acceptedCount + (accepted ? 1 : 0)
    ) {
      throw new Error(
        'Reservation capacity transition did not affect one valid row',
      );
    }
  }

  private async sampleTime(
    queryRunner: QueryRunner,
    workspaceTimeZone: string,
  ): Promise<
    (TimeSampleRow & { observedAt: Date; nextLocalMidnightAt: Date }) | null
  > {
    const rows = (await queryRunner.query(TIME_SAMPLE_SQL, [
      workspaceTimeZone,
    ])) as TimeSampleRow[];
    const row = rows[0];
    const observedAt = toValidDate(row?.observedAt);
    const nextLocalMidnightAt = toValidDate(row?.nextLocalMidnightAt);

    if (
      rows.length !== 1 ||
      observedAt === null ||
      nextLocalMidnightAt === null ||
      nextLocalMidnightAt <= observedAt ||
      !isLocalDate(row?.localDate)
    ) {
      return null;
    }

    return {
      ...row,
      localDate: row.localDate,
      nextLocalMidnightAt,
      observedAt,
    };
  }

  private async rankAlreadyLockedCandidates(
    queryRunner: QueryRunner,
    workspaceId: string,
    candidates: ReadyCampaignSenderReadiness[],
    sample: TimeSampleRow & { observedAt: Date; nextLocalMidnightAt: Date },
  ): Promise<RevalidateMailboxCapacityForMutationResult> {
    const clocks = new Map<string, ClockRow>();
    const days = new Map<string, DayRow>();

    for (const sender of candidates) {
      const rows = (await queryRunner.query(CLOCK_LOCK_SQL, [
        workspaceId,
        sender.connectedAccountId,
      ])) as ClockRow[];

      if (!hasOneExpectedClockRow(rows, sender.connectedAccountId)) {
        return INVALID_INPUT_RESULT;
      }
      clocks.set(sender.connectedAccountId, rows[0]);
    }

    for (const sender of candidates) {
      const rows = (await queryRunner.query(DAY_LOCK_SQL, [
        workspaceId,
        sender.connectedAccountId,
        sample.localDate,
      ])) as DayRow[];

      if (
        !hasOneExpectedDayRow(rows, sender.connectedAccountId, sample.localDate)
      ) {
        return INVALID_INPUT_RESULT;
      }
      days.set(sender.connectedAccountId, rows[0]);
    }

    return this.rankLockedRows(candidates, clocks, days, sample);
  }

  private rankLockedRows(
    candidates: ReadyCampaignSenderReadiness[],
    clocks: Map<string, ClockRow>,
    days: Map<string, DayRow>,
    sample: TimeSampleRow & { observedAt: Date; nextLocalMidnightAt: Date },
  ): Exclude<
    RevalidateMailboxCapacityForMutationResult,
    { status: 'MUTATION_WINDOW_STALE' }
  > {
    const lockedCandidates: LockedMailboxCapacityCandidate[] = [];

    for (const sender of candidates) {
      const clockRow = clocks.get(sender.connectedAccountId);
      const dayRow = days.get(sender.connectedAccountId);
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
        usage < sender.dailySendLimit
          ? sample.observedAt
          : sample.nextLocalMidnightAt;

      lockedCandidates.push({
        acceptedCount: dayRow.acceptedCount,
        earliestEligibleAt: maxDate(
          sample.observedAt,
          capacityEligibleAt,
          nextEligibleAt ?? sample.observedAt,
        ),
        localDate: sample.localDate,
        nextEligibleAt,
        nextLocalMidnightAt: sample.nextLocalMidnightAt,
        reservedCount: dayRow.reservedCount,
        sender,
      });
    }

    const selected = [...lockedCandidates].sort(compareLockedCandidates)[0];

    return selected.earliestEligibleAt <= sample.observedAt
      ? {
          lockedCandidates,
          observedAt: sample.observedAt,
          selected,
          status: 'ELIGIBLE_NOW',
        }
      : {
          lockedCandidates,
          nextEligibleAt: selected.earliestEligibleAt,
          observedAt: sample.observedAt,
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
