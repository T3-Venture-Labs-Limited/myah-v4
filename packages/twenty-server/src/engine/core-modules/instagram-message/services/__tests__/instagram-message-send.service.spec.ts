import { ActionExecutionReceiptState } from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';
import { buildInstagramMessageActionAuthority } from 'src/engine/core-modules/action-approval/definitions/instagram-message-action.definition';

type SendService = {
  executeApproved: (
    input: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  sendDirect: (
    input: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
};

type SendServiceConstructor = new (...dependencies: never[]) => SendService;

type SendServiceModule = {
  InstagramMessageSendService: SendServiceConstructor;
};

const workspaceId = '00000000-0000-4000-8000-000000000001';
const userWorkspaceId = '00000000-0000-4000-8000-000000000002';
const draftId = '00000000-0000-4000-8000-000000000003';
const approvalBindingId = '00000000-0000-4000-8000-000000000004';
const receiptId = '00000000-0000-4000-8000-000000000005';
const reservationId = '00000000-0000-4000-8000-000000000006';

const loadService = (): SendServiceConstructor | undefined => {
  try {
    return (require('../instagram-message-send.service') as SendServiceModule)
      .InstagramMessageSendService;
  } catch {
    return undefined;
  }
};

const authority = buildInstagramMessageActionAuthority({
  workspaceId,
  initiatorUserWorkspaceId: userWorkspaceId,
  threadId: null,
  interactionContextType: 'MYAH_INBOX_INSTAGRAM_DRAFT',
  interactionContextId: draftId,
  draft: {
    id: draftId,
    revision: 2,
    body: 'Hello creator',
    kind: 'START_CHAT',
    creatorRecordId: '00000000-0000-4000-8000-000000000007',
    recipientUsername: 'creator.name',
    recipientSourceValues: [
      { field: 'instagramUsername', value: '@Creator.Name' },
    ],
    conversationRecordId: null,
    providerConversationId: null,
    recipientProviderId: 'creator.name',
  },
  account: {
    bindingId: '00000000-0000-4000-8000-000000000008',
    workspaceInstagramAccountRecordId: '00000000-0000-4000-8000-000000000009',
    unipileAccountId: 'provider-account',
    instagramUserId: 'brand-provider-user',
  },
  evidenceLinks: [],
});

const buildHarness = () => {
  const actionApprovalService = {
    createApprovedInstagramMessageBinding: jest
      .fn()
      .mockResolvedValue({ id: approvalBindingId }),
    getApprovedBinding: jest
      .fn()
      .mockResolvedValue(authority.expectedActionBinding),
    findExecutionReceiptForBinding: jest.fn().mockResolvedValue(null),
    reserveExecutionForBinding: jest.fn().mockResolvedValue({
      created: true,
      receipt: { id: receiptId, state: ActionExecutionReceiptState.PROCESSING },
    }),
    recordProviderAccepted: jest.fn().mockResolvedValue(undefined),
    recordProviderTerminalState: jest.fn().mockResolvedValue(undefined),
  };
  const authorityService = {
    assertReadyAfterReservation: jest.fn().mockResolvedValue(undefined),
    getDraftActionKind: jest.fn().mockResolvedValue('START_CHAT'),
    createDirectAuthority: jest.fn().mockResolvedValue(authority),
    rebuildExecutionAuthority: jest.fn().mockResolvedValue(authority),
  };
  const draftLockService = {
    withLock: jest.fn(async (_input, operation) => operation()),
  };
  const budgetService = {
    reserve: jest.fn().mockResolvedValue({
      status: 'RESERVED',
      reservationId,
    }),
    markProviderAttempted: jest.fn().mockResolvedValue(undefined),
    releasePreDispatch: jest.fn().mockResolvedValue(undefined),
    releaseStartTarget: jest.fn().mockResolvedValue(undefined),
    releaseStartTargetForReceipt: jest.fn().mockResolvedValue(undefined),
  };
  const client = {
    startChat: jest.fn().mockImplementation(async (_input, options) => {
      await options.beforeDispatch();
      return {
        kind: 'ACCEPTED',
        value: { chatId: 'provider-chat', messageId: 'provider-message' },
      };
    }),
    sendMessage: jest.fn(),
  };
  const projector = {
    projectReceiptWithWriter: jest.fn().mockResolvedValue(undefined),
  };
  const messageProjectionWriter = { project: jest.fn() };
  const permissionService = {
    assertCanSend: jest.fn().mockResolvedValue(undefined),
  };
  const recordAccessService = {
    assertCanExecuteDraft: jest.fn().mockResolvedValue({
      draft: authority.canonicalGraph.draft,
      instagramAccountRecordId:
        authority.canonicalGraph.account.workspaceInstagramAccountRecordId,
    }),
  };
  const Service = loadService();

  expect(Service).toBeDefined();

  return {
    actionApprovalService,
    authorityService,
    draftLockService,
    budgetService,
    client,
    projector,
    messageProjectionWriter,
    permissionService,
    recordAccessService,
    service: new Service!(
      actionApprovalService as never,
      authorityService as never,
      draftLockService as never,
      budgetService as never,
      client as never,
      projector as never,
      messageProjectionWriter as never,
      permissionService as never,
      recordAccessService as never,
    ),
  };
};

const executeInput = {
  workspaceId,
  initiatorUserWorkspaceId: userWorkspaceId,
  approvalBindingId,
  threadId: null,
  interactionContextType: 'MYAH_INBOX_INSTAGRAM_DRAFT',
  interactionContextId: draftId,
  rolePermissionConfig: { userWorkspaceId },
};

describe('InstagramMessageSendService', () => {
  it('turns the direct Send click into one already-approved draft-bound v2 authority before execution', async () => {
    const harness = buildHarness();

    await expect(
      harness.service.sendDirect({
        workspaceId,
        initiatorUserWorkspaceId: userWorkspaceId,
        draftId,
        expectedRevision: 2,
        rolePermissionConfig: executeInput.rolePermissionConfig,
      }),
    ).resolves.toEqual({ status: 'SENT', receiptId });
    expect(harness.authorityService.createDirectAuthority).toHaveBeenCalledWith(
      {
        workspaceId,
        initiatorUserWorkspaceId: userWorkspaceId,
        draftId,
        expectedRevision: 2,
      },
    );
    expect(
      harness.actionApprovalService.createApprovedInstagramMessageBinding,
    ).toHaveBeenCalledWith(authority.expectedActionBinding);
    expect(harness.client.startChat).toHaveBeenCalledTimes(1);
    expect(
      harness.permissionService.assertCanSend.mock.invocationCallOrder[0],
    ).toBeLessThan(
      harness.authorityService.createDirectAuthority.mock
        .invocationCallOrder[0],
    );
  });

  it('reserves receipt and budget, marks attempted immediately before one START_CHAT, records accepted before provider-free projection', async () => {
    const harness = buildHarness();

    await expect(
      harness.service.executeApproved(executeInput),
    ).resolves.toEqual({
      status: 'SENT',
      receiptId,
    });
    expect(harness.permissionService.assertCanSend).toHaveBeenCalledWith({
      actionKind: 'START_CHAT',
      rolePermissionConfig: executeInput.rolePermissionConfig,
      workspaceId,
    });
    expect(harness.budgetService.reserve).toHaveBeenCalledWith({
      workspaceId,
      instagramAccountRecordId:
        authority.canonicalGraph.account.workspaceInstagramAccountRecordId,
      actionExecutionReceiptId: receiptId,
      actionKind: 'START_CHAT',
      targetFingerprint: authority.expectedActionBinding.recipientFingerprint,
    });
    expect(harness.client.startChat).toHaveBeenCalledTimes(1);
    expect(harness.client.sendMessage).not.toHaveBeenCalled();
    expect(harness.budgetService.markProviderAttempted).toHaveBeenCalledWith({
      workspaceId,
      reservationId,
    });
    expect(
      harness.actionApprovalService.recordProviderAccepted,
    ).toHaveBeenCalledWith(
      receiptId,
      expect.objectContaining({
        providerExternalMessageId: 'provider-message',
        providerThreadExternalId: 'provider-chat',
      }),
    );
    expect(
      harness.actionApprovalService.recordProviderAccepted.mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      harness.projector.projectReceiptWithWriter.mock.invocationCallOrder[0],
    );
    expect(harness.projector.projectReceiptWithWriter).toHaveBeenCalledWith(
      receiptId,
      harness.messageProjectionWriter,
    );
  });

  it('rechecks exact draft and target record access immediately before execution', async () => {
    const harness = buildHarness();
    harness.recordAccessService.assertCanExecuteDraft.mockRejectedValue(
      new Error('Creator is unavailable'),
    );

    await expect(harness.service.executeApproved(executeInput)).rejects.toThrow(
      'Creator is unavailable',
    );

    expect(
      harness.recordAccessService.assertCanExecuteDraft,
    ).toHaveBeenCalledWith({
      workspaceId,
      draftId,
      rolePermissionConfig: executeInput.rolePermissionConfig,
    });
    expect(
      harness.authorityService.rebuildExecutionAuthority,
    ).not.toHaveBeenCalled();
    expect(
      harness.actionApprovalService.reserveExecutionForBinding,
    ).not.toHaveBeenCalled();
    expect(harness.budgetService.reserve).not.toHaveBeenCalled();
    expect(harness.client.startChat).not.toHaveBeenCalled();
  });

  it('returns an existing terminal receipt without another budget reservation or provider call', async () => {
    const harness = buildHarness();
    harness.actionApprovalService.findExecutionReceiptForBinding.mockResolvedValue(
      {
        id: receiptId,
        state: ActionExecutionReceiptState.SENT,
      },
    );

    await expect(
      harness.service.executeApproved(executeInput),
    ).resolves.toEqual({ status: 'SENT', receiptId });
    expect(harness.budgetService.reserve).not.toHaveBeenCalled();
    expect(harness.client.startChat).not.toHaveBeenCalled();
  });

  it('returns the exact durable limit result without provider I/O', async () => {
    const harness = buildHarness();
    const blocked = {
      status: 'BLOCKED',
      code: 'INSTAGRAM_ACTION_LIMIT_REACHED',
      hourlyUsed: 10,
      hourlyLimit: 10,
      hourlyRemaining: 0,
      dailyUsed: 20,
      dailyLimit: 100,
      dailyRemaining: 80,
      blockedWindows: ['HOURLY'],
      nextEligibleAt: new Date('2026-09-05T13:00:00.000Z'),
    };
    harness.budgetService.reserve.mockResolvedValue(blocked);

    await expect(
      harness.service.executeApproved(executeInput),
    ).resolves.toEqual({ ...blocked, receiptId });
    expect(harness.client.startChat).not.toHaveBeenCalled();
    expect(
      harness.authorityService.assertReadyAfterReservation,
    ).not.toHaveBeenCalled();
  });

  it('retains capacity but releases a START_CHAT target after a known provider rejection', async () => {
    const harness = buildHarness();
    harness.client.startChat.mockImplementation(async (_input, options) => {
      await options.beforeDispatch();
      return {
        kind: 'KNOWN_REJECTION',
        status: 400,
        code: 'UNIPILE_CHAT_START_REJECTED',
      };
    });

    await expect(
      harness.service.executeApproved(executeInput),
    ).resolves.toEqual({ status: 'FAILED', receiptId });
    expect(
      harness.actionApprovalService.recordProviderTerminalState,
    ).toHaveBeenCalledWith({
      receiptId,
      state: ActionExecutionReceiptState.FAILED,
      code: 'failed',
    });
    expect(harness.budgetService.releaseStartTarget).toHaveBeenCalledWith({
      workspaceId,
      reservationId,
      reason: 'KNOWN_REJECTION',
    });
    expect(harness.budgetService.releasePreDispatch).not.toHaveBeenCalled();
  });

  it('records an uncertain dispatch as UNKNOWN and keeps its capacity and target lock', async () => {
    const harness = buildHarness();
    harness.client.startChat.mockImplementation(async (_input, options) => {
      await options.beforeDispatch();
      return {
        kind: 'UNKNOWN',
        status: null,
        code: 'UNIPILE_CHAT_START_UNKNOWN',
      };
    });

    await expect(
      harness.service.executeApproved(executeInput),
    ).resolves.toEqual({ status: 'UNKNOWN', receiptId });
    expect(
      harness.actionApprovalService.recordProviderTerminalState,
    ).toHaveBeenCalledWith({
      receiptId,
      state: ActionExecutionReceiptState.UNKNOWN,
      code: 'unknown',
    });
    expect(harness.budgetService.releaseStartTarget).not.toHaveBeenCalled();
    expect(harness.budgetService.releasePreDispatch).not.toHaveBeenCalled();
  });
  it('blocks and releases pre-dispatch capacity when the target changes after the durable claim', async () => {
    const harness = buildHarness();
    harness.authorityService.assertReadyAfterReservation.mockRejectedValue(
      new Error('A provider chat now exists'),
    );

    await expect(
      harness.service.executeApproved(executeInput),
    ).resolves.toEqual({ status: 'BLOCKED', receiptId });
    expect(harness.budgetService.releasePreDispatch).toHaveBeenCalledWith({
      workspaceId,
      reservationId,
      reason: 'INSTAGRAM_TARGET_CHANGED',
    });
    expect(
      harness.actionApprovalService.recordProviderTerminalState,
    ).toHaveBeenCalledWith({
      receiptId,
      state: ActionExecutionReceiptState.BLOCKED,
      code: 'blocked',
    });
    expect(harness.client.startChat).not.toHaveBeenCalled();
  });

  it('allows at most one provider call for distinct approved START_CHAT drafts targeting the same account and recipient', async () => {
    const harness = buildHarness();
    harness.budgetService.reserve
      .mockResolvedValueOnce({ status: 'RESERVED', reservationId })
      .mockRejectedValueOnce(
        new Error('A START_CHAT reservation already holds this target'),
      );

    const outcomes = await Promise.allSettled([
      harness.service.executeApproved(executeInput),
      harness.service.executeApproved({
        ...executeInput,
        approvalBindingId: '00000000-0000-4000-8000-000000000099',
      }),
    ]);

    expect(outcomes.every(({ status }) => status === 'fulfilled')).toBe(true);
    expect(
      outcomes
        .filter(
          (
            outcome,
          ): outcome is PromiseFulfilledResult<Record<string, unknown>> =>
            outcome.status === 'fulfilled',
        )
        .map(({ value }) => value.status)
        .sort(),
    ).toEqual(['FAILED', 'SENT']);
    expect(harness.client.startChat).toHaveBeenCalledTimes(1);
  });
});
