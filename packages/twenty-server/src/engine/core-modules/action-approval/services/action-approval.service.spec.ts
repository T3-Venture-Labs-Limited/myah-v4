import { FindOperator, In, IsNull } from 'typeorm';

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
import { computeLogicalActionKey } from 'src/engine/core-modules/action-approval/utils/action-binding-digest.util';

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

  it('rejects an approved Inbox reply from a different agent chat', async () => {
    binding = {
      ...binding,
      state: ActionApprovalBindingState.APPROVED,
      expiresAt: new Date('2099-07-18T00:00:00.000Z'),
    };
    manager.findOne.mockResolvedValue(binding);

    await expect(
      service.getApprovedBinding({
        workspaceId,
        approvalBindingId,
        initiatorUserWorkspaceId: userWorkspaceId,
        threadId: '00000000-0000-4000-8000-000000000099',
      }),
    ).rejects.toThrow('An approved action binding is required');
    expect(manager.find).not.toHaveBeenCalled();
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
    const { service } = createLockingService([
      { ...inboxBinding, receipts: [] },
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
  ])(
    'reports %s as the current scoped execution state',
    async (_case, binding, state) => {
      const { service, repository } = createLockingService([binding]);

      await expect(
        service.getInboxReplyDraftExecutionState({
          workspaceId,
          draftId: inboxReplyBinding.draftId,
        }),
      ).resolves.toBe(state);
      expect(repository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({
            initiatorUserWorkspaceId: userWorkspaceId,
          }),
        }),
      );
    },
  );

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
      await expect(
        service.findExecutionReceipt(foreignInput),
      ).resolves.toBeNull();
    }
  });

  it('requires the exact MessageThread draft evidence before exposing an Inbox receipt', async () => {
    const messageThreadMetadataId = '00000000-0000-4000-8000-000000000023';
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
    await expect(
      service.findInboxReplyExecutionReceipt(input),
    ).resolves.toBeNull();
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
      ).rejects.toThrow(
        'An approved Inbox reply binding cannot be invalidated',
      );
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

describe('ActionApprovalService Instagram message v2 authority', () => {
  const directBinding = {
    workspaceId,
    actionName: 'send_instagram_message' as const,
    actionVersion: 2 as const,
    actionKind: 'START_CHAT' as const,
    draftId: '00000000-0000-4000-8000-000000000050',
    contentDigest: 'a'.repeat(64),
    recipientFingerprint: 'b'.repeat(64),
    sendingAccountFingerprint: 'c'.repeat(64),
    actionContextFingerprint: 'd'.repeat(64),
    threadId: null,
    interactionContextType: 'MYAH_INBOX_INSTAGRAM_DRAFT' as const,
    interactionContextId: '00000000-0000-4000-8000-000000000050',
    initiatorUserWorkspaceId: userWorkspaceId,
    evidenceLinks: [
      {
        objectMetadataId: '00000000-0000-4000-8000-000000000051',
        recordId: '00000000-0000-4000-8000-000000000050',
        role: 'INSTAGRAM_MESSAGE_DRAFT',
      },
    ],
  };

  it.each(['START_CHAT', 'REPLY'] as const)(
    'rejects every new v2 %s binding at both producers without a write',
    async (actionKind) => {
      const transaction = jest.fn();
      const service = new ActionApprovalService(
        { transaction } as never,
        {} as never,
      );
      const binding = { ...directBinding, actionKind };
      await expect(
        service.createApprovedInstagramMessageBinding(binding),
      ).rejects.toThrow('v3 binding is required');
      await expect(service.createPendingBinding(binding)).rejects.toThrow(
        'v3 binding is required',
      );
      expect(transaction).not.toHaveBeenCalled();
    },
  );

  it('reconstructs only the exact direct interaction context', async () => {
    const storedBinding = {
      id: approvalBindingId,
      ...directBinding,
      state: ActionApprovalBindingState.APPROVED,
      expiresAt: new Date('2099-07-18T00:00:00.000Z'),
      inboundMessageId: null,
      inboundSenderIgsid: null,
      inboundDirection: null,
      inboundReceivedAt: null,
    };
    const manager = {
      findOne: jest.fn().mockResolvedValue(storedBinding),
      find: jest.fn().mockResolvedValue(directBinding.evidenceLinks),
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
        threadId: null,
        interactionContextType: 'MYAH_INBOX_INSTAGRAM_DRAFT',
        interactionContextId: directBinding.draftId,
      }),
    ).resolves.toEqual({
      ...directBinding,
      evidenceLinks: directBinding.evidenceLinks,
    });
    await expect(
      service.getApprovedBinding({
        workspaceId,
        approvalBindingId,
        initiatorUserWorkspaceId: userWorkspaceId,
        threadId: null,
        interactionContextType: 'MYAH_INBOX_INSTAGRAM_DRAFT',
        interactionContextId: '00000000-0000-4000-8000-000000000099',
      }),
    ).rejects.toThrow('An approved action binding is required');
  });
});

describe('ActionApprovalService Instagram message v3 authority', () => {
  const v3Binding = {
    workspaceId,
    actionName: 'send_instagram_message' as const,
    actionVersion: 3 as const,
    actionKind: 'REPLY' as const,
    draftId: '00000000-0000-4000-8000-000000000060',
    contentDigest: 'a'.repeat(64),
    recipientFingerprint: 'b'.repeat(64),
    sendingAccountFingerprint: 'c'.repeat(64),
    actionContextFingerprint: 'd'.repeat(64),
    threadId: null,
    interactionContextType: 'MYAH_INSTAGRAM_MESSAGE_DRAFT' as const,
    interactionContextId: '00000000-0000-4000-8000-000000000060',
    composerInputDigest: 'e'.repeat(64),
    instagramMessageSnapshot: {
      publicIdentifier: 'creator.name',
      providerId: 'profile-001',
      providerMessagingId: 'messaging-009',
      creatorRecordId: '00000000-0000-4000-8000-000000000004',
      accountBindingId: '00000000-0000-4000-8000-000000000005',
      instagramAccountRecordId: '00000000-0000-4000-8000-000000000006',
      unipileAccountId: 'unipile-account',
      instagramUserId: 'brand-instagram-id',
      recipientSourceValues: [
        { field: 'instagramUsername', value: '@Creator.Name' },
      ],
      actionKind: 'REPLY' as const,
      conversationRecordId: '00000000-0000-4000-8000-000000000009',
      providerChatId: 'chat-009',
      attendeeProviderId: 'messaging-009',
    },
    initiatorUserWorkspaceId: userWorkspaceId,
    evidenceLinks: [],
  };

  it('reads a complete v3 binding back with its immutable snapshot and composer input digest', async () => {
    const storedBinding = {
      id: approvalBindingId,
      ...v3Binding,
      state: ActionApprovalBindingState.APPROVED,
      expiresAt: new Date('2099-07-18T00:00:00.000Z'),
      inboundMessageId: null,
      inboundSenderIgsid: null,
      inboundDirection: null,
      inboundReceivedAt: null,
    };
    const manager = {
      findOne: jest.fn().mockResolvedValue(storedBinding),
      find: jest.fn().mockResolvedValue(v3Binding.evidenceLinks),
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
        threadId: null,
        interactionContextType: 'MYAH_INSTAGRAM_MESSAGE_DRAFT',
        interactionContextId: v3Binding.draftId,
      }),
    ).resolves.toEqual(v3Binding);
  });

  it('reads a v3 direct REPLY with no composer digest under the new context', async () => {
    const inboxReplyBinding = {
      ...v3Binding,
      composerInputDigest: null,
    };
    const manager = {
      findOne: jest.fn().mockResolvedValue({
        id: approvalBindingId,
        ...inboxReplyBinding,
        state: ActionApprovalBindingState.APPROVED,
        expiresAt: new Date('2099-07-18T00:00:00.000Z'),
        inboundMessageId: null,
        inboundSenderIgsid: null,
        inboundDirection: null,
        inboundReceivedAt: null,
      }),
      find: jest.fn().mockResolvedValue([]),
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
        threadId: null,
        interactionContextType: 'MYAH_INSTAGRAM_MESSAGE_DRAFT',
        interactionContextId: inboxReplyBinding.draftId,
      }),
    ).resolves.toEqual(inboxReplyBinding);
  });

  it('rejects the historical v2 context for v3 direct bindings', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue({
        id: approvalBindingId,
        ...v3Binding,
        interactionContextType: 'MYAH_INBOX_INSTAGRAM_DRAFT',
        composerInputDigest: null,
        state: ActionApprovalBindingState.APPROVED,
        expiresAt: new Date('2099-07-18T00:00:00.000Z'),
        inboundMessageId: null,
        inboundSenderIgsid: null,
        inboundDirection: null,
        inboundReceivedAt: null,
      }),
      find: jest.fn().mockResolvedValue([]),
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
        threadId: null,
        interactionContextType: 'MYAH_INBOX_INSTAGRAM_DRAFT',
        interactionContextId: v3Binding.draftId,
      }),
    ).rejects.toThrow('An approved action binding is required');
  });

  const approvedV3Binding = () => ({
    id: approvalBindingId,
    ...v3Binding,
    state: ActionApprovalBindingState.APPROVED,
    expiresAt: new Date('2099-07-18T00:00:00.000Z'),
    inboundMessageId: null,
    inboundSenderIgsid: null,
    inboundDirection: null,
    inboundReceivedAt: null,
    evidenceLinks: [],
  });

  const createReservationService = (
    binding: ReturnType<typeof approvedV3Binding>,
    priorReceipt: {
      workspaceId: string;
      idempotencyKey: string;
      [key: string]: unknown;
    } | null,
  ) => {
    const manager = {
      findOne: jest.fn(
        async (
          entity: unknown,
          options: {
            where: {
              workspaceId: string;
              idempotencyKey?: string;
              id?: string;
            };
          },
        ) => {
          if (entity === ActionExecutionReceiptEntity) {
            return priorReceipt &&
              priorReceipt.workspaceId === options.where.workspaceId &&
              priorReceipt.idempotencyKey === options.where.idempotencyKey
              ? priorReceipt
              : null;
          }

          return binding.workspaceId === options.where.workspaceId &&
            binding.id === options.where.id
            ? binding
            : null;
        },
      ),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((_entity, value) => value),
      save: jest.fn(async (_entity, value) => ({
        ...value,
        id: value.id ?? '00000000-0000-4000-8000-000000000061',
        updatedAt: new Date('2026-07-18T00:00:00.000Z'),
      })),
    };
    const service = new ActionApprovalService(
      {
        transaction: jest.fn(async (callback) => callback(manager)),
      } as never,
      { projectReceipt: jest.fn() } as never,
    );

    return { binding, manager, service };
  };

  it('reserves and replays an unchanged v3 authority through the public service path', async () => {
    const first = createReservationService(approvedV3Binding(), null);

    await expect(
      first.service.reserveExecutionForBinding({
        approvalBindingId,
        expectedActionBinding: v3Binding,
      }),
    ).resolves.toMatchObject({ created: true });
    expect(first.manager.findOne).toHaveBeenCalledWith(
      ActionExecutionReceiptEntity,
      {
        where: {
          workspaceId,
          idempotencyKey: computeLogicalActionKey(v3Binding),
        },
        relations: { actionApprovalBinding: { evidenceLinks: true } },
      },
    );
    expect(first.manager.findOne).toHaveBeenCalledWith(
      ActionApprovalBindingEntity,
      {
        where: { id: approvalBindingId, workspaceId },
        lock: { mode: 'pessimistic_write' },
      },
    );
    expect(first.binding.state).toBe(ActionApprovalBindingState.CONSUMED);
    expect(first.manager.save).toHaveBeenCalledTimes(2);

    const replayBinding = {
      ...approvedV3Binding(),
      state: ActionApprovalBindingState.CONSUMED,
    };
    const replay = createReservationService(replayBinding, {
      id: '00000000-0000-4000-8000-000000000061',
      workspaceId,
      idempotencyKey: computeLogicalActionKey(v3Binding),
      state: ActionExecutionReceiptState.PROCESSING,
      providerCode: null,
      redactedOutcome: null,
      updatedAt: new Date('2026-07-18T00:00:00.000Z'),
      actionApprovalBindingId: approvalBindingId,
      actionApprovalBinding: replayBinding,
    });

    await expect(
      replay.service.reserveExecutionForBinding({
        approvalBindingId,
        expectedActionBinding: v3Binding,
      }),
    ).resolves.toMatchObject({ created: false });
    expect(replay.manager.findOne).toHaveBeenCalledWith(
      ActionExecutionReceiptEntity,
      {
        where: {
          workspaceId,
          idempotencyKey: computeLogicalActionKey(v3Binding),
        },
        relations: { actionApprovalBinding: { evidenceLinks: true } },
      },
    );
    expect(replay.manager.create).not.toHaveBeenCalled();
    expect(replay.manager.save).not.toHaveBeenCalled();
    expect(replayBinding.state).toBe(ActionApprovalBindingState.CONSUMED);
  });

  const mutateSnapshot = (
    mutation: (snapshot: typeof v3Binding.instagramMessageSnapshot) => unknown,
  ) =>
    ({
      ...v3Binding,
      instagramMessageSnapshot: mutation(v3Binding.instagramMessageSnapshot),
    }) as never;

  const mismatchCases = [
    {
      name: 'snapshot.publicIdentifier',
      binding: () =>
        mutateSnapshot((snapshot) => ({
          ...snapshot,
          publicIdentifier: 'another.creator',
        })),
    },
    {
      name: 'snapshot.providerId',
      binding: () =>
        mutateSnapshot((snapshot) => ({
          ...snapshot,
          providerId: 'profile-010',
        })),
    },
    {
      name: 'snapshot.providerMessagingId',
      binding: () =>
        mutateSnapshot((snapshot) => ({
          ...snapshot,
          providerMessagingId: 'messaging-010',
        })),
    },
    {
      name: 'snapshot.creatorRecordId',
      binding: () =>
        mutateSnapshot((snapshot) => ({
          ...snapshot,
          creatorRecordId: '00000000-0000-4000-8000-000000000010',
        })),
    },
    {
      name: 'snapshot.accountBindingId',
      binding: () =>
        mutateSnapshot((snapshot) => ({
          ...snapshot,
          accountBindingId: '00000000-0000-4000-8000-000000000011',
        })),
    },
    {
      name: 'snapshot.instagramAccountRecordId',
      binding: () =>
        mutateSnapshot((snapshot) => ({
          ...snapshot,
          instagramAccountRecordId: '00000000-0000-4000-8000-000000000012',
        })),
    },
    {
      name: 'snapshot.unipileAccountId',
      binding: () =>
        mutateSnapshot((snapshot) => ({
          ...snapshot,
          unipileAccountId: 'unipile-account-010',
        })),
    },
    {
      name: 'snapshot.instagramUserId',
      binding: () =>
        mutateSnapshot((snapshot) => ({
          ...snapshot,
          instagramUserId: 'brand-instagram-id-010',
        })),
    },
    {
      name: 'snapshot.recipientSourceValues[0].field',
      binding: () =>
        mutateSnapshot((snapshot) => ({
          ...snapshot,
          recipientSourceValues: [
            { ...snapshot.recipientSourceValues[0], field: 'instagramHandle' },
          ],
        })),
    },
    {
      name: 'snapshot.recipientSourceValues[0].value',
      binding: () =>
        mutateSnapshot((snapshot) => ({
          ...snapshot,
          recipientSourceValues: [
            { ...snapshot.recipientSourceValues[0], value: '@another.creator' },
          ],
        })),
    },
    {
      name: 'snapshot.actionKind',
      binding: () =>
        mutateSnapshot((snapshot) => ({
          ...snapshot,
          actionKind: 'START_CHAT',
        })),
    },
    {
      name: 'snapshot.conversationRecordId',
      binding: () =>
        mutateSnapshot((snapshot) => ({
          ...snapshot,
          conversationRecordId: '00000000-0000-4000-8000-000000000013',
        })),
    },
    {
      name: 'snapshot.providerChatId',
      binding: () =>
        mutateSnapshot((snapshot) => ({
          ...snapshot,
          providerChatId: 'chat-010',
        })),
    },
    {
      name: 'snapshot.attendeeProviderId',
      binding: () =>
        mutateSnapshot((snapshot) => ({
          ...snapshot,
          attendeeProviderId: 'messaging-010',
        })),
    },
    {
      name: 'composerInputDigest',
      binding: () =>
        ({ ...v3Binding, composerInputDigest: 'f'.repeat(64) }) as never,
    },
  ];

  it.each(mismatchCases)(
    'rejects a changed $name before first reservation and corrupted receipt replay without mutation',
    async ({ binding: changedBinding }) => {
      const first = createReservationService(approvedV3Binding(), null);
      const changed = changedBinding();
      const changedKey = computeLogicalActionKey(changed);

      expect(changedKey).not.toBe(computeLogicalActionKey(v3Binding));
      await expect(
        first.service.reserveExecutionForBinding({
          approvalBindingId,
          expectedActionBinding: changed,
        }),
      ).rejects.toThrow('Action binding does not match execution request');
      expect(first.manager.findOne).toHaveBeenCalledWith(
        ActionExecutionReceiptEntity,
        {
          where: { workspaceId, idempotencyKey: changedKey },
          relations: { actionApprovalBinding: { evidenceLinks: true } },
        },
      );
      expect(first.manager.findOne).toHaveBeenCalledWith(
        ActionApprovalBindingEntity,
        {
          where: { id: approvalBindingId, workspaceId },
          lock: { mode: 'pessimistic_write' },
        },
      );
      expect(first.binding.state).toBe(ActionApprovalBindingState.APPROVED);
      expect(first.manager.create).not.toHaveBeenCalled();
      expect(first.manager.save).not.toHaveBeenCalled();

      const replayBinding = {
        ...approvedV3Binding(),
        state: ActionApprovalBindingState.CONSUMED,
      };
      // This defensive legacy-bug-shaped row has a changed request key but
      // the immutable original binding, which missing equality could replay.
      // It rejects corrupted persisted authority, not an ordinary changed retry.
      const replay = createReservationService(replayBinding, {
        id: '00000000-0000-4000-8000-000000000061',
        workspaceId,
        idempotencyKey: changedKey,
        state: ActionExecutionReceiptState.PROCESSING,
        providerCode: null,
        redactedOutcome: null,
        updatedAt: new Date('2026-07-18T00:00:00.000Z'),
        actionApprovalBindingId: approvalBindingId,
        actionApprovalBinding: replayBinding,
      });

      await expect(
        replay.service.reserveExecutionForBinding({
          approvalBindingId,
          expectedActionBinding: changed,
        }),
      ).rejects.toThrow('Action binding does not match execution request');
      expect(replay.manager.findOne).toHaveBeenCalledWith(
        ActionExecutionReceiptEntity,
        {
          where: { workspaceId, idempotencyKey: changedKey },
          relations: { actionApprovalBinding: { evidenceLinks: true } },
        },
      );
      expect(replayBinding.state).toBe(ActionApprovalBindingState.CONSUMED);
      expect(replay.manager.create).not.toHaveBeenCalled();
      expect(replay.manager.save).not.toHaveBeenCalled();
    },
  );

  it('does not replay an original-key receipt for an ordinary changed-key retry', async () => {
    const changed = mismatchCases[0].binding();
    const changedKey = computeLogicalActionKey(changed);
    const originalKey = computeLogicalActionKey(v3Binding);
    const replayBinding = {
      ...approvedV3Binding(),
      state: ActionApprovalBindingState.CONSUMED,
    };
    const replay = createReservationService(replayBinding, {
      id: '00000000-0000-4000-8000-000000000061',
      workspaceId,
      idempotencyKey: originalKey,
      state: ActionExecutionReceiptState.PROCESSING,
      providerCode: null,
      redactedOutcome: null,
      updatedAt: new Date('2026-07-18T00:00:00.000Z'),
      actionApprovalBindingId: approvalBindingId,
      actionApprovalBinding: replayBinding,
    });

    await expect(
      replay.service.reserveExecutionForBinding({
        approvalBindingId,
        expectedActionBinding: changed,
      }),
    ).rejects.toThrow('An approved action binding is required');
    expect(replay.manager.findOne).toHaveBeenCalledWith(
      ActionExecutionReceiptEntity,
      {
        where: { workspaceId, idempotencyKey: changedKey },
        relations: { actionApprovalBinding: { evidenceLinks: true } },
      },
    );
    expect(replay.manager.findOne).toHaveBeenCalledWith(
      ActionApprovalBindingEntity,
      {
        where: { id: approvalBindingId, workspaceId },
        lock: { mode: 'pessimistic_write' },
      },
    );
    expect(replayBinding.state).toBe(ActionApprovalBindingState.CONSUMED);
    expect(replay.manager.create).not.toHaveBeenCalled();
    expect(replay.manager.save).not.toHaveBeenCalled();
  });
});

describe('ActionApprovalService composer recovery lookup', () => {
  it('uses exact workspace, actor, v3 direct-context, and receipt predicates', async () => {
    const snapshot = {
      publicIdentifier: 'creator.name',
      providerId: 'profile-001',
      providerMessagingId: 'messaging-009',
      creatorRecordId: '00000000-0000-4000-8000-000000000004',
      accountBindingId: '00000000-0000-4000-8000-000000000005',
      instagramAccountRecordId: '00000000-0000-4000-8000-000000000006',
      unipileAccountId: 'unipile-account',
      instagramUserId: 'brand-instagram-id',
      recipientSourceValues: [
        { field: 'instagramUsername', value: 'creator.name' },
      ],
      actionKind: 'START_CHAT' as const,
      conversationRecordId: null,
      providerChatId: null,
      attendeeProviderId: null,
    };
    const bindingRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: approvalBindingId,
        actionKind: 'START_CHAT',
        composerInputDigest: 'a'.repeat(64),
        instagramMessageSnapshot: snapshot,
      }),
    };
    const receiptRepository = { findOne: jest.fn().mockResolvedValue(null) };
    const service = new ActionApprovalService(
      {
        getRepository: jest.fn((entity) =>
          entity === ActionApprovalBindingEntity
            ? bindingRepository
            : receiptRepository,
        ),
      } as never,
      { projectReceipt: jest.fn() } as never,
    );

    await expect(
      service.findComposerAttempt({
        workspaceId,
        draftId: '00000000-0000-4000-8000-000000000050',
        initiatorUserWorkspaceId: userWorkspaceId,
      }),
    ).resolves.toMatchObject({ id: approvalBindingId, receipt: null });
    expect(bindingRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId,
          initiatorUserWorkspaceId: userWorkspaceId,
          actionName: 'send_instagram_message',
          actionVersion: 3,
          interactionContextType: 'MYAH_INSTAGRAM_MESSAGE_DRAFT',
          interactionContextId: '00000000-0000-4000-8000-000000000050',
        }),
      }),
    );
    expect(receiptRepository.findOne).toHaveBeenCalledWith({
      where: { workspaceId, actionApprovalBindingId: approvalBindingId },
    });
  });

  it('does not bless malformed durable composer rows', async () => {
    const bindingRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: approvalBindingId,
        actionKind: 'START_CHAT',
        composerInputDigest: 'not-a-digest',
        instagramMessageSnapshot: null,
      }),
    };
    const receiptRepository = { findOne: jest.fn() };
    const service = new ActionApprovalService(
      {
        getRepository: jest.fn((entity) =>
          entity === ActionApprovalBindingEntity
            ? bindingRepository
            : receiptRepository,
        ),
      } as never,
      { projectReceipt: jest.fn() } as never,
    );

    await expect(
      service.findComposerAttempt({
        workspaceId,
        draftId: approvalBindingId,
        initiatorUserWorkspaceId: userWorkspaceId,
      }),
    ).resolves.toBeNull();
    expect(receiptRepository.findOne).not.toHaveBeenCalled();
  });
});

describe('ActionApprovalService query-aware composer access isolation', () => {
  const draftId = '00000000-0000-4000-8000-000000000050';
  const buildLookup = (
    bindingPatch: Record<string, unknown> = {},
    receiptPatch: Record<string, unknown> = {},
  ) => {
    const binding = {
      id: approvalBindingId,
      workspaceId,
      draftId,
      initiatorUserWorkspaceId: userWorkspaceId,
      actionName: 'send_instagram_message',
      actionVersion: 3,
      actionKind: 'START_CHAT',
      state: ActionApprovalBindingState.APPROVED,
      threadId: null,
      interactionContextType: 'MYAH_INSTAGRAM_MESSAGE_DRAFT',
      interactionContextId: draftId,
      composerInputDigest: 'a'.repeat(64),
      instagramMessageSnapshot: {
        publicIdentifier: 'creator.name',
        providerId: 'profile-id',
        providerMessagingId: 'messaging-id',
        creatorRecordId: threadId,
        accountBindingId: approvalBindingId,
        instagramAccountRecordId: draftId,
        unipileAccountId: 'account',
        instagramUserId: 'user',
        recipientSourceValues: [
          { field: 'instagramUsername', value: 'creator.name' },
        ],
        actionKind: 'START_CHAT',
        conversationRecordId: null,
        providerChatId: null,
        attendeeProviderId: null,
      },
      ...bindingPatch,
    };
    const receipt = {
      id: 'receipt-id',
      workspaceId,
      actionApprovalBindingId: approvalBindingId,
      state: ActionExecutionReceiptState.SENT,
      providerCode: 'accepted',
      redactedOutcome: null,
      updatedAt: new Date('2026-09-01T00:00:00Z'),
      ...receiptPatch,
    };
    const matches = (
      row: Record<string, unknown>,
      where: Record<string, unknown>,
    ) =>
      Object.entries(where).every(([key, value]) => {
        if (value instanceof FindOperator) {
          if (value.type === 'isNull') return row[key] === null;
          if (value.type === 'in') return value.value.includes(row[key]);
          throw new Error(`Unexpected operator ${value.type}`);
        }
        return row[key] === value;
      });
    const bindings = {
      findOne: jest.fn(async ({ where, order }) => {
        expect(where).toEqual({
          workspaceId,
          draftId,
          initiatorUserWorkspaceId: userWorkspaceId,
          actionName: 'send_instagram_message',
          actionVersion: 3,
          state: In([
            ActionApprovalBindingState.APPROVED,
            ActionApprovalBindingState.CONSUMED,
          ]),
          threadId: IsNull(),
          interactionContextType: 'MYAH_INSTAGRAM_MESSAGE_DRAFT',
          interactionContextId: draftId,
        });
        expect(order).toEqual({ createdAt: 'DESC' });
        return matches(binding, where) ? binding : null;
      }),
    };
    const receipts = {
      findOne: jest.fn(async ({ where }) => {
        expect(where).toEqual({
          workspaceId,
          actionApprovalBindingId: approvalBindingId,
        });
        return matches(receipt, where) ? receipt : null;
      }),
    };
    const service = new ActionApprovalService(
      {
        getRepository: jest.fn((entity) => {
          if (entity === ActionApprovalBindingEntity) return bindings;
          expect(entity).toBe(ActionExecutionReceiptEntity);
          return receipts;
        }),
      } as never,
      {} as never,
    );
    return { service, bindings, receipts, receipt };
  };
  const lookup = {
    workspaceId,
    draftId,
    initiatorUserWorkspaceId: userWorkspaceId,
  };

  it.each([
    { name: 'workspace', patch: { workspaceId: threadId } },
    { name: 'initiating user', patch: { initiatorUserWorkspaceId: threadId } },
    { name: 'draft', patch: { draftId: threadId } },
    { name: 'action name', patch: { actionName: 'send_instagram_reply' } },
    { name: 'version', patch: { actionVersion: 2 } },
    {
      name: 'pending state',
      patch: { state: ActionApprovalBindingState.PENDING },
    },
    { name: 'thread', patch: { threadId } },
    {
      name: 'context type',
      patch: { interactionContextType: 'MYAH_INBOX_INSTAGRAM_DRAFT' },
    },
    { name: 'context draft', patch: { interactionContextId: threadId } },
  ])(
    'does not expose another $name binding or its receipt',
    async ({ patch }) => {
      const h = buildLookup(patch);
      await expect(h.service.findComposerAttempt(lookup)).resolves.toBeNull();
      expect(h.receipts.findOne).not.toHaveBeenCalled();
    },
  );

  it.each([
    { name: 'workspace', patch: { workspaceId: threadId } },
    { name: 'binding', patch: { actionApprovalBindingId: threadId } },
  ])('does not attach a receipt from another $name', async ({ patch }) => {
    const h = buildLookup({}, patch);
    await expect(h.service.findComposerAttempt(lookup)).resolves.toMatchObject({
      id: approvalBindingId,
      receipt: null,
    });
  });

  it.each([
    ActionApprovalBindingState.APPROVED,
    ActionApprovalBindingState.CONSUMED,
  ])(
    'recovers only the exact authenticated %s binding and receipt',
    async (state) => {
      const h = buildLookup({ state });
      await expect(
        h.service.findComposerAttempt(lookup),
      ).resolves.toMatchObject({
        id: approvalBindingId,
        receipt: {
          id: 'receipt-id',
          workspaceId,
          state: 'SENT',
          providerCode: 'accepted',
          outcome: null,
          occurredAt: h.receipt.updatedAt,
        },
      });
    },
  );

  it.each([
    { name: 'digest', patch: { composerInputDigest: 'bad' } },
    { name: 'snapshot', patch: { instagramMessageSnapshot: {} } },
    { name: 'route mismatch', patch: { actionKind: 'REPLY' } },
  ])(
    'rejects malformed $name on an otherwise authenticated matching binding',
    async ({ patch }) => {
      const h = buildLookup(patch);
      await expect(h.service.findComposerAttempt(lookup)).resolves.toBeNull();
      expect(h.receipts.findOne).not.toHaveBeenCalled();
    },
  );
});
