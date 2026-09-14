import { FindOperator } from 'typeorm';

import {
  ActionExecutionReceiptEntity,
  ActionExecutionReceiptState,
} from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';
import { InstagramActionReservationEntity } from 'src/engine/core-modules/instagram-action-budget/entities/instagram-action-reservation.entity';
import { InstagramActionLimitBlockEntity } from 'src/engine/core-modules/instagram-action-budget/entities/instagram-action-limit-block.entity';

type ActionKind = 'START_CHAT' | 'REPLY';
type BlockedWindow = 'HOURLY' | 'DAILY';
type Usage = {
  hourlyUsed: number;
  hourlyLimit: 10;
  hourlyRemaining: number;
  dailyUsed: number;
  dailyLimit: 100;
  dailyRemaining: number;
  nextEligibleAt: Date | null;
};
type BlockedResult = Usage & {
  code: 'INSTAGRAM_ACTION_LIMIT_REACHED';
  blockedWindows: BlockedWindow[];
  reservationId?: never;
  status: 'BLOCKED';
};
type ReservedResult = { reservationId: string; status: 'RESERVED' };
type Reservation = {
  actionExecutionReceiptId: string;
  actionKind: ActionKind;
  id: string;
  instagramAccountRecordId: string;
  providerAttemptedAt: Date | null;
  releaseReason: string | null;
  releasedAt: Date | null;
  reservedAt: Date;
  targetFingerprint: string;
  targetLockReleasedAt: Date | null;
  workspaceId: string;
};
type Receipt = {
  id: string;
  providerCode: string | null;
  redactedOutcome: string | null;
  state: ActionExecutionReceiptState;
  workspaceId: string;
};
type LimitBlock = Omit<BlockedResult, 'code' | 'status'> & {
  actionExecutionReceiptId: string;
  errorCode: 'INSTAGRAM_ACTION_LIMIT_REACHED';
  id: string;
  instagramAccountRecordId: string;
  workspaceId: string;
};
type InstagramActionBudgetApi = {
  inspectUsage(input: {
    instagramAccountRecordId: string;
    workspaceId: string;
  }): Promise<Usage>;
  reserve(input: {
    actionExecutionReceiptId: string;
    actionKind: ActionKind;
    instagramAccountRecordId: string;
    targetFingerprint: string;
    workspaceId: string;
  }): Promise<ReservedResult | BlockedResult>;
  markProviderAttempted(input: {
    reservationId: string;
    workspaceId: string;
  }): Promise<void>;
  releasePreDispatch(input: {
    reason: string;
    reservationId: string;
    workspaceId: string;
  }): Promise<void>;
  releaseStartTarget(input: {
    reason: 'PROJECTED' | 'KNOWN_REJECTION' | 'RESOLVED';
    reservationId: string;
    workspaceId: string;
  }): Promise<void>;
  getBlockedResult(input: {
    actionExecutionReceiptId: string;
    workspaceId: string;
  }): Promise<BlockedResult | null>;
};
type InstagramActionBudgetServiceModule = {
  InstagramActionBudgetService: new (
    dataSource: unknown,
  ) => InstagramActionBudgetApi;
};

const workspaceId = '00000000-0000-4000-8000-000000000001';
const otherWorkspaceId = '00000000-0000-4000-8000-000000000002';
const instagramAccountRecordId = '00000000-0000-4000-8000-000000000003';
const otherInstagramAccountRecordId = '00000000-0000-4000-8000-000000000004';
const receiptId = '00000000-0000-4000-8000-000000000005';
const otherReceiptId = '00000000-0000-4000-8000-000000000006';
const targetFingerprint = 'a'.repeat(64);
const otherTargetFingerprint = 'b'.repeat(64);
const dbNow = new Date('2026-09-05T12:00:00.000Z');

const requireService = (): InstagramActionBudgetServiceModule => {
  try {
    return require('../instagram-action-budget.service') as InstagramActionBudgetServiceModule;
  } catch {
    throw new Error('InstagramActionBudgetService is not implemented');
  }
};

const clone = <T>(value: T): T => structuredClone(value);

class BudgetTransactionHarness {
  private transactionTail: Promise<void> = Promise.resolve();

  public readonly calls: Array<{ parameters?: unknown[]; sql: string }> = [];
  public readonly dataSource = {
    transaction: jest.fn(
      (callback: (manager: typeof this.manager) => unknown) => {
        const previousTransaction = this.transactionTail;
        let releaseTransaction!: () => void;

        this.transactionTail = new Promise<void>((resolve) => {
          releaseTransaction = resolve;
        });

        return previousTransaction.then(async () => {
          const snapshot = {
            blocks: clone(this.blocks),
            receipts: clone(this.receipts),
            reservations: clone(this.reservations),
          };

          try {
            return await callback(this.manager);
          } catch (error) {
            this.blocks = snapshot.blocks;
            this.receipts = snapshot.receipts;
            this.reservations = snapshot.reservations;
            throw error;
          } finally {
            releaseTransaction();
          }
        });
      },
    ),
  };
  public blocks: LimitBlock[] = [];
  public failBlockSave = false;
  public receipts: Receipt[] = [
    {
      id: receiptId,
      providerCode: null,
      redactedOutcome: null,
      state: ActionExecutionReceiptState.PROCESSING,
      workspaceId,
    },
    {
      id: otherReceiptId,
      providerCode: null,
      redactedOutcome: null,
      state: ActionExecutionReceiptState.PROCESSING,
      workspaceId,
    },
  ];
  public reservations: Reservation[] = [];

  public readonly manager = {
    create: jest.fn((_entity: unknown, value: object) => value),
    find: jest.fn(async (entity: unknown, options: { where?: object }) => {
      if (entity !== InstagramActionReservationEntity) {
        return [];
      }

      return this.reservations.filter((reservation) =>
        this.matches(reservation, options.where ?? {}),
      );
    }),
    findOne: jest.fn(async (entity: unknown, options: { where?: object }) => {
      const collection =
        entity === ActionExecutionReceiptEntity
          ? this.receipts
          : entity === InstagramActionReservationEntity
            ? this.reservations
            : entity === InstagramActionLimitBlockEntity
              ? this.blocks
              : [];

      return (
        collection.find((value) => this.matches(value, options.where ?? {})) ??
        null
      );
    }),
    query: jest.fn(async (sql: string, parameters?: unknown[]) => {
      this.calls.push({ parameters, sql });
      if (sql.includes('pg_advisory_xact_lock')) {
        return [];
      }
      if (sql.includes('instagramActionReservation') && sql.includes('COUNT')) {
        const [queryWorkspaceId, queryAccountId] = parameters as [
          string,
          string,
        ];
        const active = this.reservations.filter(
          (reservation) =>
            reservation.workspaceId === queryWorkspaceId &&
            reservation.instagramAccountRecordId === queryAccountId &&
            reservation.releasedAt === null,
        );
        const hourly = active.filter(
          ({ reservedAt }) =>
            reservedAt > new Date(dbNow.getTime() - 3_600_000),
        );
        const daily = active.filter(
          ({ reservedAt }) =>
            reservedAt > new Date(dbNow.getTime() - 86_400_000),
        );
        const firstHourly = [...hourly].sort(
          (left, right) =>
            left.reservedAt.getTime() - right.reservedAt.getTime(),
        )[0];
        const firstDaily = [...daily].sort(
          (left, right) =>
            left.reservedAt.getTime() - right.reservedAt.getTime(),
        )[0];

        return [
          {
            dailyNextEligibleAt: firstDaily
              ? new Date(firstDaily.reservedAt.getTime() + 86_400_000)
              : null,
            dailyUsed: daily.length,
            hourlyNextEligibleAt: firstHourly
              ? new Date(firstHourly.reservedAt.getTime() + 3_600_000)
              : null,
            hourlyUsed: hourly.length,
          },
        ];
      }
      if (sql === 'SELECT clock_timestamp() AS "dbNow"') {
        return [{ dbNow }];
      }

      return [];
    }),
    save: jest.fn(async (entity: unknown, value: object) => {
      if (entity === InstagramActionReservationEntity) {
        const reservation = value as Reservation;
        const index = this.reservations.findIndex(
          ({ id }) => id === reservation.id,
        );
        if (index === -1) this.reservations.push(reservation);
        else this.reservations[index] = reservation;
        return reservation;
      }
      if (entity === InstagramActionLimitBlockEntity) {
        if (this.failBlockSave)
          throw new Error('injected block persistence failure');
        const block = value as LimitBlock;
        const index = this.blocks.findIndex(({ id }) => id === block.id);
        if (index === -1) this.blocks.push(block);
        else this.blocks[index] = block;
        return block;
      }
      if (entity === ActionExecutionReceiptEntity) {
        const receipt = value as Receipt;
        const index = this.receipts.findIndex(({ id }) => id === receipt.id);
        if (index === -1) this.receipts.push(receipt);
        else this.receipts[index] = receipt;
        return receipt;
      }

      throw new Error('Unexpected entity persistence');
    }),
  };

  public addReservation(overrides: Partial<Reservation> = {}): Reservation {
    const reservation: Reservation = {
      actionExecutionReceiptId: `00000000-0000-4000-8000-${String(
        this.reservations.length + 10,
      ).padStart(12, '0')}`,
      actionKind: 'REPLY',
      id: `reservation-${this.reservations.length + 1}`,
      instagramAccountRecordId,
      providerAttemptedAt: null,
      releaseReason: null,
      releasedAt: null,
      reservedAt: new Date(dbNow.getTime() - 60_000),
      targetFingerprint: otherTargetFingerprint,
      targetLockReleasedAt: null,
      workspaceId,
      ...overrides,
    };
    this.reservations.push(reservation);

    return reservation;
  }

  private matches(value: object, where: object): boolean {
    return Object.entries(where).every(([key, expected]) => {
      const actual = (value as Record<string, unknown>)[key];

      return expected instanceof FindOperator && expected.type === 'isNull'
        ? actual === null
        : actual === expected;
    });
  }
}

const createService = () => {
  const harness = new BudgetTransactionHarness();
  const { InstagramActionBudgetService } = requireService();

  return {
    harness,
    service: new InstagramActionBudgetService(harness.dataSource as never),
  };
};

const reserveInput = (overrides = {}) => ({
  actionExecutionReceiptId: receiptId,
  actionKind: 'START_CHAT' as const,
  instagramAccountRecordId,
  targetFingerprint,
  workspaceId,
  ...overrides,
});

const expectUsage = (usage: Usage, expected: Partial<Usage>) => {
  expect(usage).toEqual({
    dailyLimit: 100,
    dailyRemaining: Math.max(100 - (expected.dailyUsed ?? 0), 0),
    dailyUsed: 0,
    hourlyLimit: 10,
    hourlyRemaining: Math.max(10 - (expected.hourlyUsed ?? 0), 0),
    hourlyUsed: 0,
    nextEligibleAt: null,
    ...expected,
  });
};

describe('InstagramActionBudgetService', () => {
  it('uses the PostgreSQL clock and counts only unreleased account reservations inside strict rolling windows', async () => {
    const { harness, service } = createService();
    harness.addReservation({
      reservedAt: new Date(dbNow.getTime() - 3_599_999),
    });
    harness.addReservation({
      reservedAt: new Date(dbNow.getTime() - 3_600_000),
    });
    harness.addReservation({
      reservedAt: new Date(dbNow.getTime() - 86_399_999),
    });
    harness.addReservation({
      releasedAt: new Date(dbNow.getTime() - 1),
      reservedAt: new Date(dbNow.getTime() - 60_000),
    });
    harness.addReservation({
      instagramAccountRecordId: otherInstagramAccountRecordId,
      reservedAt: new Date(dbNow.getTime() - 60_000),
    });

    const usage = await service.inspectUsage({
      instagramAccountRecordId,
      workspaceId,
    });

    expectUsage(usage, {
      dailyUsed: 3,
      hourlyUsed: 1,
      nextEligibleAt: null,
    });
    expect(harness.calls.map(({ sql }) => sql)).toEqual(
      expect.arrayContaining(['SELECT clock_timestamp() AS "dbNow"']),
    );
    const count = harness.calls.find(
      ({ sql }) =>
        sql.includes('instagramActionReservation') && sql.includes('COUNT'),
    );
    expect(count).toEqual(
      expect.objectContaining({
        parameters: [workspaceId, instagramAccountRecordId, dbNow],
      }),
    );
    expect(count?.sql).toContain('"releasedAt" IS NULL');
    expect(count?.sql).toContain(
      '"reservedAt" > $3::timestamptz - INTERVAL \'1 hour\'',
    );
    expect(count?.sql).toContain(
      '"reservedAt" > $3::timestamptz - INTERVAL \'24 hours\'',
    );
    expect(count?.sql).not.toContain('CURRENT_TIMESTAMP');
  });

  describe.each([
    {
      label: 'available with one recent reservation',
      hourly: 1,
      older: 0,
      olderAge: 7_200_000,
      delay: null,
      windows: [],
    },
    {
      label: 'hourly-only exhausted',
      hourly: 10,
      older: 0,
      olderAge: 7_200_000,
      delay: 3_540_000,
      windows: ['HOURLY'],
    },
    {
      label: 'daily-only exhausted with an earlier daily expiry',
      hourly: 1,
      older: 99,
      olderAge: 84_600_000,
      delay: 1_800_000,
      windows: ['DAILY'],
    },
    {
      label: 'both exhausted with daily expiring last',
      hourly: 10,
      older: 90,
      olderAge: 7_200_000,
      delay: 79_200_000,
      windows: ['HOURLY', 'DAILY'],
    },
    {
      label: 'both exhausted with hourly expiring last',
      hourly: 10,
      older: 90,
      olderAge: 84_600_000,
      delay: 3_540_000,
      windows: ['HOURLY', 'DAILY'],
    },
  ])('$label eligibility', ({ hourly, older, olderAge, delay, windows }) => {
    const setup = () => {
      const context = createService();
      for (let index = 0; index < hourly; index++)
        context.harness.addReservation();
      for (let index = 0; index < older; index++) {
        context.harness.addReservation({
          reservedAt: new Date(dbNow.getTime() - olderAge),
        });
      }
      return context;
    };
    const expectedUsage = {
      dailyLimit: 100,
      dailyRemaining: 100 - hourly - older,
      dailyUsed: hourly + older,
      hourlyLimit: 10,
      hourlyRemaining: 10 - hourly,
      hourlyUsed: hourly,
      nextEligibleAt: delay === null ? null : new Date(dbNow.getTime() + delay),
    };

    it('inspects only exhausted windows without mutating capacity', async () => {
      const { harness, service } = setup();
      await expect(
        service.inspectUsage({ instagramAccountRecordId, workspaceId }),
      ).resolves.toEqual(expectedUsage);
      expect(harness.manager.save).not.toHaveBeenCalled();
      expect(harness.reservations).toHaveLength(hourly + older);
    });

    it('preserves fresh reservation or persisted block results', async () => {
      const { harness, service } = setup();
      const result = await service.reserve(reserveInput());
      if (windows.length === 0) {
        expect(result).toEqual({
          status: 'RESERVED',
          reservationId: expect.any(String),
        });
        expect(harness.reservations).toHaveLength(hourly + older + 1);
        expect(harness.reservations[hourly + older]).toMatchObject({
          reservedAt: dbNow,
        });
        expect(harness.blocks).toEqual([]);
        await expect(
          service.inspectUsage({ instagramAccountRecordId, workspaceId }),
        ).resolves.toEqual({
          ...expectedUsage,
          hourlyUsed: hourly + 1,
          hourlyRemaining: 9 - hourly,
          dailyUsed: hourly + older + 1,
          dailyRemaining: 99 - hourly - older,
        });
      } else {
        expect(result).toEqual({
          ...expectedUsage,
          blockedWindows: windows,
          code: 'INSTAGRAM_ACTION_LIMIT_REACHED',
          status: 'BLOCKED',
        });
        expect(harness.reservations).toHaveLength(hourly + older);
        expect(harness.blocks).toHaveLength(1);
        expect(harness.blocks[0]).toMatchObject({
          ...expectedUsage,
          blockedWindows: windows,
        });
        expect(harness.receipts[0].state).toBe(
          ActionExecutionReceiptState.BLOCKED,
        );
        await expect(
          service.getBlockedResult({
            actionExecutionReceiptId: receiptId,
            workspaceId,
          }),
        ).resolves.toEqual(result);
      }
    });
  });

  it.each([
    ['tenth hourly action', 9, 0, 'RESERVED', null, null],
    ['eleventh hourly action', 10, 0, 'BLOCKED', 0, 90],
    ['hundredth daily action', 0, 99, 'RESERVED', null, null],
    ['one hundred first daily action', 0, 100, 'BLOCKED', 10, 0],
  ] as const)(
    'enforces the %s boundary',
    async (_label, hourly, daily, status, hourlyRemaining, dailyRemaining) => {
      const { harness, service } = createService();
      for (let index = 0; index < daily; index++) {
        harness.addReservation({
          reservedAt: new Date(dbNow.getTime() - 3_600_001),
        });
      }
      for (let index = 0; index < hourly; index++) harness.addReservation();

      const result = await service.reserve(reserveInput());

      expect(result.status).toBe(status);
      if (status === 'BLOCKED') {
        expect(result).toMatchObject({
          code: 'INSTAGRAM_ACTION_LIMIT_REACHED',
          dailyLimit: 100,
          dailyRemaining,
          hourlyLimit: 10,
          hourlyRemaining,
        });
      } else {
        expect(result).toEqual({
          reservationId: expect.any(String),
          status: 'RESERVED',
        });
      }
    },
  );

  it('records every exhausted window and chooses the later eligible instant', async () => {
    const { harness, service } = createService();
    for (let index = 0; index < 100; index++) {
      harness.addReservation({
        reservedAt: new Date(
          dbNow.getTime() - (index < 10 ? 60_000 : 7_200_000),
        ),
      });
    }

    await expect(service.reserve(reserveInput())).resolves.toMatchObject({
      blockedWindows: ['HOURLY', 'DAILY'],
      code: 'INSTAGRAM_ACTION_LIMIT_REACHED',
      dailyRemaining: 0,
      dailyUsed: 100,
      hourlyRemaining: 0,
      hourlyUsed: 10,
      nextEligibleAt: new Date(dbNow.getTime() + 86_400_000 - 7_200_000),
      status: 'BLOCKED',
    });
  });

  it('replays immutable records before locking a fresh receipt, then takes one account-locked database clock for capacity evidence', async () => {
    const { harness, service } = createService();

    await service.reserve(reserveInput());
    await service.reserve(reserveInput());

    expect(harness.dataSource.transaction).toHaveBeenCalledTimes(2);
    expect(harness.calls[0]).toEqual({
      parameters: [
        `instagram-action-budget:${workspaceId}:${instagramAccountRecordId}`,
      ],
      sql: 'SELECT pg_advisory_xact_lock(hashtext($1))',
    });
    const blockReplayIndex = harness.manager.findOne.mock.calls.findIndex(
      ([entity]) => entity === InstagramActionLimitBlockEntity,
    );
    const reservationReplayIndex = harness.manager.findOne.mock.calls.findIndex(
      ([entity]) => entity === InstagramActionReservationEntity,
    );
    const receiptLockIndex = harness.manager.findOne.mock.calls.findIndex(
      ([entity]) => entity === ActionExecutionReceiptEntity,
    );
    const dbClockIndex = harness.manager.query.mock.calls.findIndex(
      ([sql]) => sql === 'SELECT clock_timestamp() AS "dbNow"',
    );

    expect(blockReplayIndex).toBeLessThan(receiptLockIndex);
    expect(reservationReplayIndex).toBeLessThan(receiptLockIndex);
    expect(harness.manager.findOne).toHaveBeenCalledWith(
      ActionExecutionReceiptEntity,
      {
        lock: { mode: 'pessimistic_write' },
        where: { id: receiptId, workspaceId },
      },
    );
    expect(harness.manager.query.mock.calls).toHaveLength(4);
    expect(dbClockIndex).toBeGreaterThan(0);
    expect(
      harness.manager.query.mock.invocationCallOrder[dbClockIndex],
    ).toBeGreaterThan(harness.manager.query.mock.invocationCallOrder[0]);
    expect(harness.reservations[0]).toMatchObject({ reservedAt: dbNow });
    expect(harness.manager.save).toHaveBeenCalledTimes(1);
  });

  it('rejects a mismatched replay without consuming capacity or changing the existing reservation', async () => {
    const { harness, service } = createService();
    const first = await service.reserve(reserveInput());
    expect(first.status).toBe('RESERVED');

    await expect(
      service.reserve(
        reserveInput({ targetFingerprint: otherTargetFingerprint }),
      ),
    ).rejects.toThrow('does not match');

    expect(harness.reservations).toHaveLength(1);
    expect(harness.manager.save).toHaveBeenCalledTimes(1);
  });
  it('replays a matching reservation after its receipt becomes terminal without mutating capacity', async () => {
    const { harness, service } = createService();
    const replay = harness.addReservation({
      actionExecutionReceiptId: receiptId,
      actionKind: 'START_CHAT',
      targetFingerprint,
    });
    harness.receipts[0].state = ActionExecutionReceiptState.SENT;

    await expect(service.reserve(reserveInput())).resolves.toEqual({
      reservationId: replay.id,
      status: 'RESERVED',
    });

    expect(harness.manager.findOne).not.toHaveBeenCalledWith(
      ActionExecutionReceiptEntity,
      expect.anything(),
    );
    expect(harness.manager.save).not.toHaveBeenCalled();
  });

  it.each([
    ActionExecutionReceiptState.FAILED,
    ActionExecutionReceiptState.SENT,
  ])(
    'rejects a new reservation or exhausted-budget block for a %s receipt without mutation',
    async (state) => {
      const { harness, service } = createService();
      harness.receipts[0].state = state;
      for (let index = 0; index < 10; index++) harness.addReservation();

      await expect(service.reserve(reserveInput())).rejects.toThrow(
        'not processing',
      );

      expect(harness.manager.findOne).toHaveBeenCalledWith(
        ActionExecutionReceiptEntity,
        {
          lock: { mode: 'pessimistic_write' },
          where: { id: receiptId, workspaceId },
        },
      );
      expect(harness.blocks).toEqual([]);
      expect(harness.reservations).toHaveLength(10);
      expect(harness.receipts[0]).toMatchObject({
        providerCode: null,
        redactedOutcome: null,
        state,
      });
      expect(harness.manager.save).not.toHaveBeenCalled();
      expect(harness.calls).toEqual([
        {
          parameters: [
            `instagram-action-budget:${workspaceId}:${instagramAccountRecordId}`,
          ],
          sql: 'SELECT pg_advisory_xact_lock(hashtext($1))',
        },
      ]);
    },
  );

  it('treats receipt-scoped blocks as immutable reserve replays and exposes them only in their workspace', async () => {
    const { harness, service } = createService();
    const block: LimitBlock = {
      actionExecutionReceiptId: receiptId,
      blockedWindows: ['HOURLY'],
      dailyLimit: 100,
      dailyRemaining: 80,
      dailyUsed: 20,
      errorCode: 'INSTAGRAM_ACTION_LIMIT_REACHED',
      hourlyLimit: 10,
      hourlyRemaining: 0,
      hourlyUsed: 10,
      id: 'block-id',
      instagramAccountRecordId,
      nextEligibleAt: new Date(dbNow.getTime() + 3_600_000),
      workspaceId,
    };
    const expected: BlockedResult = {
      blockedWindows: ['HOURLY'],
      code: 'INSTAGRAM_ACTION_LIMIT_REACHED',
      dailyLimit: 100,
      dailyRemaining: 80,
      dailyUsed: 20,
      hourlyLimit: 10,
      hourlyRemaining: 0,
      hourlyUsed: 10,
      nextEligibleAt: new Date(dbNow.getTime() + 3_600_000),
      status: 'BLOCKED',
    };
    harness.receipts[0].state = ActionExecutionReceiptState.BLOCKED;
    harness.blocks.push(block);

    await expect(service.reserve(reserveInput())).resolves.toEqual(expected);
    await expect(
      service.getBlockedResult({
        actionExecutionReceiptId: receiptId,
        workspaceId: otherWorkspaceId,
      }),
    ).resolves.toBeNull();
    await expect(
      service.getBlockedResult({
        actionExecutionReceiptId: receiptId,
        workspaceId,
      }),
    ).resolves.toEqual(expected);
    expect(harness.calls).toHaveLength(1);
    expect(harness.manager.findOne).not.toHaveBeenCalledWith(
      ActionExecutionReceiptEntity,
      expect.anything(),
    );
  });

  it('persists a block and a safe blocked receipt atomically, rolling both back on block persistence failure', async () => {
    const { harness, service } = createService();
    for (let index = 0; index < 10; index++) harness.addReservation();
    harness.failBlockSave = true;

    await expect(service.reserve(reserveInput())).rejects.toThrow(
      'injected block persistence failure',
    );

    expect(harness.blocks).toEqual([]);
    expect(harness.receipts.find(({ id }) => id === receiptId)).toMatchObject({
      providerCode: null,
      redactedOutcome: null,
      state: ActionExecutionReceiptState.PROCESSING,
    });
  });

  it('persists exactly one limit block and a safe PROCESSING-to-BLOCKED receipt transition', async () => {
    const { harness, service } = createService();
    for (let index = 0; index < 10; index++) harness.addReservation();

    await expect(service.reserve(reserveInput())).resolves.toMatchObject({
      code: 'INSTAGRAM_ACTION_LIMIT_REACHED',
      status: 'BLOCKED',
    });
    await expect(service.reserve(reserveInput())).resolves.toMatchObject({
      code: 'INSTAGRAM_ACTION_LIMIT_REACHED',
      status: 'BLOCKED',
    });

    expect(harness.blocks).toHaveLength(1);
    expect(harness.receipts.find(({ id }) => id === receiptId)).toMatchObject({
      providerCode: 'INSTAGRAM_ACTION_LIMIT_REACHED',
      redactedOutcome: 'INSTAGRAM_ACTION_LIMIT_REACHED',
      state: ActionExecutionReceiptState.BLOCKED,
    });
  });

  it('holds a START_CHAT target across receipts but permits REPLY reuse and shaped concurrent calls leave one winner', async () => {
    const { service } = createService();
    const start = reserveInput();
    const secondStart = reserveInput({
      actionExecutionReceiptId: otherReceiptId,
    });

    const [first, second] = await Promise.allSettled([
      service.reserve(start),
      service.reserve(secondStart),
    ]);
    expect(
      [first, second].filter(({ status }) => status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      [first, second].filter(({ status }) => status === 'rejected'),
    ).toHaveLength(1);

    const reply = await service.reserve(
      reserveInput({
        actionExecutionReceiptId: otherReceiptId,
        actionKind: 'REPLY',
      }),
    );
    expect(reply.status).toBe('RESERVED');
  });

  it.each([
    ['releasePreDispatch', 'PROJECTED', false],
    ['releaseStartTarget', 'PROJECTED', true],
    ['releaseStartTarget', 'KNOWN_REJECTION', true],
    ['releaseStartTarget', 'RESOLVED', true],
  ] as const)(
    '%s applies only its permitted release transition',
    async (method, reason, targetOnly) => {
      const { harness, service } = createService();
      const reserved = await service.reserve(reserveInput());
      if (reserved.status !== 'RESERVED')
        throw new Error('expected reservation');
      harness.manager.findOne.mockClear();

      if (method === 'releasePreDispatch') {
        await service.releasePreDispatch({
          reason,
          reservationId: reserved.reservationId,
          workspaceId,
        });
      } else {
        await service.releaseStartTarget({
          reason,
          reservationId: reserved.reservationId,
          workspaceId,
        });
      }
      expect(harness.manager.findOne).toHaveBeenCalledWith(
        InstagramActionReservationEntity,
        {
          lock: { mode: 'pessimistic_write' },
          where: { id: reserved.reservationId, workspaceId },
        },
      );

      expect(harness.reservations[0]).toMatchObject(
        targetOnly
          ? { releasedAt: null, targetLockReleasedAt: dbNow }
          : {
              releaseReason: reason,
              releasedAt: dbNow,
              targetLockReleasedAt: dbNow,
            },
      );
    },
  );

  it('releases pre-dispatch capacity only before a provider attempt, while attempted capacity stays held', async () => {
    const { harness, service } = createService();
    const reserved = await service.reserve(reserveInput());
    if (reserved.status !== 'RESERVED') throw new Error('expected reservation');

    harness.manager.findOne.mockClear();
    await service.markProviderAttempted({
      reservationId: reserved.reservationId,
      workspaceId,
    });
    await service.markProviderAttempted({
      reservationId: reserved.reservationId,
      workspaceId,
    });
    await expect(
      service.releasePreDispatch({
        reason: 'transport aborted',
        reservationId: reserved.reservationId,
        workspaceId,
      }),
    ).rejects.toThrow('provider attempted');
    for (const [entity, options] of harness.manager.findOne.mock.calls) {
      expect(entity).toBe(InstagramActionReservationEntity);
      expect(options).toMatchObject({
        lock: { mode: 'pessimistic_write' },
        where: { id: reserved.reservationId, workspaceId },
      });
    }
    expect(harness.reservations[0]).toMatchObject({
      providerAttemptedAt: dbNow,
      releasedAt: null,
      targetLockReleasedAt: null,
    });
  });
  it('keeps capacity when a concurrent provider attempt wins over pre-dispatch release', async () => {
    const { harness, service } = createService();
    const reserved = await service.reserve(reserveInput());
    if (reserved.status !== 'RESERVED') throw new Error('expected reservation');

    const [attempt, release] = await Promise.allSettled([
      service.markProviderAttempted({
        reservationId: reserved.reservationId,
        workspaceId,
      }),
      service.releasePreDispatch({
        reason: 'transport aborted',
        reservationId: reserved.reservationId,
        workspaceId,
      }),
    ]);

    expect(attempt.status).toBe('fulfilled');
    expect(release.status).toBe('rejected');
    expect(harness.reservations[0]).toMatchObject({
      providerAttemptedAt: dbNow,
      releasedAt: null,
      targetLockReleasedAt: null,
    });
  });

  it('prevents dispatch when a concurrent pre-dispatch release wins over the provider attempt', async () => {
    const { harness, service } = createService();
    const reserved = await service.reserve(reserveInput());
    if (reserved.status !== 'RESERVED') throw new Error('expected reservation');

    const [release, attempt] = await Promise.allSettled([
      service.releasePreDispatch({
        reason: 'transport aborted',
        reservationId: reserved.reservationId,
        workspaceId,
      }),
      service.markProviderAttempted({
        reservationId: reserved.reservationId,
        workspaceId,
      }),
    ]);

    expect(release.status).toBe('fulfilled');
    expect(attempt.status).toBe('rejected');
    expect(harness.reservations[0]).toMatchObject({
      providerAttemptedAt: null,
      releaseReason: 'transport aborted',
      releasedAt: dbNow,
      targetLockReleasedAt: dbNow,
    });
  });

  it('scope-checks every mutation so another workspace cannot mark or release a reservation', async () => {
    const { harness, service } = createService();
    const reserved = await service.reserve(reserveInput());
    if (reserved.status !== 'RESERVED') throw new Error('expected reservation');

    await expect(
      service.markProviderAttempted({
        reservationId: reserved.reservationId,
        workspaceId: otherWorkspaceId,
      }),
    ).rejects.toThrow('not found');
    await expect(
      service.releaseStartTarget({
        reason: 'RESOLVED',
        reservationId: reserved.reservationId,
        workspaceId: otherWorkspaceId,
      }),
    ).rejects.toThrow('not found');
    expect(harness.reservations[0]).toMatchObject({
      providerAttemptedAt: null,
      releasedAt: null,
      targetLockReleasedAt: null,
    });
  });
});
