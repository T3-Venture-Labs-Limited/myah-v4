import { randomUUID } from 'crypto';

import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager, IsNull } from 'typeorm';

import {
  ActionExecutionReceiptEntity,
  ActionExecutionReceiptState,
} from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';
import {
  InstagramActionBlockedWindow as InstagramActionBlockedWindowEntity,
  InstagramActionLimitBlockEntity,
} from 'src/engine/core-modules/instagram-action-budget/entities/instagram-action-limit-block.entity';
import {
  InstagramActionKind as InstagramActionKindEntity,
  InstagramActionReservationEntity,
} from 'src/engine/core-modules/instagram-action-budget/entities/instagram-action-reservation.entity';

import {
  type GetInstagramActionBlockedResultInput,
  type InstagramActionBlockedWindow,
  type InstagramActionBudgetBlockedResult,
  type InstagramActionBudgetReservedResult,
  type InstagramActionBudgetUsage,
  type InspectInstagramActionBudgetInput,
  type ReleasePreDispatchInput,
  type ReleaseStartTargetInput,
  type ReleaseStartTargetForReceiptInput,
  type ReservationTransitionInput,
  type ReserveInstagramActionInput,
} from './instagram-action-budget.types';

const HOURLY_LIMIT = 10 as const;
const DAILY_LIMIT = 100 as const;
const LIMIT_ERROR_CODE = 'INSTAGRAM_ACTION_LIMIT_REACHED' as const;

type UsageRow = {
  hourlyUsed: number | string;
  dailyUsed: number | string;
  hourlyNextEligibleAt: Date | string | null;
  dailyNextEligibleAt: Date | string | null;
};
type UsageSnapshot = {
  usage: InstagramActionBudgetUsage;
  hourlyNextEligibleAt: Date | null;
  dailyNextEligibleAt: Date | null;
};

@Injectable()
export class InstagramActionBudgetService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async inspectUsage(
    input: InspectInstagramActionBudgetInput,
  ): Promise<InstagramActionBudgetUsage> {
    this.assertAccountScope(input);

    return this.dataSource.transaction(async (manager) => {
      const dbNow = await this.dbNow(manager);

      return (await this.readUsage(manager, input, dbNow)).usage;
    });
  }

  async reserve(
    input: ReserveInstagramActionInput,
  ): Promise<
    InstagramActionBudgetReservedResult | InstagramActionBudgetBlockedResult
  > {
    this.assertReserveInput(input);

    return this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `instagram-action-budget:${input.workspaceId}:${input.instagramAccountRecordId}`,
      ]);

      const block = await manager.findOne(InstagramActionLimitBlockEntity, {
        where: {
          actionExecutionReceiptId: input.actionExecutionReceiptId,
          workspaceId: input.workspaceId,
        },
      });
      if (block) return this.toBlockedResult(block);

      const replay = await manager.findOne(InstagramActionReservationEntity, {
        where: {
          actionExecutionReceiptId: input.actionExecutionReceiptId,
          workspaceId: input.workspaceId,
        },
      });
      if (replay) {
        if (
          replay.instagramAccountRecordId !== input.instagramAccountRecordId ||
          replay.actionKind !== input.actionKind ||
          replay.targetFingerprint !== input.targetFingerprint
        ) {
          throw new Error(
            'Existing reservation does not match the requested action',
          );
        }

        return { reservationId: replay.id, status: 'RESERVED' };
      }
      const receipt = await manager.findOne(ActionExecutionReceiptEntity, {
        lock: { mode: 'pessimistic_write' },
        where: {
          id: input.actionExecutionReceiptId,
          workspaceId: input.workspaceId,
        },
      });
      if (!receipt) throw new Error('Action execution receipt not found');
      if (receipt.state !== ActionExecutionReceiptState.PROCESSING) {
        throw new Error('Action execution receipt is not processing');
      }

      if (input.actionKind === 'START_CHAT') {
        const existingTargetClaim = await manager.findOne(
          InstagramActionReservationEntity,
          {
            where: {
              actionKind: InstagramActionKindEntity.START_CHAT,
              instagramAccountRecordId: input.instagramAccountRecordId,
              targetFingerprint: input.targetFingerprint,
              targetLockReleasedAt: IsNull(),
              workspaceId: input.workspaceId,
            },
          },
        );
        if (existingTargetClaim) {
          throw new Error('A START_CHAT reservation already holds this target');
        }
      }

      const dbNow = await this.dbNow(manager);
      const usageSnapshot = await this.readUsage(manager, input, dbNow);
      const { usage } = usageSnapshot;
      const blockedWindows: InstagramActionBlockedWindow[] = [];
      if (usage.hourlyUsed >= HOURLY_LIMIT) blockedWindows.push('HOURLY');
      if (usage.dailyUsed >= DAILY_LIMIT) blockedWindows.push('DAILY');

      if (blockedWindows.length > 0) {
        const result: InstagramActionBudgetBlockedResult = {
          ...usage,
          blockedWindows,
          code: LIMIT_ERROR_CODE,
          nextEligibleAt: this.laterEligibleAt(
            blockedWindows.includes('HOURLY')
              ? usageSnapshot.hourlyNextEligibleAt
              : null,
            blockedWindows.includes('DAILY')
              ? usageSnapshot.dailyNextEligibleAt
              : null,
          ),
          status: 'BLOCKED',
        };
        const limitBlock = manager.create(InstagramActionLimitBlockEntity, {
          actionExecutionReceiptId: input.actionExecutionReceiptId,
          blockedWindows:
            blockedWindows as InstagramActionBlockedWindowEntity[],
          dailyLimit: result.dailyLimit,
          dailyRemaining: result.dailyRemaining,
          dailyUsed: result.dailyUsed,
          errorCode: LIMIT_ERROR_CODE,
          hourlyLimit: result.hourlyLimit,
          hourlyRemaining: result.hourlyRemaining,
          hourlyUsed: result.hourlyUsed,
          id: randomUUID(),
          instagramAccountRecordId: input.instagramAccountRecordId,
          nextEligibleAt: result.nextEligibleAt!,
          workspaceId: input.workspaceId,
        });

        receipt.providerCode = LIMIT_ERROR_CODE;
        receipt.redactedOutcome = LIMIT_ERROR_CODE;
        receipt.state = ActionExecutionReceiptState.BLOCKED;
        await manager.save(ActionExecutionReceiptEntity, receipt);
        await manager.save(InstagramActionLimitBlockEntity, limitBlock);

        return result;
      }

      const reservation = manager.create(InstagramActionReservationEntity, {
        actionExecutionReceiptId: input.actionExecutionReceiptId,
        actionKind: input.actionKind as InstagramActionKindEntity,
        id: randomUUID(),
        instagramAccountRecordId: input.instagramAccountRecordId,
        providerAttemptedAt: null,
        releaseReason: null,
        releasedAt: null,
        reservedAt: dbNow,
        targetFingerprint: input.targetFingerprint,
        targetLockReleasedAt: null,
        workspaceId: input.workspaceId,
      });
      await manager.save(InstagramActionReservationEntity, reservation);

      return { reservationId: reservation.id, status: 'RESERVED' };
    });
  }

  async markProviderAttempted(
    input: ReservationTransitionInput,
  ): Promise<void> {
    this.assertReservationScope(input);

    await this.dataSource.transaction(async (manager) => {
      const reservation = await this.findReservation(manager, input);
      if (reservation.releasedAt) {
        throw new Error(
          'Cannot mark provider attempted after reservation released',
        );
      }
      if (reservation.providerAttemptedAt) return;

      reservation.providerAttemptedAt = await this.dbNow(manager);
      await manager.save(InstagramActionReservationEntity, reservation);
    });
  }

  async releasePreDispatch(input: ReleasePreDispatchInput): Promise<void> {
    this.assertReservationScope(input);
    if (!input.reason.trim()) throw new Error('Release reason is required');

    await this.dataSource.transaction(async (manager) => {
      const reservation = await this.findReservation(manager, input);
      if (reservation.providerAttemptedAt) {
        throw new Error(
          'Cannot release a reservation after provider attempted',
        );
      }
      if (reservation.releasedAt) return;

      const dbNow = await this.dbNow(manager);
      reservation.releaseReason = input.reason;
      reservation.releasedAt = dbNow;
      reservation.targetLockReleasedAt = dbNow;
      await manager.save(InstagramActionReservationEntity, reservation);
    });
  }

  async releaseStartTarget(input: ReleaseStartTargetInput): Promise<void> {
    this.assertReservationScope(input);
    if (!['PROJECTED', 'KNOWN_REJECTION', 'RESOLVED'].includes(input.reason)) {
      throw new Error('Invalid START_CHAT target release reason');
    }

    await this.dataSource.transaction(async (manager) => {
      const reservation = await this.findReservation(manager, input);
      if (reservation.actionKind !== InstagramActionKindEntity.START_CHAT) {
        throw new Error('Only START_CHAT reservations hold a target lock');
      }
      if (reservation.targetLockReleasedAt) return;

      reservation.targetLockReleasedAt = await this.dbNow(manager);
      await manager.save(InstagramActionReservationEntity, reservation);
    });
  }

  async releaseStartTargetForReceipt(
    input: ReleaseStartTargetForReceiptInput,
  ): Promise<void> {
    this.assertReceiptScope(input);

    await this.dataSource.transaction(async (manager) => {
      const reservation = await manager.findOne(
        InstagramActionReservationEntity,
        {
          lock: { mode: 'pessimistic_write' },
          where: {
            workspaceId: input.workspaceId,
            actionExecutionReceiptId: input.actionExecutionReceiptId,
          },
        },
      );
      if (
        !reservation ||
        reservation.actionKind !== InstagramActionKindEntity.START_CHAT ||
        reservation.targetLockReleasedAt
      ) {
        return;
      }

      reservation.targetLockReleasedAt = await this.dbNow(manager);
      await manager.save(InstagramActionReservationEntity, reservation);
    });
  }

  async getBlockedResult(
    input: GetInstagramActionBlockedResultInput,
  ): Promise<InstagramActionBudgetBlockedResult | null> {
    this.assertReceiptScope(input);

    const block = await this.dataSource.transaction((manager) =>
      manager.findOne(InstagramActionLimitBlockEntity, {
        where: {
          actionExecutionReceiptId: input.actionExecutionReceiptId,
          workspaceId: input.workspaceId,
        },
      }),
    );

    return block ? this.toBlockedResult(block) : null;
  }

  private async readUsage(
    manager: EntityManager,
    input: InspectInstagramActionBudgetInput,
    dbNow: Date,
  ): Promise<UsageSnapshot> {
    const [usage] = await manager.query<UsageRow[]>(
      `SELECT
        COUNT(*) FILTER (
          WHERE "reservedAt" > $3::timestamptz - INTERVAL '1 hour'
        ) AS "hourlyUsed",
        COUNT(*) FILTER (
          WHERE "reservedAt" > $3::timestamptz - INTERVAL '24 hours'
        ) AS "dailyUsed",
        MIN("reservedAt") FILTER (
          WHERE "reservedAt" > $3::timestamptz - INTERVAL '1 hour'
        ) + INTERVAL '1 hour' AS "hourlyNextEligibleAt",
        MIN("reservedAt") FILTER (
          WHERE "reservedAt" > $3::timestamptz - INTERVAL '24 hours'
        ) + INTERVAL '24 hours' AS "dailyNextEligibleAt"
      FROM "core"."instagramActionReservation"
      WHERE "workspaceId" = $1
        AND "instagramAccountRecordId" = $2
        AND "releasedAt" IS NULL`,
      [input.workspaceId, input.instagramAccountRecordId, dbNow],
    );

    const hourlyUsed = Number(usage?.hourlyUsed ?? 0);
    const dailyUsed = Number(usage?.dailyUsed ?? 0);
    const hourlyNextEligibleAt = this.asDate(usage?.hourlyNextEligibleAt);
    const dailyNextEligibleAt = this.asDate(usage?.dailyNextEligibleAt);

    return {
      dailyNextEligibleAt,
      hourlyNextEligibleAt,
      usage: {
        dailyLimit: DAILY_LIMIT,
        dailyRemaining: Math.max(DAILY_LIMIT - dailyUsed, 0),
        dailyUsed,
        hourlyLimit: HOURLY_LIMIT,
        hourlyRemaining: Math.max(HOURLY_LIMIT - hourlyUsed, 0),
        hourlyUsed,
        nextEligibleAt: this.laterEligibleAt(
          hourlyUsed >= HOURLY_LIMIT ? hourlyNextEligibleAt : null,
          dailyUsed >= DAILY_LIMIT ? dailyNextEligibleAt : null,
        ),
      },
    };
  }

  private async dbNow(manager: EntityManager): Promise<Date> {
    const [row] = await manager.query<{ dbNow: Date | string }[]>(
      'SELECT clock_timestamp() AS "dbNow"',
    );

    return this.asDate(row.dbNow)!;
  }

  private async findReservation(
    manager: EntityManager,
    input: ReservationTransitionInput,
  ): Promise<InstagramActionReservationEntity> {
    const reservation = await manager.findOne(
      InstagramActionReservationEntity,
      {
        lock: { mode: 'pessimistic_write' },
        where: { id: input.reservationId, workspaceId: input.workspaceId },
      },
    );
    if (!reservation) throw new Error('Instagram action reservation not found');

    return reservation;
  }

  private toBlockedResult(
    block: InstagramActionLimitBlockEntity,
  ): InstagramActionBudgetBlockedResult {
    return {
      blockedWindows: block.blockedWindows as InstagramActionBlockedWindow[],
      code: LIMIT_ERROR_CODE,
      dailyLimit: block.dailyLimit as 100,
      dailyRemaining: block.dailyRemaining,
      dailyUsed: block.dailyUsed,
      hourlyLimit: block.hourlyLimit as 10,
      hourlyRemaining: block.hourlyRemaining,
      hourlyUsed: block.hourlyUsed,
      nextEligibleAt: block.nextEligibleAt,
      status: 'BLOCKED',
    };
  }

  private laterEligibleAt(left: Date | null, right: Date | null): Date | null {
    if (!left) return right;
    if (!right) return left;

    return left > right ? left : right;
  }

  private asDate(value: Date | string | null | undefined): Date | null {
    if (!value) return null;

    return value instanceof Date ? value : new Date(value);
  }

  private assertAccountScope(input: InspectInstagramActionBudgetInput): void {
    if (!input.workspaceId || !input.instagramAccountRecordId) {
      throw new Error(
        'Workspace and Instagram account identifiers are required',
      );
    }
  }

  private assertReceiptScope(
    input: GetInstagramActionBlockedResultInput,
  ): void {
    if (!input.workspaceId || !input.actionExecutionReceiptId) {
      throw new Error(
        'Workspace and action execution receipt identifiers are required',
      );
    }
  }

  private assertReservationScope(input: ReservationTransitionInput): void {
    if (!input.workspaceId || !input.reservationId) {
      throw new Error('Workspace and reservation identifiers are required');
    }
  }

  private assertReserveInput(input: ReserveInstagramActionInput): void {
    this.assertAccountScope(input);
    this.assertReceiptScope(input);
    if (!['START_CHAT', 'REPLY'].includes(input.actionKind)) {
      throw new Error('Invalid Instagram action kind');
    }
    if (!/^[a-f0-9]{64}$/i.test(input.targetFingerprint)) {
      throw new Error('Invalid Instagram action target fingerprint');
    }
  }
}
