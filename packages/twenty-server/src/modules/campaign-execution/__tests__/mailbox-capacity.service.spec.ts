import { runInNewContext } from 'node:vm';

import { MODULE_METADATA } from '@nestjs/common/constants';
import { ConnectedAccountProvider } from 'twenty-shared/types';
import { type EntityManager, getMetadataArgsStorage } from 'typeorm';

import { CampaignExecutionModule } from 'src/modules/campaign-execution/campaign-execution.module';
import { MailboxCapacityDayEntity } from 'src/engine/core-modules/campaign-execution/entities/mailbox-capacity-day.entity';
import { MailboxDispatchClockEntity } from 'src/engine/core-modules/campaign-execution/entities/mailbox-dispatch-clock.entity';
import { OutboundEmailAttemptEntity } from 'src/engine/core-modules/campaign-execution/entities/outbound-email-attempt.entity';
import { MailboxCapacityService } from 'src/modules/campaign-execution/services/mailbox-capacity.service';
import { OutboundEmailAttemptService } from 'src/modules/campaign-execution/services/outbound-email-attempt.service';
import {
  type LockedMailboxCapacityCandidate,
  type LockAndRankMailboxCapacityInput,
} from 'src/modules/campaign-execution/types/mailbox-capacity-candidate.type';
import { type ReadyCampaignSenderReadiness } from 'src/modules/myah-campaign/types/campaign-sender-pool.type';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const accountA = '33333333-3333-4333-8333-333333333333';
const accountB = '22222222-2222-4222-8222-222222222222';
const channelA = '55555555-5555-4555-8555-555555555555';
const channelB = '44444444-4444-4444-8444-444444444444';
const aliasAccount = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const candidate = (
  connectedAccountId: string,
  messageChannelId: string,
  overrides: Partial<ReadyCampaignSenderReadiness> = {},
): ReadyCampaignSenderReadiness => ({
  bindingStatus: 'RESOLVED_BINDING',
  campaignAccountId: `campaign-${connectedAccountId}`,
  connectedAccountId,
  dailySendLimit: 50,
  messageChannelId,
  minimumSendIntervalMs: 300_000,
  missingBinding: null,
  provider: ConnectedAccountProvider.GOOGLE,
  reason: null,
  recoveryPath: null,
  senderHandle: `${connectedAccountId}@example.com`,
  status: 'READY',
  ...overrides,
});

const rotateInput = (
  candidates = [candidate(accountA, channelA), candidate(accountB, channelB)],
): LockAndRankMailboxCapacityInput => ({
  workspaceId,
  workspaceTimeZone: 'America/New_York',
  candidates,
  selectionConstraint: { kind: 'ROTATE' },
});

type ClockRow = {
  connectedAccountId: string;
  nextEligibleAt: Date | null;
};
type DayRow = {
  acceptedCount: number;
  connectedAccountId: string;
  reservedCount: number;
};
type HarnessOptions = {
  clockRows?: Record<string, ClockRow[]>;
  dayRows?: Record<string, DayRow[]>;
  observedAt?: Date;
  localDate?: string;
  nextLocalMidnightAt?: Date;
};

const createHarness = (options: HarnessOptions = {}) => {
  const calls: Array<{ params: unknown[]; sql: string }> = [];
  const observedAt = options.observedAt ?? new Date('2026-03-10T14:00:00.000Z');
  const localDate = options.localDate ?? '2026-03-10';
  const nextLocalMidnightAt =
    options.nextLocalMidnightAt ?? new Date('2026-03-11T04:00:00.000Z');

  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (sql.includes('INSERT INTO "core"."mailboxDispatchClock"')) {
      return [];
    }
    if (sql.includes('FROM "core"."mailboxDispatchClock"')) {
      const id = params[1] as string;

      return (
        options.clockRows?.[id] ?? [
          { connectedAccountId: id, nextEligibleAt: null },
        ]
      );
    }
    if (sql.includes('MATERIALIZED')) {
      return [{ localDate, nextLocalMidnightAt, observedAt }];
    }
    if (sql.includes('INSERT INTO "core"."mailboxCapacityDay"')) {
      return [];
    }
    if (sql.includes('FROM "core"."mailboxCapacityDay"')) {
      const id = params[1] as string;

      return (
        options.dayRows?.[id] ?? [
          { acceptedCount: 0, connectedAccountId: id, reservedCount: 0 },
        ]
      ).map((row) => ({ localDate: params[2], ...row }));
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  const queryRunner = { isTransactionActive: true, query };
  const manager = { queryRunner } as unknown as EntityManager;

  return {
    calls,
    manager,
    query,
    queryRunner,
    service: new MailboxCapacityService(),
  };
};

const callLabels = (calls: Array<{ params: unknown[]; sql: string }>) =>
  calls.map(({ params, sql }) => {
    if (sql.includes('INSERT INTO "core"."mailboxDispatchClock"')) {
      return `clock-upsert:${params[1]}`;
    }
    if (sql.includes('FROM "core"."mailboxDispatchClock"')) {
      return `clock-lock:${params[1]}`;
    }
    if (sql.includes('MATERIALIZED')) {
      return 'time-sample';
    }
    if (sql.includes('INSERT INTO "core"."mailboxCapacityDay"')) {
      return `day-upsert:${params[1]}:${params[2]}`;
    }

    return `day-lock:${params[1]}:${params[2]}`;
  });

const metadataFor = (target: Function) => {
  const metadata = getMetadataArgsStorage();

  return {
    checks: metadata.checks.filter((item) => item.target === target),
    columns: metadata.columns.filter((item) => item.target === target),
    relations: metadata.relations.filter((item) => item.target === target),
    table: metadata.tables.find((item) => item.target === target),
    uniques: metadata.uniques.filter((item) => item.target === target),
  };
};

const columnOptions = (target: Function, propertyName: string) =>
  metadataFor(target).columns.find(
    (column) => column.propertyName === propertyName,
  )?.options;

describe('MailboxCapacityService', () => {
  it('accepts genuine cross-realm database dates while rejecting Date lookalikes', async () => {
    const observedAt = runInNewContext(
      `new Date('2026-03-10T14:00:00.000Z')`,
    ) as Date;
    const nextLocalMidnightAt = runInNewContext(
      `new Date('2026-03-11T04:00:00.000Z')`,
    ) as Date;
    expect(observedAt).not.toBeInstanceOf(Date);
    const validHarness = createHarness({ observedAt, nextLocalMidnightAt });

    await expect(
      validHarness.service.lockAndRankForReservation(
        rotateInput([candidate(accountA, channelA)]),
        validHarness.manager,
      ),
    ).resolves.toMatchObject({ status: 'ELIGIBLE_NOW' });

    const invalidHarness = createHarness({
      observedAt: { getTime: () => observedAt.getTime() } as unknown as Date,
    });
    await expect(
      invalidHarness.service.lockAndRankForReservation(
        rotateInput([candidate(accountA, channelA)]),
        invalidHarness.manager,
      ),
    ).resolves.toEqual({
      reason: 'INVALID_CAPACITY_INPUT',
      status: 'BLOCKED',
    });
  });

  it('revalidates from a final post-new-day-lock sample before choosing the decisive winner', async () => {
    const first = new Date('2026-03-11T03:59:59.000Z');
    const crossed = new Date('2026-03-11T04:00:01.000Z');
    const final = new Date('2026-03-11T04:01:02.000Z');
    const samples = [crossed, final];
    const calls: string[] = [];
    const query = jest.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('MATERIALIZED')) {
        const observedAt = samples.shift() as Date;
        calls.push(`sample:${observedAt.toISOString()}`);
        return [
          {
            localDate: '2026-03-11',
            nextLocalMidnightAt: new Date('2026-03-12T04:00:00.000Z'),
            observedAt,
          },
        ];
      }
      if (sql.includes('INSERT INTO "core"."mailboxCapacityDay"')) {
        calls.push(`day-upsert:${params[1]}`);
        return [];
      }
      if (sql.includes('FROM "core"."mailboxCapacityDay"')) {
        calls.push(`day-lock:${params[1]}`);
        return [
          {
            acceptedCount: 0,
            connectedAccountId: params[1],
            localDate: params[2],
            reservedCount: 0,
          },
        ];
      }
      if (sql.includes('FROM "core"."mailboxDispatchClock"')) {
        return [{ connectedAccountId: params[1], nextEligibleAt: null }];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const service = new MailboxCapacityService();
    const input = rotateInput();
    const initial = {
      lockedCandidates: [...input.candidates]
        .sort((left, right) =>
          left.connectedAccountId.localeCompare(right.connectedAccountId),
        )
        .map((sender) => ({
          acceptedCount: 0,
          earliestEligibleAt: first,
          localDate: '2026-03-10',
          nextEligibleAt: null,
          nextLocalMidnightAt: crossed,
          reservedCount: 0,
          sender,
        })),
      observedAt: first,
      selected: undefined as never,
      status: 'ELIGIBLE_NOW' as const,
    };
    initial.selected = initial.lockedCandidates[0] as never;

    const result = await service.revalidateForReservationMutation(
      { initial, lockInput: input },
      {
        queryRunner: { isTransactionActive: true, query },
      } as unknown as EntityManager,
    );

    expect(result.status).toBe('ELIGIBLE_NOW');
    if (result.status !== 'ELIGIBLE_NOW') return;
    expect(result.observedAt).toEqual(final);
    expect(calls).toContain(`sample:${final.toISOString()}`);
    expect(calls.indexOf(`sample:${final.toISOString()}`)).toBeGreaterThan(
      calls.indexOf(`day-lock:${accountA}`),
    );
    expect(calls.filter((call) => call.startsWith('day-lock:'))).toHaveLength(
      4,
    );
  });

  it('uses only the supplied active query runner and does not open a transaction', async () => {
    const harness = createHarness();

    const result = await harness.service.lockAndRankForReservation(
      rotateInput(),
      harness.manager,
    );

    expect(result.status).toBe('ELIGIBLE_NOW');
    expect(harness.query).toHaveBeenCalled();
    expect(Object.keys(harness.manager)).toEqual(['queryRunner']);
    expect(Object.keys(harness.queryRunner)).toEqual([
      'isTransactionActive',
      'query',
    ]);
  });

  it.each([
    ['missing runner', {}],
    ['inactive runner', { queryRunner: { isTransactionActive: false } }],
  ])('fails closed with a %s', async (_label, manager) => {
    const result = await new MailboxCapacityService().lockAndRankForReservation(
      rotateInput(),
      manager as EntityManager,
    );

    expect(result).toEqual({
      reason: 'INVALID_CAPACITY_INPUT',
      status: 'BLOCKED',
    });
  });

  it.each([
    ['workspace', { workspaceId: '' }],
    ['timezone', { workspaceTimeZone: 'Not/A_Timezone' }],
    ['empty candidates', { candidates: [] }],
    [
      'duplicate account',
      {
        candidates: [
          candidate(accountA, channelA),
          candidate(accountA, channelA),
        ],
      },
    ],
    [
      'negative limit',
      { candidates: [candidate(accountA, channelA, { dailySendLimit: -1 })] },
    ],
    [
      'fractional limit',
      { candidates: [candidate(accountA, channelA, { dailySendLimit: 1.5 })] },
    ],
    [
      'negative spacing',
      {
        candidates: [
          candidate(accountA, channelA, { minimumSendIntervalMs: -1 }),
        ],
      },
    ],
  ])(
    'rejects invalid %s before aggregate row mutation',
    async (_label, patch) => {
      const harness = createHarness();
      const result = await harness.service.lockAndRankForReservation(
        { ...rotateInput(), ...patch } as LockAndRankMailboxCapacityInput,
        harness.manager,
      );

      expect(result).toEqual({
        reason: 'INVALID_CAPACITY_INPUT',
        status: 'BLOCKED',
      });
      expect(harness.query).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['malformed workspace ID', { workspaceId: 'not-a-uuid' }],
    [
      'mixed-case workspace ID',
      { workspaceId: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA' },
    ],
    [
      'malformed candidate account ID',
      { candidates: [candidate('not-a-uuid', channelA)] },
    ],
    [
      'mixed-case candidate channel ID',
      {
        candidates: [
          candidate(accountA, 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'),
        ],
      },
    ],
  ])('rejects %s before any SQL', async (_label, patch) => {
    const harness = createHarness();
    const result = await harness.service.lockAndRankForReservation(
      { ...rotateInput(), ...patch },
      harness.manager,
    );

    expect(result).toEqual({
      reason: 'INVALID_CAPACITY_INPUT',
      status: 'BLOCKED',
    });
    expect(harness.query).not.toHaveBeenCalled();
  });

  it('rejects mixed-case UUID aliases before they can reverse lock order', async () => {
    const harness = createHarness();
    const result = await harness.service.lockAndRankForReservation(
      rotateInput([
        candidate(aliasAccount, channelA),
        candidate(aliasAccount.toUpperCase(), channelB),
      ]),
      harness.manager,
    );

    expect(result).toEqual({
      reason: 'INVALID_CAPACITY_INPUT',
      status: 'BLOCKED',
    });
    expect(harness.query).not.toHaveBeenCalled();
  });

  it.each([
    ['malformed exact account ID', 'not-a-uuid', channelA],
    [
      'mixed-case exact account ID',
      'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA',
      channelA,
    ],
    ['malformed exact channel ID', accountA, 'not-a-uuid'],
    [
      'mixed-case exact channel ID',
      accountA,
      'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA',
    ],
  ])('rejects %s before any SQL', async (_label, id, channel) => {
    const harness = createHarness();
    const result = await harness.service.lockAndRankForReservation(
      {
        ...rotateInput([candidate(accountA, channelA)]),
        selectionConstraint: {
          connectedAccountId: id,
          kind: 'EXPLICIT',
          messageChannelId: channel,
          senderHandle: `${accountA}@example.com`,
        },
      },
      harness.manager,
    );

    expect(result).toEqual({
      reason: 'INVALID_CAPACITY_INPUT',
      status: 'BLOCKED',
    });
    expect(harness.query).not.toHaveBeenCalled();
  });

  it('does not expose or use caller time as eligibility authority', async () => {
    const harness = createHarness({
      localDate: '2026-03-11',
      nextLocalMidnightAt: new Date('2026-03-12T04:00:00.000Z'),
      observedAt: new Date('2026-03-11T04:01:00.000Z'),
    });
    const input = {
      ...rotateInput([candidate(accountA, channelA)]),
      callerTime: new Date('2026-03-11T03:59:00.000Z'),
    } as LockAndRankMailboxCapacityInput;

    const result = await harness.service.lockAndRankForReservation(
      input,
      harness.manager,
    );
    const allSql = harness.calls.map(({ sql }) => sql).join('\n');

    expect(result).toMatchObject({
      observedAt: new Date('2026-03-11T04:01:00.000Z'),
      selected: { localDate: '2026-03-11' },
      status: 'ELIGIBLE_NOW',
    });
    expect(allSql.match(/clock_timestamp\(\)/gi)).toHaveLength(1);
    expect(allSql).toMatch(/WITH\s+sampled_time\s+AS\s+MATERIALIZED/i);
    expect(allSql).not.toMatch(/CURRENT_TIMESTAMP|\bnow\s*\(/i);
    expect(
      harness.calls.find(({ sql }) => sql.includes('MATERIALIZED'))?.params,
    ).toEqual(['America/New_York']);
  });

  it('upserts and locks all clocks in stable order before one time sample, then all days before ranking', async () => {
    const harness = createHarness({
      clockRows: {
        [accountA]: [
          {
            connectedAccountId: accountA,
            nextEligibleAt: new Date('2026-03-10T14:10:00.000Z'),
          },
        ],
      },
      dayRows: {
        [accountA]: [
          { acceptedCount: 0, connectedAccountId: accountA, reservedCount: 0 },
        ],
        [accountB]: [
          { acceptedCount: 50, connectedAccountId: accountB, reservedCount: 0 },
        ],
      },
    });

    const result = await harness.service.lockAndRankForReservation(
      rotateInput(),
      harness.manager,
    );

    expect(callLabels(harness.calls)).toEqual([
      `clock-upsert:${accountB}`,
      `clock-upsert:${accountA}`,
      `clock-lock:${accountB}`,
      `clock-lock:${accountA}`,
      'time-sample',
      `day-upsert:${accountB}:2026-03-10`,
      `day-upsert:${accountA}:2026-03-10`,
      `day-lock:${accountB}:2026-03-10`,
      `day-lock:${accountA}:2026-03-10`,
    ]);
    expect(harness.calls.map(({ params }) => params)).toEqual([
      [workspaceId, accountB],
      [workspaceId, accountA],
      [workspaceId, accountB],
      [workspaceId, accountA],
      ['America/New_York'],
      [workspaceId, accountB, '2026-03-10'],
      [workspaceId, accountA, '2026-03-10'],
      [workspaceId, accountB, '2026-03-10'],
      [workspaceId, accountA, '2026-03-10'],
    ]);
    for (const { sql } of harness.calls.filter(({ sql }) =>
      sql.includes('FROM "core"."mailboxDispatchClock"'),
    )) {
      expect(sql).toMatch(
        /WHERE\s+"workspaceId"\s*=\s*\$1\s+AND\s+"connectedAccountId"\s*=\s*\$2/i,
      );
    }
    for (const { sql } of harness.calls.filter(({ sql }) =>
      sql.includes('FROM "core"."mailboxCapacityDay"'),
    )) {
      expect(sql).toMatch(
        /WHERE\s+"workspaceId"\s*=\s*\$1\s+AND\s+"connectedAccountId"\s*=\s*\$2\s+AND\s+"localDate"\s*=\s*\$3/i,
      );
    }
    expect(result).toMatchObject({
      lockedCandidates: expect.arrayContaining([
        expect.objectContaining({
          sender: expect.objectContaining({ connectedAccountId: accountA }),
        }),
      ]),
      nextEligibleAt: new Date('2026-03-10T14:10:00.000Z'),
      status: 'NOT_READY',
    });
    expect(
      harness.calls.filter(({ sql }) => /FOR UPDATE/i.test(sql)),
    ).toHaveLength(4);
    expect(
      harness.calls.filter(({ sql }) => /ON CONFLICT DO NOTHING/i.test(sql)),
    ).toHaveLength(4);
  });

  it('uses only an exact pinned binding and never falls back', async () => {
    const exact = candidate(accountA, channelA, {
      senderHandle: ' Sender@Example.com ',
    });
    const harness = createHarness();

    await harness.service.lockAndRankForReservation(
      {
        ...rotateInput([candidate(accountB, channelB), exact]),
        selectionConstraint: {
          connectedAccountId: accountA,
          kind: 'PINNED_REPLY',
          messageChannelId: channelA,
          senderHandle: 'sender@example.COM',
        },
      },
      harness.manager,
    );

    expect(callLabels(harness.calls)).toEqual([
      `clock-upsert:${accountA}`,
      `clock-lock:${accountA}`,
      'time-sample',
      `day-upsert:${accountA}:2026-03-10`,
      `day-lock:${accountA}:2026-03-10`,
    ]);
  });

  it.each([
    ['absent account', accountB, channelA, 'sender@example.com'],
    ['mismatched channel', accountA, channelB, 'sender@example.com'],
    ['mismatched normalized handle', accountA, channelA, 'other@example.com'],
  ])(
    'blocks pinned sender with %s without fallback',
    async (_label, id, channel, handle) => {
      const harness = createHarness();
      const result = await harness.service.lockAndRankForReservation(
        {
          ...rotateInput([
            candidate(accountA, channelA, {
              senderHandle: 'Sender@Example.com',
            }),
          ]),
          selectionConstraint: {
            connectedAccountId: id,
            kind: 'EXPLICIT',
            messageChannelId: channel,
            senderHandle: handle,
          },
        },
        harness.manager,
      );

      expect(result).toEqual({
        reason: 'PINNED_SENDER_NOT_READY',
        status: 'BLOCKED',
      });
      expect(harness.query).not.toHaveBeenCalled();
    },
  );

  it('chooses earliest eligibility, then lower usage, then stable account ID', async () => {
    const observedAt = new Date('2026-03-10T14:00:00.000Z');
    const next = new Date('2026-03-10T14:05:00.000Z');
    const earliestHarness = createHarness({
      clockRows: {
        [accountA]: [{ connectedAccountId: accountA, nextEligibleAt: next }],
        [accountB]: [
          { connectedAccountId: accountB, nextEligibleAt: observedAt },
        ],
      },
    });
    const earliest = await earliestHarness.service.lockAndRankForReservation(
      rotateInput(),
      earliestHarness.manager,
    );

    expect(earliest).toMatchObject({
      selected: { sender: { connectedAccountId: accountB } },
      status: 'ELIGIBLE_NOW',
    });

    const lowerUsageHarness = createHarness({
      dayRows: {
        [accountA]: [
          { acceptedCount: 4, connectedAccountId: accountA, reservedCount: 0 },
        ],
        [accountB]: [
          { acceptedCount: 2, connectedAccountId: accountB, reservedCount: 3 },
        ],
      },
    });
    const lowerUsage =
      await lowerUsageHarness.service.lockAndRankForReservation(
        rotateInput(),
        lowerUsageHarness.manager,
      );

    expect(lowerUsage).toMatchObject({
      selected: {
        acceptedCount: 4,
        reservedCount: 0,
        sender: { connectedAccountId: accountA },
      },
    });

    const stableHarness = createHarness();
    const stable = await stableHarness.service.lockAndRankForReservation(
      rotateInput(),
      stableHarness.manager,
    );

    expect(stable).toMatchObject({
      selected: { sender: { connectedAccountId: accountB } },
    });
  });

  it.each([
    [49, 'ELIGIBLE_NOW', '2026-03-10T14:00:00.000Z'],
    [50, 'NOT_READY', '2026-03-11T04:00:00.000Z'],
  ])(
    'gates locked usage %i against a daily limit of 50',
    async (usage, status, eligibleAt) => {
      const harness = createHarness({
        dayRows: {
          [accountA]: [
            {
              acceptedCount: usage - 1,
              connectedAccountId: accountA,
              reservedCount: 1,
            },
          ],
        },
      });
      const result = await harness.service.lockAndRankForReservation(
        rotateInput([candidate(accountA, channelA)]),
        harness.manager,
      );

      expect(result.status).toBe(status);
      if (result.status === 'BLOCKED') {
        throw new Error('Expected a ranked capacity result');
      }
      expect(
        result.status === 'ELIGIBLE_NOW'
          ? result.selected.earliestEligibleAt
          : result.nextEligibleAt,
      ).toEqual(new Date(eligibleAt));
    },
  );

  it.each([
    ['exact boundary', '2026-03-10T14:00:00.000Z', 'ELIGIBLE_NOW'],
    ['five-minute spacing', '2026-03-10T14:05:00.000Z', 'NOT_READY'],
  ])(
    'honors %s from the global dispatch clock',
    async (_label, nextEligibleAt, status) => {
      const harness = createHarness({
        clockRows: {
          [accountA]: [
            {
              connectedAccountId: accountA,
              nextEligibleAt: new Date(nextEligibleAt),
            },
          ],
        },
      });
      const result = await harness.service.lockAndRankForReservation(
        rotateInput([candidate(accountA, channelA)]),
        harness.manager,
      );

      expect(result.status).toBe(status);
    },
  );

  it.each([
    [
      'spring DST',
      '2026-03-08T06:59:00.000Z',
      '2026-03-08',
      '2026-03-09T04:00:00.000Z',
    ],
    [
      'fall DST',
      '2026-11-01T05:01:00.000Z',
      '2026-11-01',
      '2026-11-02T05:00:00.000Z',
    ],
  ])(
    'shapes DB-derived %s boundaries without JS timezone arithmetic',
    async (_label, observed, date, midnight) => {
      const harness = createHarness({
        localDate: date,
        nextLocalMidnightAt: new Date(midnight),
        observedAt: new Date(observed),
      });
      const result = await harness.service.lockAndRankForReservation(
        rotateInput([candidate(accountA, channelA)]),
        harness.manager,
      );

      expect(result).toMatchObject({
        observedAt: new Date(observed),
        selected: {
          localDate: date,
          nextLocalMidnightAt: new Date(midnight),
        },
      });
    },
  );

  it('lets a 23:59 spacing gate through 00:04 outrank the midnight reset', async () => {
    const spacingEnd = new Date('2026-03-11T04:04:00.000Z');
    const harness = createHarness({
      clockRows: {
        [accountA]: [
          { connectedAccountId: accountA, nextEligibleAt: spacingEnd },
        ],
      },
      dayRows: {
        [accountA]: [
          { acceptedCount: 50, connectedAccountId: accountA, reservedCount: 0 },
        ],
      },
      nextLocalMidnightAt: new Date('2026-03-11T04:00:00.000Z'),
      observedAt: new Date('2026-03-11T03:59:00.000Z'),
    });
    const result = await harness.service.lockAndRankForReservation(
      rotateInput([candidate(accountA, channelA)]),
      harness.manager,
    );

    expect(result).toMatchObject({
      nextEligibleAt: spacingEnd,
      status: 'NOT_READY',
    });
  });

  it('returns the earliest exact NOT_READY without capacity mutation', async () => {
    const first = new Date('2026-03-10T14:05:00.000Z');
    const second = new Date('2026-03-10T14:10:00.000Z');
    const harness = createHarness({
      clockRows: {
        [accountA]: [{ connectedAccountId: accountA, nextEligibleAt: second }],
        [accountB]: [{ connectedAccountId: accountB, nextEligibleAt: first }],
      },
    });
    const result = await harness.service.lockAndRankForReservation(
      rotateInput(),
      harness.manager,
    );
    const allSql = harness.calls.map(({ sql }) => sql).join('\n');

    expect(result).toMatchObject({
      nextEligibleAt: first,
      status: 'NOT_READY',
    });
    expect(harness.calls.some(({ sql }) => /^\s*UPDATE\b/i.test(sql))).toBe(
      false,
    );
    expect(allSql).not.toMatch(/attempt|reservation|receipt/i);
  });

  it.each([
    ['missing clock row', { clockRows: { [accountA]: [] } }],
    [
      'duplicate clock row',
      {
        clockRows: {
          [accountA]: [
            { connectedAccountId: accountA, nextEligibleAt: null },
            { connectedAccountId: accountA, nextEligibleAt: null },
          ],
        },
      },
    ],
    ['missing day row', { dayRows: { [accountA]: [] } }],
    [
      'duplicate day row',
      {
        dayRows: {
          [accountA]: [
            {
              acceptedCount: 0,
              connectedAccountId: accountA,
              reservedCount: 0,
            },
            {
              acceptedCount: 0,
              connectedAccountId: accountA,
              reservedCount: 0,
            },
          ],
        },
      },
    ],
    [
      'negative count',
      {
        dayRows: {
          [accountA]: [
            {
              acceptedCount: -1,
              connectedAccountId: accountA,
              reservedCount: 0,
            },
          ],
        },
      },
    ],
  ])(
    'fails closed on %s instead of ranking partial state',
    async (_label, options) => {
      const harness = createHarness(options);
      const result = await harness.service.lockAndRankForReservation(
        rotateInput([candidate(accountA, channelA)]),
        harness.manager,
      );

      expect(result).toEqual({
        reason: 'INVALID_CAPACITY_INPUT',
        status: 'BLOCKED',
      });
    },
  );
});

describe('campaign capacity entity and module metadata', () => {
  it('maps the dispatch clock aggregate without an account foreign key', () => {
    const metadata = metadataFor(MailboxDispatchClockEntity);

    expect(metadata.table).toMatchObject({
      name: 'mailboxDispatchClock',
      schema: 'core',
    });
    expect(columnOptions(MailboxDispatchClockEntity, 'id')).toMatchObject({
      type: 'uuid',
    });
    expect(
      columnOptions(MailboxDispatchClockEntity, 'workspaceId'),
    ).toMatchObject({
      nullable: false,
      type: 'uuid',
    });
    expect(
      columnOptions(MailboxDispatchClockEntity, 'connectedAccountId'),
    ).toMatchObject({
      nullable: false,
      type: 'uuid',
    });
    expect(
      columnOptions(MailboxDispatchClockEntity, 'nextEligibleAt'),
    ).toMatchObject({
      nullable: true,
      type: 'timestamptz',
    });
    expect(metadata.uniques).toEqual([
      expect.objectContaining({
        columns: ['workspaceId', 'connectedAccountId'],
        name: 'UQ_MAILBOX_DISPATCH_CLOCK_WORKSPACE_ACCOUNT',
      }),
    ]);
    expect(metadata.relations).toHaveLength(0);
  });

  it('maps the local-day aggregate counts, constraints, and no account foreign key', () => {
    const metadata = metadataFor(MailboxCapacityDayEntity);

    expect(metadata.table).toMatchObject({
      name: 'mailboxCapacityDay',
      schema: 'core',
    });
    expect(columnOptions(MailboxCapacityDayEntity, 'localDate')).toMatchObject({
      nullable: false,
      type: 'date',
    });
    for (const propertyName of ['reservedCount', 'acceptedCount']) {
      expect(
        columnOptions(MailboxCapacityDayEntity, propertyName),
      ).toMatchObject({
        default: 0,
        nullable: false,
        type: 'integer',
      });
    }
    expect(metadata.uniques).toEqual([
      expect.objectContaining({
        columns: ['workspaceId', 'connectedAccountId', 'localDate'],
        name: 'UQ_MAILBOX_CAPACITY_DAY_WORKSPACE_ACCOUNT_LOCAL_DATE',
      }),
    ]);
    expect(metadata.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          expression: '"reservedCount" >= 0',
          name: 'CHK_MAILBOX_CAPACITY_DAY_RESERVED_COUNT_NONNEGATIVE',
        }),
        expect.objectContaining({
          expression: '"acceptedCount" >= 0',
          name: 'CHK_MAILBOX_CAPACITY_DAY_ACCEPTED_COUNT_NONNEGATIVE',
        }),
      ]),
    );
    expect(metadata.relations).toHaveLength(0);
    expect(
      metadata.columns.map(({ propertyName }) => propertyName),
    ).not.toContain('dailySendLimit');
  });

  it('registers and exports the capacity and sole-attempt entities and services', () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      CampaignExecutionModule,
    );
    const exports = Reflect.getMetadata(
      MODULE_METADATA.EXPORTS,
      CampaignExecutionModule,
    );
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      CampaignExecutionModule,
    );

    expect(providers).toEqual([
      MailboxCapacityService,
      OutboundEmailAttemptService,
    ]);
    expect(exports).toHaveLength(3);
    expect(exports).toEqual(
      expect.arrayContaining([
        MailboxCapacityService,
        OutboundEmailAttemptService,
      ]),
    );
    expect(imports).toHaveLength(1);
    // SAFETY: Nest stores TypeOrmModule.forFeature metadata on this dynamic module.
    const typeOrmImport = imports[0] as {
      providers: Array<{ targetEntitySchema: { target: Function } }>;
    };

    expect(
      typeOrmImport.providers.map(
        ({ targetEntitySchema }) => targetEntitySchema.target,
      ),
    ).toEqual([
      MailboxDispatchClockEntity,
      MailboxCapacityDayEntity,
      OutboundEmailAttemptEntity,
    ]);
  });
});

describe('MailboxCapacityService mutation revalidation and CAS', () => {
  const initialEligible = () => {
    const input = rotateInput();
    const observedAt = new Date('2026-03-11T03:59:59.000Z');
    const lockedCandidates = [...input.candidates]
      .sort((left, right) =>
        left.connectedAccountId.localeCompare(right.connectedAccountId),
      )
      .map((sender) => ({
        acceptedCount: 0,
        earliestEligibleAt: observedAt,
        localDate: '2026-03-10',
        nextEligibleAt: null,
        nextLocalMidnightAt: new Date('2026-03-11T04:00:00.000Z'),
        reservedCount: 0,
        sender,
      }));

    return {
      input,
      initial: {
        lockedCandidates,
        observedAt,
        selected: lockedCandidates[0],
        status: 'ELIGIBLE_NOW' as const,
      },
    };
  };

  it('stops after one newly locked date when the post-wait sample crosses a second date', async () => {
    const { initial, input } = initialEligible();
    const samples = [
      {
        localDate: '2026-03-11',
        nextLocalMidnightAt: new Date('2026-03-12T04:00:00.000Z'),
        observedAt: new Date('2026-03-11T04:00:01.000Z'),
      },
      {
        localDate: '2026-03-12',
        nextLocalMidnightAt: new Date('2026-03-13T04:00:00.000Z'),
        observedAt: new Date('2026-03-12T04:00:01.000Z'),
      },
    ];
    const query = jest.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('MATERIALIZED')) return [samples.shift()];
      if (sql.includes('INSERT INTO "core"."mailboxCapacityDay"')) return [];
      if (sql.includes('FROM "core"."mailboxCapacityDay"')) {
        return [
          {
            acceptedCount: 0,
            connectedAccountId: params[1],
            localDate: params[2],
            reservedCount: 0,
          },
        ];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const result =
      await new MailboxCapacityService().revalidateForReservationMutation(
        { initial, lockInput: input },
        {
          queryRunner: { isTransactionActive: true, query },
        } as unknown as EntityManager,
      );

    expect(result).toEqual({ status: 'MUTATION_WINDOW_STALE' });
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('UPDATE "core"."mailboxCapacityDay"'),
      ),
    ).toBe(false);
  });

  it('uses a same-day mutation sample to change the genuine initial winner after another spacing gate expires', async () => {
    const { initial, input } = initialEligible();
    const expiringGate = new Date('2026-03-11T03:59:59.250Z');
    const initiallyGated = initial.lockedCandidates.find(
      ({ sender }) => sender.connectedAccountId === accountB,
    ) as LockedMailboxCapacityCandidate | undefined;
    const initialWinner = initial.lockedCandidates.find(
      ({ sender }) => sender.connectedAccountId === accountA,
    );

    if (initiallyGated === undefined || initialWinner === undefined) {
      throw new Error('Invalid winner-change fixture');
    }
    initiallyGated.nextEligibleAt = expiringGate;
    initiallyGated.earliestEligibleAt = expiringGate;
    initial.selected = initialWinner;
    expect(initial.selected.sender.connectedAccountId).toBe(accountA);

    const finalAt = new Date('2026-03-11T03:59:59.500Z');
    const query = jest.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('MATERIALIZED')) {
        return [
          {
            localDate: '2026-03-10',
            nextLocalMidnightAt: new Date('2026-03-11T04:00:00.000Z'),
            observedAt: finalAt,
          },
        ];
      }
      if (sql.includes('FROM "core"."mailboxDispatchClock"')) {
        return [
          {
            connectedAccountId: params[1],
            nextEligibleAt: params[1] === accountB ? expiringGate : null,
          },
        ];
      }
      if (sql.includes('FROM "core"."mailboxCapacityDay"')) {
        return [
          {
            acceptedCount: 0,
            connectedAccountId: params[1],
            localDate: params[2],
            reservedCount: 0,
          },
        ];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const result =
      await new MailboxCapacityService().revalidateForReservationMutation(
        { initial, lockInput: input },
        {
          queryRunner: { isTransactionActive: true, query },
        } as unknown as EntityManager,
      );

    expect(result.status).toBe('ELIGIBLE_NOW');
    if (result.status === 'ELIGIBLE_NOW') {
      expect(result.selected.sender.connectedAccountId).toBe(accountB);
      expect(result.observedAt).toEqual(finalAt);
    }
  });

  it.each([
    ['missing', undefined],
    ['wrong', '2026-03-09'],
  ])(
    'rejects a %s decisive day binding for a nonselected candidate',
    async (_label, returnedDate) => {
      const { initial, input } = initialEligible();
      const query = jest.fn(async (sql: string, params: unknown[] = []) => {
        if (sql.includes('MATERIALIZED')) {
          return [
            {
              localDate: '2026-03-10',
              nextLocalMidnightAt: new Date('2026-03-11T04:00:00.000Z'),
              observedAt: new Date('2026-03-10T15:00:00.000Z'),
            },
          ];
        }
        if (sql.includes('FROM "core"."mailboxDispatchClock"')) {
          return [{ connectedAccountId: params[1], nextEligibleAt: null }];
        }
        if (sql.includes('FROM "core"."mailboxCapacityDay"')) {
          return [
            {
              acceptedCount: params[1] === accountB ? 1 : 0,
              connectedAccountId: params[1],
              localDate: params[1] === accountB ? returnedDate : params[2],
              reservedCount: 0,
            },
          ];
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      });

      await expect(
        new MailboxCapacityService().revalidateForReservationMutation(
          { initial, lockInput: input },
          {
            queryRunner: { isTransactionActive: true, query },
          } as unknown as EntityManager,
        ),
      ).resolves.toEqual({
        reason: 'INVALID_CAPACITY_INPUT',
        status: 'BLOCKED',
      });
    },
  );

  it('requires one structured day increment and one structured monotonic clock update', async () => {
    const calls: Array<{ sql: string; structured?: boolean }> = [];
    const slot = new Date('2026-03-10T14:00:00.000Z');
    const query = jest.fn(
      async (sql: string, _params: unknown[] = [], structured?: boolean) => {
        calls.push({ sql, structured });
        if (sql.includes('UPDATE "core"."mailboxCapacityDay"')) {
          return {
            affected: 1,
            records: [
              {
                acceptedCount: 4,
                connectedAccountId: accountA,
                localDate: '2026-03-10',
                reservedCount: 6,
              },
            ],
          };
        }
        if (sql.includes('UPDATE "core"."mailboxDispatchClock"')) {
          return {
            affected: 1,
            records: [
              {
                connectedAccountId: accountA,
                nextEligibleAt: new Date(slot.getTime() + 300_000),
              },
            ],
          };
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      },
    );

    await new MailboxCapacityService().incrementReservedAndAdvanceClock(
      {
        lockedDay: {
          acceptedCount: 4,
          connectedAccountId: accountA,
          localDate: '2026-03-10',
          reservedCount: 5,
          workspaceId,
        },
        minimumSendIntervalMs: 300_000,
        slotAt: slot,
      },
      {
        queryRunner: { isTransactionActive: true, query },
      } as unknown as EntityManager,
    );

    expect(calls).toHaveLength(2);
    expect(calls.every(({ structured }) => structured === true)).toBe(true);
    expect(calls[0].sql).toContain('"reservedCount" + 1');
    expect(calls[1].sql).toContain('GREATEST');
  });
});
