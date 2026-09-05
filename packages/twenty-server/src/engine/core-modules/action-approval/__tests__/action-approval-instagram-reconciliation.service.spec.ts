import { ActionExecutionReceiptState } from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';
import { ActionApprovalService } from 'src/engine/core-modules/action-approval/services/action-approval.service';

const chain = () => {
  const queryBuilder: Record<string, jest.Mock> = {};
  for (const method of ['select', 'where', 'orderBy', 'addOrderBy', 'take']) {
    queryBuilder[method] = jest.fn().mockReturnValue(queryBuilder);
  }
  queryBuilder.getRawMany = jest.fn().mockResolvedValue([]);

  return queryBuilder;
};

describe('ActionApprovalService Instagram stale Processing reconciliation', () => {
  it('delegates only send_instagram_message v2 instead of generically changing it to Unknown', async () => {
    const receipt = {
      id: 'receipt-id',
      workspaceId: 'workspace-id',
      state: ActionExecutionReceiptState.PROCESSING,
      actionApprovalBinding: {
        actionName: 'send_instagram_message',
        actionVersion: 2,
      },
    };
    const receiptRepository = {
      find: jest.fn().mockResolvedValue([receipt]),
      createQueryBuilder: jest.fn().mockReturnValue(chain()),
    };
    const dataSource = {
      getRepository: jest.fn().mockReturnValue(receiptRepository),
      createQueryBuilder: jest.fn(),
    };
    const delegate = { reconcile: jest.fn().mockResolvedValue(undefined) };
    const service = new ActionApprovalService(
      dataSource as never,
      { projectReceipt: jest.fn() } as never,
      delegate as never,
    );

    await expect(
      service.reconcile({ processingBefore: new Date() }),
    ).resolves.toEqual({ unknown: 1, projected: 0, failed: 0 });
    expect(delegate.reconcile).toHaveBeenCalledWith({
      workspaceId: 'workspace-id',
      actionExecutionReceiptId: 'receipt-id',
    });
    expect(dataSource.createQueryBuilder).not.toHaveBeenCalled();
  });
});
