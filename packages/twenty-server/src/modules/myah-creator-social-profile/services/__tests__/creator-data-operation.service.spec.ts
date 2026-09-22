import { CreatorDataOperationService } from 'src/modules/myah-creator-social-profile/services/creator-data-operation.service';

describe('CreatorDataOperationService', () => {
  const input = {
    workspaceId: '11111111-1111-4111-8111-111111111111',
    kind: 'SPREADSHEET_IMPORT' as const,
    actorWorkspaceMemberId: '22222222-2222-4222-8222-222222222222',
    attemptKey: '33333333-3333-4333-8333-333333333333',
    operationKey: 'row-1',
    sourceDigest: 'a'.repeat(64),
  };
  const writtenResult = {
    creatorId: '44444444-4444-4444-8444-444444444444',
    socialProfileIds: ['55555555-5555-4555-8555-555555555555'],
    noteId: '66666666-6666-4666-8666-666666666666',
    noteTargetId: '77777777-7777-4777-8777-777777777777',
  };

  const createService = (query: jest.Mock) => {
    const manager = { query };
    const dataSource = {
      transaction: jest.fn(
        async (
          _isolation: string,
          callback: (value: typeof manager) => unknown,
        ) => callback(manager),
      ),
    };

    return {
      service: new CreatorDataOperationService(dataSource as never),
      dataSource,
    };
  };

  it('writes data and its durable result in one serializable transaction', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'receipt-1' }]);
    const { service, dataSource } = createService(query);
    const write = jest.fn().mockResolvedValue(writtenResult);

    await expect(service.execute({ ...input, write })).resolves.toEqual({
      receiptId: 'receipt-1',
      ...writtenResult,
      replayed: false,
    });

    expect(dataSource.transaction).toHaveBeenCalledWith(
      'SERIALIZABLE',
      expect.any(Function),
    );
    expect(write).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[2][0]).toContain(
      'INSERT INTO core."creatorDataOperationReceipt"',
    );
  });

  it('recovers a committed result without repeating writes', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'receipt-1',
          sourceDigest: input.sourceDigest,
          ...writtenResult,
        },
      ]);
    const { service } = createService(query);
    const write = jest.fn();

    await expect(service.execute({ ...input, write })).resolves.toEqual({
      receiptId: 'receipt-1',
      ...writtenResult,
      replayed: true,
    });

    expect(write).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('retries one serialization failure with a fresh transaction', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'receipt-1' }]);
    const manager = { query };
    const dataSource = {
      transaction: jest
        .fn()
        .mockRejectedValueOnce(
          Object.assign(new Error('serialization failure'), { code: '40001' }),
        )
        .mockImplementationOnce(
          async (
            _isolation: string,
            callback: (value: typeof manager) => unknown,
          ) => callback(manager),
        ),
    };
    const service = new CreatorDataOperationService(dataSource as never);
    const write = jest.fn().mockResolvedValue(writtenResult);

    await expect(service.execute({ ...input, write })).resolves.toEqual({
      receiptId: 'receipt-1',
      ...writtenResult,
      replayed: false,
    });
    expect(dataSource.transaction).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('rejects an operation identity replayed with changed input', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'receipt-1',
          sourceDigest: 'b'.repeat(64),
          ...writtenResult,
        },
      ]);
    const { service } = createService(query);
    const write = jest.fn();

    await expect(service.execute({ ...input, write })).rejects.toThrow(
      'Creator data operation identity was reused with different input',
    );
    expect(write).not.toHaveBeenCalled();
  });
});
