import { ActionExecutionReceiptState } from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';
import { ActionApprovalService } from 'src/engine/core-modules/action-approval/services/action-approval.service';

describe('ActionApprovalService.reconcile', () => {
  it('processes ordered, fixed stale and accepted receipt batches', async () => {
    const staleSelect = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([{ id: 'stale-receipt-id' }]),
    };
    const acceptedSelect = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([{ id: 'accepted-receipt-id' }]),
    };
    const staleUpdate = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const projector = {
      projectReceipt: jest.fn().mockResolvedValue({ projected: true }),
    };
    const service = new ActionApprovalService(
      {
        createQueryBuilder: jest.fn().mockReturnValue(staleUpdate),
        getRepository: jest.fn().mockReturnValue({
          createQueryBuilder: jest
            .fn()
            .mockReturnValueOnce(staleSelect)
            .mockReturnValueOnce(acceptedSelect),
        }),
      } as never,
      projector as never,
    );

    await expect(
      service.reconcile({ processingBefore: new Date('2026-07-17T00:00:00Z') }),
    ).resolves.toEqual({ unknown: 1, projected: 1 });

    expect(staleSelect.orderBy).toHaveBeenCalledWith(
      'receipt.updatedAt',
      'ASC',
    );
    expect(staleSelect.addOrderBy).toHaveBeenCalledWith('receipt.id', 'ASC');
    expect(acceptedSelect.orderBy).toHaveBeenCalledWith(
      'receipt.updatedAt',
      'ASC',
    );
    expect(acceptedSelect.addOrderBy).toHaveBeenCalledWith('receipt.id', 'ASC');
    expect(staleSelect.take).toHaveBeenCalledWith(expect.any(Number));
    expect(acceptedSelect.take).toHaveBeenCalledWith(expect.any(Number));
    expect(staleUpdate.where).toHaveBeenCalledWith('id IN (:...ids)', {
      ids: ['stale-receipt-id'],
    });
    expect(staleUpdate.andWhere).toHaveBeenCalledWith('state = :state', {
      state: ActionExecutionReceiptState.PROCESSING,
    });
    expect(projector.projectReceipt).toHaveBeenCalledWith(
      'accepted-receipt-id',
    );
  });
});
