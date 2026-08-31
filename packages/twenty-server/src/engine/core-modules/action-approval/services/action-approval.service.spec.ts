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

  it('records verified provider acceptance while reconciling UNKNOWN', async () => {
    const receipt = {
      id: '00000000-0000-4000-8000-000000000020',
      workspaceId,
      state: ActionExecutionReceiptState.UNKNOWN,
      providerMessageId: null,
      providerExternalMessageId: null,
      providerThreadExternalId: null,
      providerCode: 'unknown',
      redactedOutcome: 'unknown',
      updatedAt: new Date('2026-07-26T00:00:00.000Z'),
    };
    const manager = {
      findOne: jest.fn().mockResolvedValue(receipt),
      save: jest.fn(async (_entity, value) => ({
        ...value,
        updatedAt: new Date('2026-07-26T01:00:00.000Z'),
      })),
    };
    const service = new ActionApprovalService(
      {
        transaction: jest.fn(async (callback) => callback(manager)),
      } as never,
      { projectReceipt: jest.fn() } as never,
    );

    await expect(
      service.recordProviderAccepted(receipt.id, {
        code: 'accepted',
        acceptedAt: new Date('2026-07-26T01:00:00.000Z'),
        providerMessageId: '<verified@example.com>',
        providerExternalMessageId: 'provider-message-id',
        providerThreadExternalId: 'provider-thread-id',
      }),
    ).resolves.toMatchObject({
      id: receipt.id,
      state: ActionExecutionReceiptState.PROVIDER_ACCEPTED,
      providerCode: 'accepted',
      outcome: 'accepted',
    });
    expect(manager.save).toHaveBeenCalledWith(
      ActionExecutionReceiptEntity,
      expect.objectContaining({
        state: ActionExecutionReceiptState.PROVIDER_ACCEPTED,
        providerMessageId: '<verified@example.com>',
        providerExternalMessageId: 'provider-message-id',
        providerThreadExternalId: 'provider-thread-id',
      }),
    );
  });
});

describe('ActionApprovalService direct Inbox reply authority', () => {
  const inboxReplyBinding = {
    workspaceId,
    actionName: 'send_inbox_reply' as const,
    actionVersion: 1 as const,
    draftId: '00000000-0000-4000-8000-000000000005',
    contentDigest: 'a'.repeat(64),
    recipientFingerprint: 'b'.repeat(64),
    sendingAccountFingerprint: 'c'.repeat(64),
    actionContextFingerprint: 'd'.repeat(64),
    threadId,
    initiatorUserWorkspaceId: userWorkspaceId,
    evidenceLinks: [
      {
        objectMetadataId: '00000000-0000-4000-8000-000000000010',
        recordId: '00000000-0000-4000-8000-000000000011',
        role: 'draft',
      },
    ],
  };
  const inboxBinding = {
    id: approvalBindingId,
    ...inboxReplyBinding,
    state: ActionApprovalBindingState.APPROVED,
    expiresAt: new Date('2099-07-18T00:00:00.000Z'),
    decidedAt: new Date('2026-07-26T00:00:00.000Z'),
    inboundMessageId: null,
    inboundSenderIgsid: null,
    inboundDirection: null,
    inboundReceivedAt: null,
  };

  it('creates a direct Inbox binding already approved by the Send click', async () => {
    const manager = {
      create: jest.fn((_entity, value) => value),
      save: jest.fn(async (_entity, value) =>
        value.actionName === 'send_inbox_reply'
          ? { ...value, id: approvalBindingId }
          : value,
      ),
    };
    const service = new ActionApprovalService(
      {
        transaction: jest.fn(async (callback) => callback(manager)),
      } as never,
      { projectReceipt: jest.fn() } as never,
    );

    await expect(
      service.createApprovedInboxReplyBinding(inboxReplyBinding),
    ).resolves.toEqual({ id: approvalBindingId });
    expect(manager.save).toHaveBeenCalledWith(
      ActionApprovalBindingEntity,
      expect.objectContaining({
        actionName: 'send_inbox_reply',
        state: ActionApprovalBindingState.APPROVED,
        threadId,
        draftId: inboxReplyBinding.draftId,
        decidedAt: expect.any(Date),
      }),
    );
    expect(manager.save).toHaveBeenCalledWith(
      ActionApprovalBindingEvidenceLinkEntity,
      expect.arrayContaining([
        expect.objectContaining({
          actionApprovalBindingId: approvalBindingId,
          ...inboxReplyBinding.evidenceLinks[0],
        }),
      ]),
    );
  });

  it('reconstructs an approved Inbox binding without Instagram fields', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue(inboxBinding),
      find: jest.fn().mockResolvedValue(inboxReplyBinding.evidenceLinks),
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
    ).resolves.toEqual(inboxReplyBinding);
  });

  const createLockingService = (bindings: unknown[]) => {
    const repository = { find: jest.fn().mockResolvedValue(bindings) };

    return {
      repository,
      service: new ActionApprovalService(
        {
          getRepository: jest.fn().mockReturnValue(repository),
        } as never,
        { projectReceipt: jest.fn() } as never,
      ),
    };
  };

  const consumedBindingWithReceipt = (state: ActionExecutionReceiptState) => ({
    ...inboxBinding,
    state: ActionApprovalBindingState.CONSUMED,
    receipts: [{ state }],
  });

  it.each([
    ActionExecutionReceiptState.PROCESSING,
    ActionExecutionReceiptState.PROVIDER_ACCEPTED,
    ActionExecutionReceiptState.UNKNOWN,
  ])('locks the approved draft for %s', async (state) => {
    const { service } = createLockingService([
      consumedBindingWithReceipt(state),
    ]);

    await expect(
      service.isDraftExecutionLocked({
        workspaceId,
        actionName: 'send_inbox_reply',
        draftId: inboxReplyBinding.draftId,
      }),
    ).resolves.toBe(true);
  });

  it.each([
    ActionExecutionReceiptState.FAILED,
    ActionExecutionReceiptState.SENT,
  ])('does not lock the draft for terminal %s', async (state) => {
    const { service } = createLockingService([
      consumedBindingWithReceipt(state),
    ]);

    await expect(
      service.isDraftExecutionLocked({
        workspaceId,
        actionName: 'send_inbox_reply',
        draftId: inboxReplyBinding.draftId,
      }),
    ).resolves.toBe(false);
  });

  it('locks an unexpired approved Inbox binding before receipt reservation', async () => {
    const { service } = createLockingService([{ ...inboxBinding, receipts: [] }]);

    await expect(
      service.isDraftExecutionLocked({
        workspaceId,
        actionName: 'send_inbox_reply',
        draftId: inboxReplyBinding.draftId,
      }),
    ).resolves.toBe(true);
  });

  it.each([
    ['approved without receipt', { ...inboxBinding, receipts: [] }, 'PENDING'],
    [
      'processing receipt',
      consumedBindingWithReceipt(ActionExecutionReceiptState.PROCESSING),
      'PENDING',
    ],
    [
      'provider-accepted receipt',
      consumedBindingWithReceipt(ActionExecutionReceiptState.PROVIDER_ACCEPTED),
      'PENDING',
    ],
    [
      'unknown receipt',
      consumedBindingWithReceipt(ActionExecutionReceiptState.UNKNOWN),
      'UNKNOWN',
    ],
  ])('reports %s as the current scoped execution state', async (_case, binding, state) => {
    const { service } = createLockingService([binding]);

    await expect(
      service.getInboxReplyDraftExecutionState({
        workspaceId,
        initiatorUserWorkspaceId: userWorkspaceId,
        draftId: inboxReplyBinding.draftId,
      }),
    ).resolves.toBe(state);
  });

  it.each([
    ActionApprovalBindingState.PENDING,
    ActionApprovalBindingState.REJECTED,
    ActionApprovalBindingState.EXPIRED,
  ])('does not lock a %s Inbox binding', async (state) => {
    const { service } = createLockingService([
      { ...inboxBinding, state, receipts: [] },
    ]);

    await expect(
      service.isDraftExecutionLocked({
        workspaceId,
        actionName: 'send_inbox_reply',
        draftId: inboxReplyBinding.draftId,
      }),
    ).resolves.toBe(false);
  });

  it('scopes an execution receipt to its Inbox action, draft, and initiator', async () => {
    const receipt = {
      id: '00000000-0000-4000-8000-000000000020',
      workspaceId,
      state: ActionExecutionReceiptState.PROCESSING,
      providerCode: null,
      redactedOutcome: null,
      updatedAt: new Date('2026-07-26T00:00:00.000Z'),
    };
    const receiptRepository = {
      findOne: jest.fn().mockResolvedValue(receipt),
    };
    const service = new ActionApprovalService(
      {
        getRepository: jest.fn().mockReturnValue(receiptRepository),
      } as never,
      { projectReceipt: jest.fn() } as never,
    );
    const input = {
      workspaceId,
      receiptId: receipt.id,
      actionName: 'send_inbox_reply' as const,
      draftId: inboxReplyBinding.draftId,
      initiatorUserWorkspaceId: userWorkspaceId,
    };

    await expect(service.findExecutionReceipt(input)).resolves.toMatchObject({
      id: receipt.id,
      workspaceId,
    });
    expect(receiptRepository.findOne).toHaveBeenCalledWith({
      where: {
        id: receipt.id,
        workspaceId,
        actionApprovalBinding: {
          actionName: 'send_inbox_reply',
          draftId: inboxReplyBinding.draftId,
          initiatorUserWorkspaceId: userWorkspaceId,
        },
      },
    });

    for (const foreignInput of [
      { ...input, workspaceId: '00000000-0000-4000-8000-000000000099' },
      {
        ...input,
        initiatorUserWorkspaceId: '00000000-0000-4000-8000-000000000099',
      },
      { ...input, actionName: 'send_outreach_email' as const },
      { ...input, draftId: '00000000-0000-4000-8000-000000000099' },
    ]) {
      receiptRepository.findOne.mockResolvedValueOnce(null);
      await expect(service.findExecutionReceipt(foreignInput)).resolves.toBeNull();
    }
  });

  it('requires the exact MessageThread draft evidence before exposing an Inbox receipt', async () => {
    const messageThreadMetadataId =
      '00000000-0000-4000-8000-000000000023';
    const receipt = {
      id: '00000000-0000-4000-8000-000000000024',
      workspaceId,
      state: ActionExecutionReceiptState.SENT,
      providerCode: 'accepted',
      redactedOutcome: 'accepted',
      updatedAt: new Date('2026-08-31T00:00:00.000Z'),
      actionApprovalBinding: {
        evidenceLinks: [
          {
            objectMetadataId: messageThreadMetadataId,
            recordId: inboxReplyBinding.draftId,
            role: 'draft',
          },
        ],
      },
    };
    const receiptRepository = {
      findOne: jest.fn().mockResolvedValue(receipt),
    };
    const service = new ActionApprovalService(
      {
        getRepository: jest.fn().mockReturnValue(receiptRepository),
      } as never,
      { projectReceipt: jest.fn() } as never,
    );
    const input = {
      workspaceId,
      receiptId: receipt.id,
      draftId: inboxReplyBinding.draftId,
      initiatorUserWorkspaceId: userWorkspaceId,
      messageThreadMetadataId,
    };

    await expect(
      service.findInboxReplyExecutionReceipt(input),
    ).resolves.toMatchObject({ id: receipt.id });

    receipt.actionApprovalBinding.evidenceLinks[0].role = 'message';
    await expect(service.findInboxReplyExecutionReceipt(input)).resolves.toBeNull();
  });

  it('invalidates only an unconsumed approved Inbox binding for its actor and thread', async () => {
    let receipt: object | null = null;
    const binding = { ...inboxBinding };
    const manager = {
      findOne: jest.fn(async (entity) =>
        entity === ActionApprovalBindingEntity ? binding : receipt,
      ),
      save: jest.fn(async (_entity, value) => value),
    };
    const service = new ActionApprovalService(
      {
        transaction: jest.fn(async (callback) => callback(manager)),
      } as never,
      { projectReceipt: jest.fn() } as never,
    );
    const input = {
      workspaceId,
      approvalBindingId,
      initiatorUserWorkspaceId: userWorkspaceId,
      threadId,
      draftId: inboxReplyBinding.draftId,
    };

    await expect(
      service.invalidateApprovedInboxReplyBinding(input),
    ).resolves.toBeUndefined();
    expect(binding).toMatchObject({
      state: ActionApprovalBindingState.CHANGES_REQUESTED,
      decidedAt: expect.any(Date),
    });

    for (const rejectedBinding of [
      { ...inboxBinding, state: ActionApprovalBindingState.CONSUMED },
      {
        ...inboxBinding,
        initiatorUserWorkspaceId: '00000000-0000-4000-8000-000000000099',
      },
      { ...inboxBinding, threadId: '00000000-0000-4000-8000-000000000099' },
      { ...inboxBinding, actionName: 'send_outreach_email' },
      { ...inboxBinding, draftId: '00000000-0000-4000-8000-000000000099' },
    ]) {
      manager.findOne.mockImplementation(async (entity) =>
        entity === ActionApprovalBindingEntity ? rejectedBinding : null,
      );
      await expect(
        service.invalidateApprovedInboxReplyBinding(input),
      ).rejects.toThrow('An approved Inbox reply binding cannot be invalidated');
      expect(rejectedBinding.state).not.toBe(
        ActionApprovalBindingState.CHANGES_REQUESTED,
      );
    }

    manager.findOne.mockImplementation(async (entity) =>
      entity === ActionApprovalBindingEntity ? { ...inboxBinding } : receipt,
    );
    receipt = { id: '00000000-0000-4000-8000-000000000020' };
    await expect(
      service.invalidateApprovedInboxReplyBinding(input),
    ).rejects.toThrow('An approved Inbox reply binding cannot be invalidated');
  });

  it('converges a new exact binding on a prior matching logical receipt without leaving it locked', async () => {
    const priorBindingId = '00000000-0000-4000-8000-000000000021';
    const newBinding = { ...inboxBinding };
    const priorReceipt = {
      id: '00000000-0000-4000-8000-000000000022',
      workspaceId,
      actionApprovalBindingId: priorBindingId,
      state: ActionExecutionReceiptState.SENT,
      providerCode: 'accepted',
      redactedOutcome: 'accepted',
      updatedAt: new Date('2026-08-31T00:00:00.000Z'),
      actionApprovalBinding: {
        ...inboxBinding,
        id: priorBindingId,
        evidenceLinks: inboxReplyBinding.evidenceLinks,
      },
    };
    const manager = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(priorReceipt)
        .mockResolvedValueOnce(newBinding)
        .mockResolvedValueOnce(null),
      find: jest.fn().mockResolvedValue(inboxReplyBinding.evidenceLinks),
      save: jest.fn(async (_entity, value) => value),
    };
    const service = new ActionApprovalService(
      {
        transaction: jest.fn(async (callback) => callback(manager)),
      } as never,
      { projectReceipt: jest.fn() } as never,
    );

    await expect(
      service.reserveExecutionForBinding({
        approvalBindingId,
        expectedActionBinding: inboxReplyBinding,
      }),
    ).resolves.toMatchObject({
      created: false,
      receipt: { id: priorReceipt.id },
    });
    expect(newBinding.state).toBe(ActionApprovalBindingState.CHANGES_REQUESTED);
    expect(manager.save).toHaveBeenCalledWith(
      ActionApprovalBindingEntity,
      expect.objectContaining({
        id: approvalBindingId,
        state: ActionApprovalBindingState.CHANGES_REQUESTED,
      }),
    );
  });
});
