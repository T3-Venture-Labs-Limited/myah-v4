import { createV3RecoveryFixture } from '../../services/__tests__/instagram-message-v3-recovery.fixture';
import { ActionApprovalService } from 'src/engine/core-modules/action-approval/services/action-approval.service';
import {
  ActionExecutionReceiptEntity,
  ActionExecutionReceiptState,
} from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';
import { InstagramMessageReconciliationService } from '../../services/instagram-message-reconciliation.service';

import { InstagramMessageReconciliationJob } from 'src/engine/core-modules/instagram-message/jobs/instagram-message-reconciliation.job';

const buildQueryBuilder = (
  receipts: Array<{ id: string; workspaceId: string; state: string }>,
) => {
  const queryBuilder: Record<string, jest.Mock> = {};
  for (const method of [
    'innerJoin',
    'leftJoin',
    'select',
    'addSelect',
    'where',
    'andWhere',
    'orderBy',
    'addOrderBy',
    'take',
  ]) {
    queryBuilder[method] = jest.fn().mockReturnValue(queryBuilder);
  }
  queryBuilder.getRawMany = jest.fn().mockResolvedValue(receipts);

  return queryBuilder;
};

const buildUpdateQueryBuilder = () => {
  const queryBuilder: Record<string, jest.Mock> = {};
  for (const method of ['update', 'set', 'where', 'andWhere']) {
    queryBuilder[method] = jest.fn().mockReturnValue(queryBuilder);
  }
  queryBuilder.execute = jest.fn().mockResolvedValue({ affected: 1 });

  return queryBuilder;
};

describe('InstagramMessageReconciliationJob', () => {
  it('holds one global lock and reconciles only the selected v2/v3 Unknown receipt batch', async () => {
    const receipts = [
      { id: 'receipt-1', workspaceId: 'workspace-1', state: 'UNKNOWN' },
      { id: 'receipt-2', workspaceId: 'workspace-2', state: 'UNKNOWN' },
    ];
    const queryBuilder = buildQueryBuilder(receipts);
    const updateQueryBuilder = buildUpdateQueryBuilder();
    const queryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      query: jest
        .fn()
        .mockResolvedValueOnce([{ locked: true }])
        .mockResolvedValueOnce(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    };
    const reconciliationService = {
      reconcile: jest.fn().mockResolvedValue({ kind: 'NO_MATCH_COMPLETE' }),
      finalizeProviderAccepted: jest.fn().mockResolvedValue(undefined),
    };
    const job = new InstagramMessageReconciliationJob(
      {
        createQueryRunner: jest.fn().mockReturnValue(queryRunner),
        getRepository: jest.fn().mockReturnValue({
          createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
        }),
        createQueryBuilder: jest.fn().mockReturnValue(updateQueryBuilder),
      } as never,
      reconciliationService as never,
    );

    await job.handle();

    expect(reconciliationService.reconcile.mock.calls).toEqual(
      receipts.map((receipt) => [
        { receiptId: receipt.id, workspaceId: receipt.workspaceId },
      ]),
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'binding.actionName = :actionName',
      { actionName: 'send_instagram_message' },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'binding.actionVersion IN (:...actionVersions)',
      { actionVersions: [2, 3] },
    );
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
    expect(updateQueryBuilder.execute).toHaveBeenCalledTimes(2);
  });

  it('does no reconciliation when another worker holds the lock', async () => {
    const queryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue([{ locked: false }]),
      release: jest.fn().mockResolvedValue(undefined),
    };
    const reconciliationService = { reconcile: jest.fn() };
    const job = new InstagramMessageReconciliationJob(
      {
        createQueryRunner: jest.fn().mockReturnValue(queryRunner),
      } as never,
      reconciliationService as never,
    );

    await job.handle();

    expect(reconciliationService.reconcile).not.toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });
});

describe('Instagram v3 two-stage stale receipt recovery', () => {
  const setup = (
    kind: 'START_CHAT' | 'REPLY',
    mode: 'stale' | 'current' | 'race',
  ) => {
    const h = createV3RecoveryFixture(kind);
    h.receipt.state = ActionExecutionReceiptState.PROCESSING;
    const updatedAt = new Date(
      mode === 'current' ? '2026-09-03T13:00:00Z' : '2026-09-03T12:00:00Z',
    );
    const reservation = {
      providerAttemptedAt: new Date('2026-09-03T12:00:00Z'),
      releasedAt: null,
      targetLockReleasedAt: null,
    };
    const staleQuery = buildUpdateQueryBuilder();
    staleQuery.execute.mockImplementation(async () => {
      const ids =
        staleQuery.where.mock.calls[staleQuery.where.mock.calls.length - 1]?.[1]
          ?.ids ?? [];
      if (mode === 'race')
        h.receipt.state = ActionExecutionReceiptState.PROVIDER_ACCEPTED;
      if (
        ids.includes(h.receipt.id) &&
        h.receipt.state === ActionExecutionReceiptState.PROCESSING
      ) {
        h.receipt.state = ActionExecutionReceiptState.UNKNOWN;
        return { affected: 1 };
      }
      return { affected: 0 };
    });
    const specializedV2 = { reconcile: jest.fn() };
    const staleFind = jest.fn(async ({ where }) =>
      updatedAt < where.updatedAt.value && h.receipt.state === where.state
        ? [h.receipt]
        : [],
    );
    const approval = new ActionApprovalService(
      {
        getRepository: () => ({
          find: staleFind,
          createQueryBuilder: () => buildQueryBuilder([]),
        }),
        createQueryBuilder: () => staleQuery,
        transaction: async (callback: (manager: unknown) => unknown) =>
          callback({
            findOne: async (entity: unknown) =>
              entity === ActionExecutionReceiptEntity
                ? h.receipt
                : { ...h.binding, state: 'CONSUMED' },
            find: async () => [],
            save: async (_entity: unknown, row: unknown) => row,
          }),
      } as never,
      h.projector,
      specializedV2 as never,
    );
    const budget = { releaseStartTargetForReceipt: jest.fn() };
    const reconciliation = new InstagramMessageReconciliationService(
      h.receiptRepository as never,
      { findOne: async () => reservation } as never,
      approval,
      h.reader,
      h.client,
      h.projector,
      h.writer,
      budget as never,
    );
    const scan = buildQueryBuilder([]);
    scan.getRawMany.mockImplementation(async () => {
      const versions =
        scan.andWhere.mock.calls.find(([sql]) =>
          sql.includes('actionVersion'),
        )?.[1]?.actionVersions ?? [];
      const states = scan.where.mock.calls[0][1].activeStates;
      return versions.includes(h.binding.actionVersion) &&
        states.includes(h.receipt.state)
        ? [h.receipt]
        : [];
    });
    const job = new InstagramMessageReconciliationJob(
      {
        createQueryRunner: () => ({
          connect: async () => undefined,
          query: async () => [{ locked: true }],
          release: async () => undefined,
        }),
        getRepository: () => ({ createQueryBuilder: () => scan }),
        createQueryBuilder: () => buildUpdateQueryBuilder(),
      } as never,
      reconciliation,
    );
    return {
      ...h,
      approval,
      specializedV2,
      reservation,
      staleFind,
      staleQuery,
      budget,
      job,
      scan,
    };
  };

  it.each(['START_CHAT', 'REPLY'] as const)(
    'classifies stale %s PROCESSING conservatively, then scans UNKNOWN into immutable read-only projection',
    async (kind) => {
      const h = setup(kind, 'stale');
      const holds = structuredClone(h.reservation);
      await h.approval.reconcile({
        processingBefore: new Date('2026-09-03T12:30:00Z'),
      });
      expect(h.receipt.state).toBe('UNKNOWN');
      expect(h.reservation).toEqual(holds);
      expect(h.specializedV2.reconcile).not.toHaveBeenCalled();
      expect(h.budget.releaseStartTargetForReceipt).not.toHaveBeenCalled();
      expect(h.fetch).not.toHaveBeenCalled();
      expect(h.staleQuery.set).toHaveBeenCalledWith({ state: 'UNKNOWN' });
      expect(h.staleQuery.andWhere).toHaveBeenCalledWith('state = :state', {
        state: 'PROCESSING',
      });
      await h.job.handle();
      expect(h.receipt.state).toBe('SENT');
      expect(h.rows.myahSocialMessage).toHaveLength(1);
      expect(
        h.fetch.mock.calls.every(
          ([url, init]) => init.method === 'GET' && !url.includes('/users'),
        ),
      ).toBe(true);
      expect(h.reservation).toEqual(holds);
      expect(h.budget.releaseStartTargetForReceipt).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'PROJECTED' }),
      );
    },
  );

  it.each(['current', 'race'] as const)(
    'does not downgrade or release %s PROCESSING/advanced receipts',
    async (mode) => {
      const h = setup('START_CHAT', mode);
      const holds = structuredClone(h.reservation);
      await h.approval.reconcile({
        processingBefore: new Date('2026-09-03T12:30:00Z'),
      });
      expect(h.receipt.state).toBe(
        mode === 'current' ? 'PROCESSING' : 'PROVIDER_ACCEPTED',
      );
      expect(h.reservation).toEqual(holds);
      expect(h.budget.releaseStartTargetForReceipt).not.toHaveBeenCalled();
      expect(h.specializedV2.reconcile).not.toHaveBeenCalled();
      expect(h.fetch).not.toHaveBeenCalled();
      if (mode === 'current') {
        await h.job.handle();
        expect(h.fetch).not.toHaveBeenCalled();
        expect(h.staleQuery.execute).not.toHaveBeenCalled();
      }
    },
  );
});
