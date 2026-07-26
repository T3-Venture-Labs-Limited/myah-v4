import {
  ActionApprovalBindingEntity,
  ActionApprovalBindingState,
} from 'src/engine/core-modules/action-approval/entities/action-approval-binding.entity';
import { ActionApprovalBindingEvidenceLinkEntity } from 'src/engine/core-modules/action-approval/entities/action-approval-binding-evidence-link.entity';
import {
  ActionExecutionReceiptEntity,
  ActionExecutionReceiptState,
} from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';
import { ActionApprovalService } from 'src/engine/core-modules/action-approval/services/action-approval.service';

const workspaceId = '00000000-0000-4000-8000-000000000001';
const approvalBindingId = '00000000-0000-4000-8000-000000000002';
const userWorkspaceId = '00000000-0000-4000-8000-000000000003';
const threadId = '00000000-0000-4000-8000-000000000004';

describe('ActionApprovalService overdue authority', () => {
  let binding: {
    id: string;
    workspaceId: string;
    initiatorUserWorkspaceId: string;
    threadId: string;
    state: ActionApprovalBindingState;
    expiresAt: Date;
  };
  let manager: {
    find: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
  };
  let service: ActionApprovalService;

  beforeEach(() => {
    binding = {
      id: approvalBindingId,
      workspaceId,
      initiatorUserWorkspaceId: userWorkspaceId,
      threadId,
      state: ActionApprovalBindingState.PENDING,
      expiresAt: new Date('2026-07-16T00:00:00.000Z'),
    };
    manager = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(binding),
      save: jest.fn().mockImplementation(async (_entity, value) => value),
    };
    const dataSource = {
      transaction: jest.fn(
        async (callback: (transactionManager: typeof manager) => unknown) =>
          callback(manager),
      ),
      getRepository: jest.fn().mockReturnValue({
        findOne: jest.fn().mockResolvedValue(binding),
      }),
    };

    service = new ActionApprovalService(
      dataSource as never,
      { projectReceipt: jest.fn() } as never,
    );
  });

  it('denies a foreign initiator before resolving a binding graph', async () => {
    const bindingRepository = {
      findOne: jest.fn().mockResolvedValue({
        ...binding,
        initiatorUserWorkspaceId: 'foreign-user-workspace-id',
        evidenceLinks: [],
      }),
    };
    const threadRepository = { findOne: jest.fn() };
    const guardedService = new ActionApprovalService(
      {
        getRepository: jest.fn((entity) =>
          entity === ActionApprovalBindingEntity
            ? bindingRepository
            : threadRepository,
        ),
      } as never,
      { projectReceipt: jest.fn() } as never,
    );

    await expect(
      guardedService.getBindingForViewer({
        bindingId: approvalBindingId,
        workspaceId,
        userWorkspaceId,
      }),
    ).rejects.toThrow('Action approval evidence was not found');
    expect(threadRepository.findOne).not.toHaveBeenCalled();
  });

  it('persists EXPIRED before an overdue approval read is rejected', async () => {
    await expect(
      service.getApprovedBinding({
        workspaceId,
        approvalBindingId,
        initiatorUserWorkspaceId: userWorkspaceId,
        threadId,
      }),
    ).rejects.toThrow('An approved action binding is required');

    expect(binding.state).toBe(ActionApprovalBindingState.EXPIRED);
    expect(manager.save).toHaveBeenCalledWith(
      ActionApprovalBindingEntity,
      expect.objectContaining({ state: ActionApprovalBindingState.EXPIRED }),
    );
  });

  it('reads a consumed binding so an accepted receipt can be projected without provider replay', async () => {
    manager.findOne.mockResolvedValue({
      ...binding,
      state: ActionApprovalBindingState.CONSUMED,
      expiresAt: new Date('2026-07-18T00:00:00.000Z'),
      actionName: 'send_instagram_reply',
      actionVersion: 1,
      draftId: '00000000-0000-4000-8000-000000000005',
      contentDigest: 'a'.repeat(64),
      recipientFingerprint: 'b'.repeat(64),
      sendingAccountFingerprint: 'c'.repeat(64),
      inboundMessageId: 'provider-inbound-message-id',
      inboundSenderIgsid: 'recipient-igsid',
      inboundDirection: 'INBOUND',
      inboundReceivedAt: new Date('2026-07-16T11:30:00.000Z'),
      evidenceLinks: [],
    });

    await expect(
      service.getApprovedBinding({
        workspaceId,
        approvalBindingId,
        initiatorUserWorkspaceId: userWorkspaceId,
        threadId,
      }),
    ).resolves.toMatchObject({
      workspaceId,
      actionName: 'send_instagram_reply',
      draftId: '00000000-0000-4000-8000-000000000005',
    });
  });
  it('locks only the binding root and loads its evidence links in the same transaction', async () => {
    const approvedBinding = {
      ...binding,
      state: ActionApprovalBindingState.APPROVED,
      expiresAt: new Date('2099-07-18T00:00:00.000Z'),
      actionName: 'send_instagram_reply',
      actionVersion: 1,
      draftId: '00000000-0000-4000-8000-000000000005',
      contentDigest: 'a'.repeat(64),
      recipientFingerprint: 'b'.repeat(64),
      sendingAccountFingerprint: 'c'.repeat(64),
      inboundMessageId: 'provider-inbound-message-id',
      inboundSenderIgsid: 'recipient-igsid',
      inboundDirection: 'INBOUND',
      inboundReceivedAt: new Date('2026-07-16T11:30:00.000Z'),
    };
    const evidenceLinks = [{ id: 'evidence-link-id' }];

    manager.findOne.mockResolvedValueOnce(approvedBinding);
    manager.find.mockResolvedValueOnce(evidenceLinks);

    await expect(
      service.getApprovedBinding({
        workspaceId,
        approvalBindingId,
        initiatorUserWorkspaceId: userWorkspaceId,
        threadId,
      }),
    ).resolves.toMatchObject({ evidenceLinks });

    expect(manager.findOne).toHaveBeenNthCalledWith(
      1,
      ActionApprovalBindingEntity,
      {
        where: { id: approvalBindingId, workspaceId },
        lock: { mode: 'pessimistic_write' },
      },
    );
    expect(manager.find).toHaveBeenCalledWith(
      ActionApprovalBindingEvidenceLinkEntity,
      {
        where: { actionApprovalBindingId: approvalBindingId },
        order: {
          objectMetadataId: 'ASC',
          recordId: 'ASC',
          role: 'ASC',
        },
      },
    );
  });
  it('persists EXPIRED before an overdue pending decision is rejected', async () => {
    await expect(
      service.decidePendingBinding({
        workspaceId,
        userWorkspaceId,
        threadId,
        approvalBindingId,
        decision: 'approved',
      }),
    ).rejects.toThrow('An action approval binding is not pending');

    expect(binding.state).toBe(ActionApprovalBindingState.EXPIRED);
    expect(manager.save).toHaveBeenCalledWith(
      ActionApprovalBindingEntity,
      expect.objectContaining({ state: ActionApprovalBindingState.EXPIRED }),
    );
  });
});

describe('ActionApprovalService outreach authority', () => {
  const evidenceLinks = [
    {
      objectMetadataId: '00000000-0000-4000-8000-000000000010',
      recordId: '00000000-0000-4000-8000-000000000011',
      role: 'draft',
    },
  ];
  const expectedBinding = {
    workspaceId,
    actionName: 'send_outreach_email' as const,
    actionVersion: 1 as const,
    draftId: '00000000-0000-4000-8000-000000000005',
    contentDigest: 'a'.repeat(64),
    recipientFingerprint: 'b'.repeat(64),
    sendingAccountFingerprint: 'c'.repeat(64),
    actionContextFingerprint: 'd'.repeat(64),
    threadId,
    initiatorUserWorkspaceId: userWorkspaceId,
    evidenceLinks,
  };

  it('reconstructs an approved outreach binding without Instagram fields', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue({
        id: approvalBindingId,
        ...expectedBinding,
        state: ActionApprovalBindingState.APPROVED,
        expiresAt: new Date('2099-07-18T00:00:00.000Z'),
        inboundMessageId: null,
        inboundSenderIgsid: null,
        inboundDirection: null,
        inboundReceivedAt: null,
      }),
      find: jest.fn().mockResolvedValue(evidenceLinks),
      save: jest.fn(),
    };
    const service = new ActionApprovalService(
      {
        transaction: jest.fn(async (callback) => callback(manager)),
      } as never,
      { projectReceipt: jest.fn() } as never,
    );

    await expect(
      service.getApprovedBinding({
        workspaceId,
        approvalBindingId,
        initiatorUserWorkspaceId: userWorkspaceId,
        threadId,
      }),
    ).resolves.toEqual(expectedBinding);
  });

  it('reserves one outreach receipt and returns it on a duplicate request', async () => {
    const approvedBinding = {
      id: approvalBindingId,
      ...expectedBinding,
      state: ActionApprovalBindingState.APPROVED,
      expiresAt: new Date('2099-07-18T00:00:00.000Z'),
      inboundMessageId: null,
      inboundSenderIgsid: null,
      inboundDirection: null,
      inboundReceivedAt: null,
    };
    let storedReceipt:
      | (Record<string, unknown> & {
          actionApprovalBinding: typeof approvedBinding & {
            evidenceLinks: typeof evidenceLinks;
          };
        })
      | null = null;
    const manager = {
      findOne: jest.fn(async (entity) => {
        if (entity === ActionExecutionReceiptEntity) return storedReceipt;
        if (entity === ActionApprovalBindingEntity) return approvedBinding;
        return null;
      }),
      find: jest.fn().mockResolvedValue(evidenceLinks),
      create: jest.fn((_entity, value) => value),
      save: jest.fn(async (entity, value) => {
        if (entity === ActionExecutionReceiptEntity) {
          storedReceipt = {
            ...value,
            id: '00000000-0000-4000-8000-000000000020',
            updatedAt: new Date('2026-07-26T00:00:00.000Z'),
            actionApprovalBinding: {
              ...approvedBinding,
              evidenceLinks,
            },
          };
          return storedReceipt;
        }
        return value;
      }),
    };
    const service = new ActionApprovalService(
      {
        transaction: jest.fn(async (callback) => callback(manager)),
        getRepository: jest.fn().mockReturnValue({ findOne: jest.fn() }),
      } as never,
      { projectReceipt: jest.fn() } as never,
    );

    const first = await service.reserveExecutionForBinding({
      approvalBindingId,
      expectedActionBinding: expectedBinding,
    });
    const second = await service.reserveExecutionForBinding({
      approvalBindingId,
      expectedActionBinding: expectedBinding,
    });

    expect(first.created).toBe(true);
    expect(second).toEqual({ created: false, receipt: first.receipt });
    expect(
      manager.save.mock.calls.filter(
        ([entity]) => entity === ActionExecutionReceiptEntity,
      ),
    ).toHaveLength(1);
  });
});
