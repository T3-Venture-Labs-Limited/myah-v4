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
  it('holds one global lock and reconciles only the selected v2 Unknown receipt batch', async () => {
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
      'binding.actionVersion = :actionVersion',
      { actionVersion: 2 },
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
