import { createV3RecoveryFixture } from './instagram-message-v3-recovery.fixture';
import { InstagramMessageSendService } from '../instagram-message-send.service';
import { ActionApprovalService } from 'src/engine/core-modules/action-approval/services/action-approval.service';
import { InstagramMessageAuthorityReaderService } from 'src/engine/core-modules/instagram-message/services/instagram-message-authority-reader.service';
import { InstagramMessageReconciliationService } from 'src/engine/core-modules/instagram-message/services/instagram-message-reconciliation.service';
import { ActionExecutionReceiptState } from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';
import { buildLegacyInstagramMessageActionAuthority } from 'src/engine/core-modules/action-approval/definitions/instagram-message-action.definition';

type SendService = {
  executeApprovedWithDraftLockHeld: (
    input: Record<string, unknown>,
    binding: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
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

const authority = buildLegacyInstagramMessageActionAuthority({
  workspaceId,
  initiatorUserWorkspaceId: userWorkspaceId,
  threadId: null,
  interactionContextType: 'MYAH_INBOX_INSTAGRAM_DRAFT',
  interactionContextId: draftId,
  draft: {
    id: draftId,
    revision: 2,
    body: 'Hello creator',
    kind: 'REPLY',
    creatorRecordId: '00000000-0000-4000-8000-000000000007',
    recipientUsername: 'creator.name',
    recipientSourceValues: [
      { field: 'instagramUsername', value: '@Creator.Name' },
    ],
    conversationRecordId: '00000000-0000-4000-8000-000000000010',
    providerConversationId: 'provider-chat',
    recipientProviderId: 'recipient-igsid',
  },
  account: {
    bindingId: '00000000-0000-4000-8000-000000000008',
    workspaceInstagramAccountRecordId: '00000000-0000-4000-8000-000000000009',
    unipileAccountId: 'provider-account',
    instagramUserId: 'brand-provider-user',
  },
  evidenceLinks: [],
});

const buildHarness = (
  authorityReader?: InstagramMessageAuthorityReaderService,
) => {
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
    getDraftActionKind: jest.fn().mockResolvedValue('REPLY'),
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
    getChat: jest.fn(),
    listChats: jest.fn(),
    sendMessage: jest.fn().mockImplementation(async (_input, options) => {
      await options.beforeDispatch();
      return {
        kind: 'ACCEPTED',
        value: { messageId: 'provider-message' },
      };
    }),
    startChat: jest.fn(),
  };
  const projector = {
    projectReceiptWithWriter: jest.fn().mockResolvedValue({ projected: true }),
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
      (authorityReader ?? authorityService) as never,
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
  it('fails closed when v3 START authority reconstruction is unavailable; receipt recovery remains first', async () => {
    const harness = buildHarness();
    const forbiddenWork = [
      ...Object.values(harness.authorityService),
      harness.actionApprovalService.reserveExecutionForBinding,
      ...Object.values(harness.budgetService),
      ...Object.values(harness.client),
    ];
    for (const spy of forbiddenWork) {
      spy.mockImplementation(() => {
        throw new Error('forbidden work before v3 guard');
      });
    }
    const v3StartBinding = {
      ...authority.expectedActionBinding,
      actionVersion: 3,
      actionKind: 'START_CHAT',
      interactionContextType: 'MYAH_INSTAGRAM_MESSAGE_DRAFT',
      interactionContextId: draftId,
      composerInputDigest: 'e'.repeat(64),
      instagramMessageSnapshot: {
        publicIdentifier: 'creator.name',
        providerId: 'recipient-profile-id',
        providerMessagingId: 'recipient-messaging-id',
        creatorRecordId: '00000000-0000-4000-8000-000000000007',
        accountBindingId: '00000000-0000-4000-8000-000000000008',
        instagramAccountRecordId: '00000000-0000-4000-8000-000000000009',
        unipileAccountId: 'provider-account',
        instagramUserId: 'brand-provider-user',
        recipientSourceValues: [
          { field: 'instagramUsername', value: '@Creator.Name' },
        ],
        actionKind: 'START_CHAT',
        conversationRecordId: null,
        providerChatId: null,
        attendeeProviderId: null,
      },
    };

    await expect(
      harness.service.executeApprovedWithDraftLockHeld(
        {
          ...executeInput,
          interactionContextType: 'MYAH_INSTAGRAM_MESSAGE_DRAFT',
        },
        v3StartBinding,
      ),
    ).rejects.toThrow('forbidden work before v3 guard');
    expect(
      harness.authorityService.rebuildExecutionAuthority,
    ).toHaveBeenCalledTimes(1);
    harness.authorityService.rebuildExecutionAuthority.mockClear();
    for (const spy of forbiddenWork) expect(spy).not.toHaveBeenCalled();
    // Terminal receipt recovery retains existing target-release bookkeeping;
    // it must still never rebuild authority, reserve, or contact the provider.
    harness.budgetService.releaseStartTargetForReceipt.mockResolvedValue(
      undefined,
    );
    harness.actionApprovalService.findExecutionReceiptForBinding.mockResolvedValue(
      {
        id: receiptId,
        state: ActionExecutionReceiptState.SENT,
      } as never,
    );
    await expect(
      harness.service.executeApprovedWithDraftLockHeld(
        {
          ...executeInput,
          interactionContextType: 'MYAH_INSTAGRAM_MESSAGE_DRAFT',
        },
        v3StartBinding,
      ),
    ).resolves.toEqual({ status: 'SENT', receiptId });
    expect(
      harness.budgetService.releaseStartTargetForReceipt,
    ).toHaveBeenCalledWith({
      workspaceId,
      actionExecutionReceiptId: receiptId,
      reason: 'PROJECTED',
    });
    for (const spy of forbiddenWork) {
      if (spy !== harness.budgetService.releaseStartTargetForReceipt) {
        expect(spy).not.toHaveBeenCalled();
      }
    }

    expect(
      harness.actionApprovalService.reserveExecutionForBinding,
    ).not.toHaveBeenCalled();
    expect(harness.budgetService.reserve).not.toHaveBeenCalled();
    expect(harness.client.startChat).not.toHaveBeenCalled();
    expect(harness.client.sendMessage).not.toHaveBeenCalled();
  });

  it('fails closed when v3 REPLY authority reconstruction is unavailable; receipt recovery remains first', async () => {
    const harness = buildHarness();
    const forbiddenWork = [
      ...Object.values(harness.authorityService),
      harness.actionApprovalService.reserveExecutionForBinding,
      ...Object.values(harness.budgetService),
      ...Object.values(harness.client),
    ];
    for (const spy of forbiddenWork) {
      spy.mockImplementation(() => {
        throw new Error('forbidden work before v3 guard');
      });
    }
    const v3ReplyBinding = {
      ...authority.expectedActionBinding,
      actionVersion: 3 as const,
      actionKind: 'REPLY' as const,
      interactionContextType: 'MYAH_INSTAGRAM_MESSAGE_DRAFT' as const,
      interactionContextId: draftId,
      composerInputDigest: 'e'.repeat(64),
      instagramMessageSnapshot: {
        publicIdentifier: 'creator.name',
        providerId: 'recipient-profile-id',
        providerMessagingId: 'recipient-messaging-id',
        creatorRecordId: '00000000-0000-4000-8000-000000000007',
        accountBindingId: '00000000-0000-4000-8000-000000000008',
        instagramAccountRecordId: '00000000-0000-4000-8000-000000000009',
        unipileAccountId: 'provider-account',
        instagramUserId: 'brand-provider-user',
        recipientSourceValues: [
          { field: 'instagramUsername', value: '@Creator.Name' },
        ],
        actionKind: 'REPLY' as const,
        conversationRecordId: '00000000-0000-4000-8000-000000000010',
        providerChatId: 'provider-chat',
        attendeeProviderId: 'recipient-messaging-id',
      },
    };

    await expect(
      harness.service.executeApprovedWithDraftLockHeld(
        {
          ...executeInput,
          interactionContextType: 'MYAH_INSTAGRAM_MESSAGE_DRAFT',
        },
        v3ReplyBinding,
      ),
    ).rejects.toThrow('forbidden work before v3 guard');
    expect(
      harness.authorityService.rebuildExecutionAuthority,
    ).toHaveBeenCalledTimes(1);
    harness.authorityService.rebuildExecutionAuthority.mockClear();
    for (const spy of forbiddenWork) expect(spy).not.toHaveBeenCalled();
    // Terminal receipt recovery retains existing target-release bookkeeping;
    // it must still never rebuild authority, reserve, or contact the provider.
    harness.budgetService.releaseStartTargetForReceipt.mockResolvedValue(
      undefined,
    );
    harness.actionApprovalService.findExecutionReceiptForBinding.mockResolvedValue(
      {
        id: receiptId,
        state: ActionExecutionReceiptState.SENT,
      } as never,
    );
    await expect(
      harness.service.executeApprovedWithDraftLockHeld(
        {
          ...executeInput,
          interactionContextType: 'MYAH_INSTAGRAM_MESSAGE_DRAFT',
        },
        v3ReplyBinding,
      ),
    ).resolves.toEqual({ status: 'SENT', receiptId });
    expect(
      harness.budgetService.releaseStartTargetForReceipt,
    ).toHaveBeenCalledWith({
      workspaceId,
      actionExecutionReceiptId: receiptId,
      reason: 'PROJECTED',
    });
    for (const spy of forbiddenWork) {
      if (spy !== harness.budgetService.releaseStartTargetForReceipt) {
        expect(spy).not.toHaveBeenCalled();
      }
    }

    expect(
      harness.authorityService.rebuildExecutionAuthority,
    ).not.toHaveBeenCalled();
    expect(
      harness.actionApprovalService.reserveExecutionForBinding,
    ).not.toHaveBeenCalled();
    expect(harness.budgetService.reserve).not.toHaveBeenCalled();
    expect(harness.client.sendMessage).not.toHaveBeenCalled();
  });

  it('does not execute a stale v2 direct producer through the fresh v3 context', async () => {
    const harness = buildHarness();
    await expect(
      harness.service.sendDirect({
        workspaceId,
        initiatorUserWorkspaceId: userWorkspaceId,
        draftId,
        expectedRevision: 2,
        rolePermissionConfig: executeInput.rolePermissionConfig,
      }),
    ).rejects.toThrow('Instagram approval context changed');
    expect(harness.client.sendMessage).not.toHaveBeenCalled();
  });

  it('reserves receipt and budget, marks attempted immediately before one REPLY, records accepted before receipt projection', async () => {
    const harness = buildHarness();

    await expect(
      harness.service.executeApproved(executeInput),
    ).resolves.toEqual({
      status: 'SENT',
      receiptId,
    });
    expect(harness.permissionService.assertCanSend).toHaveBeenCalledWith({
      actionKind: 'REPLY',
      rolePermissionConfig: executeInput.rolePermissionConfig,
      workspaceId,
    });
    expect(harness.budgetService.reserve).toHaveBeenCalledWith({
      workspaceId,
      instagramAccountRecordId:
        authority.canonicalGraph.account.workspaceInstagramAccountRecordId,
      actionExecutionReceiptId: receiptId,
      actionKind: 'REPLY',
      targetFingerprint: authority.expectedActionBinding.recipientFingerprint,
    });
    expect(harness.client.sendMessage).toHaveBeenCalledTimes(1);
    expect(harness.client.startChat).not.toHaveBeenCalled();
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

  it('fails before any provider call when the draft body exceeds 1000 UTF-8 bytes', async () => {
    const harness = buildHarness();
    const oversizedAuthority = buildLegacyInstagramMessageActionAuthority({
      workspaceId,
      initiatorUserWorkspaceId: userWorkspaceId,
      threadId: null,
      interactionContextType: 'MYAH_INBOX_INSTAGRAM_DRAFT',
      interactionContextId: draftId,
      draft: { ...authority.canonicalGraph.draft, body: 'a'.repeat(1001) },
      account: authority.canonicalGraph.account,
      evidenceLinks: [],
    });

    harness.authorityService.rebuildExecutionAuthority.mockResolvedValue(
      oversizedAuthority,
    );

    await expect(
      harness.service.executeApproved(executeInput),
    ).resolves.toEqual({ status: 'FAILED', receiptId });
    expect(harness.client.sendMessage).not.toHaveBeenCalled();
    expect(harness.client.startChat).not.toHaveBeenCalled();
    expect(harness.budgetService.markProviderAttempted).not.toHaveBeenCalled();
    expect(harness.budgetService.releasePreDispatch).toHaveBeenCalledWith({
      workspaceId,
      reservationId,
      reason: 'PROVIDER_DISPATCH_NOT_STARTED',
    });
    expect(
      harness.actionApprovalService.recordProviderTerminalState,
    ).toHaveBeenCalledWith({
      receiptId,
      state: ActionExecutionReceiptState.FAILED,
      code: 'failed',
    });
  });

  it('accepts a draft body of exactly 1000 UTF-8 bytes and still dispatches', async () => {
    const harness = buildHarness();
    const atLimitAuthority = buildLegacyInstagramMessageActionAuthority({
      workspaceId,
      initiatorUserWorkspaceId: userWorkspaceId,
      threadId: null,
      interactionContextType: 'MYAH_INBOX_INSTAGRAM_DRAFT',
      interactionContextId: draftId,
      draft: { ...authority.canonicalGraph.draft, body: 'a'.repeat(1000) },
      account: authority.canonicalGraph.account,
      evidenceLinks: [],
    });

    harness.authorityService.rebuildExecutionAuthority.mockResolvedValue(
      atLimitAuthority,
    );

    await expect(
      harness.service.executeApproved(executeInput),
    ).resolves.toEqual({ status: 'SENT', receiptId });
    expect(harness.client.sendMessage).toHaveBeenCalledTimes(1);
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
    expect(harness.client.sendMessage).not.toHaveBeenCalled();
  });

  it('retains the canonical-account comparator and stops before reservation or provider I/O on an exact-account mismatch', async () => {
    const harness = buildHarness();
    harness.recordAccessService.assertCanExecuteDraft.mockResolvedValue({
      draft: authority.canonicalGraph.draft,
      instagramAccountRecordId: '00000000-0000-4000-8000-000000000099',
    });

    await expect(harness.service.executeApproved(executeInput)).rejects.toThrow(
      'Instagram account is unavailable',
    );

    expect(
      harness.actionApprovalService.reserveExecutionForBinding,
    ).not.toHaveBeenCalled();
    expect(harness.budgetService.reserve).not.toHaveBeenCalled();
    expect(
      harness.authorityService.assertReadyAfterReservation,
    ).not.toHaveBeenCalled();
    expect(harness.client.getChat).not.toHaveBeenCalled();
    expect(harness.client.listChats).not.toHaveBeenCalled();
    expect(harness.client.sendMessage).not.toHaveBeenCalled();
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
    expect(harness.client.sendMessage).not.toHaveBeenCalled();
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
    expect(harness.client.sendMessage).not.toHaveBeenCalled();
    expect(
      harness.authorityService.assertReadyAfterReservation,
    ).not.toHaveBeenCalled();
  });

  it('retains REPLY capacity after a known provider rejection without releasing a START target', async () => {
    const harness = buildHarness();
    harness.client.sendMessage.mockImplementation(async (_input, options) => {
      await options.beforeDispatch();
      return {
        kind: 'KNOWN_REJECTION',
        status: 400,
        code: 'UNIPILE_MESSAGE_SEND_REJECTED',
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
    expect(harness.budgetService.releaseStartTarget).not.toHaveBeenCalled();
    expect(harness.budgetService.releasePreDispatch).not.toHaveBeenCalled();
  });

  it('records an uncertain dispatch as UNKNOWN and keeps its capacity and target lock', async () => {
    const harness = buildHarness();
    harness.client.sendMessage.mockImplementation(async (_input, options) => {
      await options.beforeDispatch();
      return {
        kind: 'UNKNOWN',
        status: null,
        code: 'UNIPILE_MESSAGE_SEND_UNKNOWN',
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
    expect(harness.client.sendMessage).not.toHaveBeenCalled();
  });

  it('rejects distinct approved START drafts without reserving or dispatching either', async () => {
    const harness = buildHarness();
    harness.actionApprovalService.getApprovedBinding.mockResolvedValue(
      startAuthority('creator.name').expectedActionBinding,
    );
    const outcomes = await Promise.allSettled([
      harness.service.executeApproved(executeInput),
      harness.service.executeApproved({
        ...executeInput,
        approvalBindingId: 'other-binding',
      }),
    ]);
    expect(outcomes.map(({ status }) => status)).toEqual([
      'rejected',
      'rejected',
    ]);
    expect(
      harness.actionApprovalService.reserveExecutionForBinding,
    ).not.toHaveBeenCalled();
    expect(harness.budgetService.reserve).not.toHaveBeenCalled();
    expect(harness.client.startChat).not.toHaveBeenCalled();
    expect(harness.client.sendMessage).not.toHaveBeenCalled();
  });
});

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

// Real send orchestration and canonical reader; only repositories, budget/receipt I/O,
// lock and provider boundaries are mocked. Rows model the persisted saved revision.
const buildCurrentSourceHarness = async (
  kind: 'REPLY' | 'START_CHAT' = 'REPLY',
) => {
  const draft = {
    id: draftId,
    body: 'Hello creator',
    revision: 2,
    kind: kind === 'REPLY' ? 'REPLY' : 'FIRST_MESSAGE',
    creatorId: authority.canonicalGraph.draft.creatorRecordId,
    recipientUsername: 'creator.name',
    recipientProviderId: kind === 'REPLY' ? 'recipient-igsid' : 'creator.name',
    conversationId: kind === 'REPLY' ? 'conversation-id' : null,
    sentAt: null,
    creatorInstagramUsername: '@Creator.Name',
    creatorInstagramUrl: null as string | null,
    creatorInstagramLinkPrimaryLinkUrl: null,
    providerConversationId: kind === 'REPLY' ? 'provider-chat' : null,
    conversationRecipientIgsid: kind === 'REPLY' ? 'recipient-igsid' : null,
    conversationRecipientUsername: null,
    conversationProvider: kind === 'REPLY' ? 'UNIPILE' : null,
    conversationLifecycle: kind === 'REPLY' ? 'ACTIVE' : null,
    conversationInstagramAccountId:
      kind === 'REPLY'
        ? authority.canonicalGraph.account.workspaceInstagramAccountRecordId
        : null,
    conversationCreatorId:
      kind === 'REPLY' ? authority.canonicalGraph.draft.creatorRecordId : null,
  };
  const account = authority.canonicalGraph.account;
  const readClient = {
    getChat: jest.fn().mockResolvedValue({ chatId: 'provider-chat' }),
    listChats: jest.fn().mockResolvedValue({ chats: [], nextCursor: null }),
    listMessages: jest.fn(),
  };
  const query = jest.fn(async (sql: string) =>
    sql.includes('"_myahInstagramReplyDraft"') ? [{ ...draft }] : [],
  );
  const reader = new InstagramMessageAuthorityReaderService(
    { findOneBy: jest.fn().mockResolvedValue({ id: workspaceId }) } as never,
    {
      executeInWorkspaceContext: jest.fn(async (callback) => callback()),
      getGlobalWorkspaceDataSource: jest.fn().mockResolvedValue({ query }),
    } as never,
    {
      find: jest
        .fn()
        .mockResolvedValue([
          { ...account, id: account.bindingId, workspaceId },
        ]),
    } as never,
    {
      find: jest.fn().mockResolvedValue(
        [
          ['2d357469-831a-4629-ad4b-47335900e883', 'account-metadata'],
          ['85762d24-541b-407f-9d6a-cdf89552c665', 'draft-metadata'],
          ['36817464-855f-42db-9fbb-f8853643f8d6', 'conversation-metadata'],
          ['5ca82f72-9778-4ae1-8a8e-9b762c4ce0de', 'creator-metadata'],
        ].map(([universalIdentifier, id]) => ({ universalIdentifier, id })),
      ),
    } as never,
    readClient as never,
  );
  const original = buildLegacyInstagramMessageActionAuthority({
    workspaceId,
    initiatorUserWorkspaceId: userWorkspaceId,
    threadId: null,
    interactionContextType: 'MYAH_INBOX_INSTAGRAM_DRAFT',
    interactionContextId: draftId,
    draft: {
      ...authority.canonicalGraph.draft,
      kind,
      conversationRecordId: draft.conversationId,
      providerConversationId: draft.providerConversationId,
      recipientProviderId: draft.recipientProviderId,
    },
    account,
    evidenceLinks: [
      {
        objectMetadataId: 'account-metadata',
        recordId: account.workspaceInstagramAccountRecordId,
        role: 'INSTAGRAM_ACCOUNT',
      },
      {
        objectMetadataId: 'draft-metadata',
        recordId: draftId,
        role: 'INSTAGRAM_MESSAGE_DRAFT',
      },
      ...(draft.conversationId
        ? [
            {
              objectMetadataId: 'conversation-metadata',
              recordId: draft.conversationId,
              role: 'SOCIAL_CONVERSATION',
            },
          ]
        : []),
      {
        objectMetadataId: 'creator-metadata',
        recordId: draft.creatorId!,
        role: 'CREATOR',
      },
    ],
  });
  const harness = buildHarness(reader);
  harness.actionApprovalService.getApprovedBinding.mockResolvedValue(
    original.expectedActionBinding,
  );
  harness.client.sendMessage.mockImplementation(async (_input, options) => {
    await options.beforeDispatch();
    return { kind: 'ACCEPTED', value: { messageId: 'provider-message' } };
  });
  return { ...harness, reader, readClient, draft, original, query };
};

const expectNoDispatch = (
  harness: Awaited<ReturnType<typeof buildCurrentSourceHarness>>,
) => {
  expect(harness.budgetService.markProviderAttempted).not.toHaveBeenCalled();
  expect(harness.client.startChat).not.toHaveBeenCalled();
  expect(harness.client.sendMessage).not.toHaveBeenCalled();
  expect(
    harness.actionApprovalService.recordProviderAccepted,
  ).not.toHaveBeenCalled();
  expect(harness.projector.projectReceiptWithWriter).not.toHaveBeenCalled();
};

const expectPreDispatchBlocked = (
  harness: Awaited<ReturnType<typeof buildCurrentSourceHarness>>,
) => {
  expectNoDispatch(harness);
  expect(harness.budgetService.releasePreDispatch).toHaveBeenCalledTimes(1);
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
  expect(harness.budgetService.releaseStartTarget).not.toHaveBeenCalled();
};

describe('InstagramMessageSendService real current-source authority', () => {
  it.each([null, 'replacement-creator'])(
    'blocks saved REPLY with current Creator %s before receipt/budget mutation',
    async (creatorId) => {
      const harness = await buildCurrentSourceHarness();
      harness.draft.conversationCreatorId = creatorId;
      await expect(
        harness.service.executeApproved(executeInput),
      ).rejects.toThrow('REPLY draft target is stale');
      expect(harness.draft.revision).toBe(2);
      expect(
        harness.actionApprovalService.reserveExecutionForBinding,
      ).not.toHaveBeenCalled();
      expect(harness.budgetService.reserve).not.toHaveBeenCalled();
      expect(
        harness.actionApprovalService.recordProviderTerminalState,
      ).not.toHaveBeenCalled();
      expect(harness.budgetService.releasePreDispatch).not.toHaveBeenCalled();
      expect(harness.readClient.getChat).not.toHaveBeenCalled();
      expectNoDispatch(harness);
    },
  );

  it.each([null, 'replacement-creator'])(
    'keeps UNKNOWN unresolved after Creator becomes %s without provider reads or receipt/budget writes',
    async (creatorId) => {
      const harness = await buildCurrentSourceHarness();
      const receipt = {
        id: receiptId,
        state: ActionExecutionReceiptState.UNKNOWN,
        actionApprovalBinding: {
          ...harness.original.expectedActionBinding,
          id: approvalBindingId,
        },
      };
      const reconciliation = new InstagramMessageReconciliationService(
        { findOne: jest.fn().mockResolvedValue(receipt) } as never,
        {
          findOne: jest.fn().mockResolvedValue({
            providerAttemptedAt: new Date('2026-09-01T00:00:00Z'),
          }),
        } as never,
        harness.actionApprovalService as never,
        harness.reader,
        harness.readClient as never,
        harness.projector as never,
        harness.messageProjectionWriter as never,
        harness.budgetService as never,
      );
      harness.draft.conversationCreatorId = creatorId;
      await expect(
        reconciliation.reconcile({ workspaceId, receiptId }),
      ).rejects.toThrow('REPLY draft target is stale');
      expect(receipt.state).toBe(ActionExecutionReceiptState.UNKNOWN);
      expect(harness.readClient.listMessages).not.toHaveBeenCalled();
      expect(harness.readClient.getChat).not.toHaveBeenCalled();
      expect(harness.readClient.listChats).not.toHaveBeenCalled();
      expect(
        harness.actionApprovalService.recordProviderTerminalState,
      ).not.toHaveBeenCalled();
      expect(harness.budgetService.reserve).not.toHaveBeenCalled();
      expect(harness.budgetService.releasePreDispatch).not.toHaveBeenCalled();
      expect(
        harness.budgetService.releaseStartTargetForReceipt,
      ).not.toHaveBeenCalled();
      expectNoDispatch(harness);
    },
  );

  describe.each(['REPLY'] as const)('%s final readiness', (kind) => {
    describe.each(['budget', 'provider'] as const)(
      'mutation during deferred %s read',
      (phase) => {
        it.each([
          'unchanged',
          'conflicting URL',
          'same-username source fingerprint',
        ] as const)('handles %s before the dispatch marker', async (change) => {
          const harness = await buildCurrentSourceHarness(kind);
          const entered = deferred<void>();
          const resume = deferred<void>();
          if (phase === 'budget') {
            harness.budgetService.reserve.mockImplementation(async () => {
              entered.resolve();
              await resume.promise;
              return { status: 'RESERVED', reservationId };
            });
          } else {
            harness.readClient.getChat.mockImplementation(async () => {
              entered.resolve();
              await resume.promise;
              return { chatId: 'provider-chat' };
            });
          }
          const sending = harness.service.executeApproved(executeInput);
          await entered.promise;
          expectNoDispatch(harness);
          if (change === 'conflicting URL')
            harness.draft.creatorInstagramUrl =
              'https://instagram.com/other.creator/';
          if (change === 'same-username source fingerprint')
            harness.draft.creatorInstagramUrl =
              'https://instagram.com/creator.name/';
          resume.resolve();

          await expect(sending).resolves.toEqual({
            status: change === 'unchanged' ? 'SENT' : 'BLOCKED',
            receiptId,
          });
          const providerRead = harness.readClient.getChat;
          expect(providerRead).toHaveBeenCalledTimes(1);
          expect(harness.draft.revision).toBe(2);
          if (change !== 'unchanged') {
            expectPreDispatchBlocked(harness);
            return;
          }
          const providerWrite = harness.client.sendMessage;
          expect(providerWrite).toHaveBeenCalledTimes(1);
          expect(
            harness.budgetService.markProviderAttempted,
          ).toHaveBeenCalledTimes(1);
          expect(
            harness.budgetService.releasePreDispatch,
          ).not.toHaveBeenCalled();
          const localReadOrder = harness.query.mock.invocationCallOrder;
          const finalLocalRead = localReadOrder[localReadOrder.length - 1];
          expect(providerRead.mock.invocationCallOrder[0]).toBeLessThan(
            finalLocalRead,
          );
          expect(finalLocalRead).toBeLessThan(
            harness.budgetService.markProviderAttempted.mock
              .invocationCallOrder[0],
          );
        });
      },
    );
  });
});

describe('InstagramMessageSendService final readiness safety boundaries', () => {
  it.each([null, 'replacement-creator'])(
    'blocks Creator relink to %s completed during provider verification',
    async (creatorId) => {
      const harness = await buildCurrentSourceHarness();
      harness.readClient.getChat.mockImplementation(async () => {
        harness.draft.conversationCreatorId = creatorId;
        return { chatId: 'provider-chat' };
      });
      await expect(
        harness.service.executeApproved(executeInput),
      ).resolves.toEqual({ status: 'BLOCKED', receiptId });
      expect(harness.readClient.getChat).toHaveBeenCalledWith({
        accountId: 'provider-account',
        chatId: 'provider-chat',
        expectedAttendeeId: 'recipient-igsid',
      });
      expectPreDispatchBlocked(harness);
    },
  );

  it.each(['REPLY'] as const)(
    'preserves %s provider-read rejection despite unchanged local authority',
    async (kind) => {
      const harness = await buildCurrentSourceHarness(kind);
      harness.readClient.getChat.mockRejectedValue(
        new Error('Exact provider attendee mismatch'),
      );
      await expect(
        harness.service.executeApproved(executeInput),
      ).resolves.toEqual({ status: 'BLOCKED', receiptId });
      expectPreDispatchBlocked(harness);
    },
  );

  it('does not treat a Creator edit after the final check/attempt marker as safe to release or resend an UNKNOWN', async () => {
    const harness = await buildCurrentSourceHarness();
    harness.client.sendMessage.mockImplementation(async (_input, options) => {
      await options.beforeDispatch();
      // This edit is outside the last local read's guarantee; no Creator edit lock is claimed.
      harness.draft.creatorInstagramUrl =
        'https://instagram.com/other.creator/';
      return {
        kind: 'UNKNOWN',
        status: null,
        code: 'UNIPILE_MESSAGE_SEND_UNKNOWN',
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
    expect(harness.budgetService.markProviderAttempted).toHaveBeenCalledTimes(
      1,
    );
    expect(harness.budgetService.releasePreDispatch).not.toHaveBeenCalled();
    expect(harness.budgetService.releaseStartTarget).not.toHaveBeenCalled();
    harness.actionApprovalService.findExecutionReceiptForBinding.mockResolvedValue(
      { id: receiptId, state: ActionExecutionReceiptState.UNKNOWN },
    );
    await expect(
      harness.service.executeApproved(executeInput),
    ).resolves.toEqual({ status: 'UNKNOWN', receiptId });
    expect(harness.client.sendMessage).toHaveBeenCalledTimes(1);
    expect(harness.budgetService.reserve).toHaveBeenCalledTimes(1);
    expect(
      harness.budgetService.releaseStartTargetForReceipt,
    ).not.toHaveBeenCalled();
    expect(
      harness.actionApprovalService.recordProviderAccepted,
    ).not.toHaveBeenCalled();
    expect(harness.projector.projectReceiptWithWriter).not.toHaveBeenCalled();
  });
});

const startAuthority = (identity: string) =>
  buildLegacyInstagramMessageActionAuthority({
    ...authority.expectedActionBinding,
    ...authority.canonicalGraph,
    evidenceLinks: [...authority.expectedActionBinding.evidenceLinks],
    draft: {
      ...authority.canonicalGraph.draft,
      kind: 'START_CHAT',
      conversationRecordId: null,
      providerConversationId: null,
      recipientUsername: identity,
      recipientProviderId: identity,
      recipientSourceValues: [{ field: 'instagramUsername', value: identity }],
    },
  });

const expectNoFreshStartWork = (
  harness: ReturnType<typeof buildHarness>,
  projectionAttempted = false,
) => {
  expect(harness.authorityService.createDirectAuthority).not.toHaveBeenCalled();
  expect(
    harness.authorityService.rebuildExecutionAuthority,
  ).not.toHaveBeenCalled();
  expect(
    harness.recordAccessService.assertCanExecuteDraft,
  ).not.toHaveBeenCalled();
  expect(
    harness.actionApprovalService.createApprovedInstagramMessageBinding,
  ).not.toHaveBeenCalled();
  expect(
    harness.actionApprovalService.reserveExecutionForBinding,
  ).not.toHaveBeenCalled();
  expect(
    harness.actionApprovalService.recordProviderAccepted,
  ).not.toHaveBeenCalled();
  expect(
    harness.actionApprovalService.recordProviderTerminalState,
  ).not.toHaveBeenCalled();
  expect(harness.budgetService.reserve).not.toHaveBeenCalled();
  expect(harness.budgetService.markProviderAttempted).not.toHaveBeenCalled();
  expect(harness.budgetService.releasePreDispatch).not.toHaveBeenCalled();
  expect(harness.budgetService.releaseStartTarget).not.toHaveBeenCalled();
  expect(harness.client.startChat).not.toHaveBeenCalled();
  expect(harness.client.sendMessage).not.toHaveBeenCalled();
  if (!projectionAttempted)
    expect(harness.projector.projectReceiptWithWriter).not.toHaveBeenCalled();
};

describe.each(['START_CHAT', 'REPLY'] as const)(
  'InstagramMessageSendService v3 %s receipt replay',
  (actionKind) => {
    it.each([
      'PROCESSING',
      'PROVIDER_ACCEPTED',
      'UNKNOWN',
      'SENT',
      'BLOCKED',
    ] as const)(
      'preserves stored %s across repeated public execution',
      async (state) => {
        const h = buildHarness();
        h.actionApprovalService.getApprovedBinding.mockResolvedValue({
          ...authority.expectedActionBinding,
          actionVersion: 3,
          actionKind,
        });
        if (state === 'PROVIDER_ACCEPTED')
          h.projector.projectReceiptWithWriter.mockRejectedValue(
            new Error('projection unavailable'),
          );
        const stored = { id: receiptId, state };
        h.actionApprovalService.findExecutionReceiptForBinding.mockResolvedValue(
          stored,
        );
        for (let repeat = 0; repeat < 3; repeat++) {
          const result = h.service.executeApproved(executeInput);
          if (state === 'PROCESSING')
            await expect(result).rejects.toThrow(
              'Instagram message execution is pending',
            );
          else
            await expect(result).resolves.toEqual({ status: state, receiptId });
          expect(stored).toEqual({ id: receiptId, state });
          expectNoFreshStartWork(h, state === 'PROVIDER_ACCEPTED');
          if (state === 'PROVIDER_ACCEPTED')
            expect(h.projector.projectReceiptWithWriter).toHaveBeenCalledTimes(
              repeat + 1,
            );
          expect(
            h.authorityService.assertReadyAfterReservation,
          ).not.toHaveBeenCalled();
          expect(h.client.getChat).not.toHaveBeenCalled();
          expect(h.client.listChats).not.toHaveBeenCalled();
          if (state === 'SENT')
            expect(
              h.budgetService.releaseStartTargetForReceipt,
            ).toHaveBeenCalledWith({
              workspaceId,
              actionExecutionReceiptId: receiptId,
              reason: 'PROJECTED',
            });
          else
            expect(
              h.budgetService.releaseStartTargetForReceipt,
            ).not.toHaveBeenCalled();
        }
      },
    );
  },
);

describe.each(['creator.name', '17841400000000000', 'creator-provider-id'])(
  'InstagramMessageSendService first-contact safety for %s',
  (identity) => {
    const directInput = {
      workspaceId,
      initiatorUserWorkspaceId: userWorkspaceId,
      draftId,
      expectedRevision: 2,
      rolePermissionConfig: executeInput.rolePermissionConfig,
    };
    const buildStartHarness = () => {
      const harness = buildHarness();
      const legacyAuthority = startAuthority(identity);
      harness.authorityService.getDraftActionKind.mockResolvedValue(
        'START_CHAT',
      );
      harness.authorityService.createDirectAuthority.mockResolvedValue(
        legacyAuthority,
      );
      harness.authorityService.rebuildExecutionAuthority.mockResolvedValue(
        legacyAuthority,
      );
      harness.actionApprovalService.getApprovedBinding.mockResolvedValue(
        legacyAuthority.expectedActionBinding,
      );
      // A valid old success fixture, deliberately not a throwing/unreachable dependency.
      harness.client.startChat.mockImplementation(async (_input, options) => {
        await options.beforeDispatch();
        return {
          kind: 'ACCEPTED',
          value: { chatId: 'provider-chat', messageId: 'provider-message' },
        };
      });
      return harness;
    };

    it.each(['direct', 'approved'] as const)(
      'rejects fresh %s START before authority, approval or dispatch',
      async (entry) => {
        const harness = buildStartHarness();
        await expect(
          entry === 'direct'
            ? harness.service.sendDirect(directInput)
            : harness.service.executeApproved(executeInput),
        ).rejects.toThrow('Instagram first-contact sending is unavailable');
        expect(harness.permissionService.assertCanSend).toHaveBeenCalledWith({
          actionKind: 'START_CHAT',
          rolePermissionConfig: executeInput.rolePermissionConfig,
          workspaceId,
        });
        if (entry === 'direct') {
          expect(
            harness.authorityService.getDraftActionKind,
          ).toHaveBeenCalledWith({ workspaceId, draftId, expectedRevision: 2 });
          expect(
            harness.authorityService.getDraftActionKind.mock
              .invocationCallOrder[0],
          ).toBeLessThan(
            harness.permissionService.assertCanSend.mock.invocationCallOrder[0],
          );
        } else {
          expect(
            harness.actionApprovalService.findExecutionReceiptForBinding,
          ).toHaveBeenCalledWith({ workspaceId, approvalBindingId });
          expect(harness.draftLockService.withLock).toHaveBeenCalledTimes(1);
        }
        expectNoFreshStartWork(harness);
        expect(
          harness.budgetService.releaseStartTargetForReceipt,
        ).not.toHaveBeenCalled();
      },
    );

    it.each([
      'PROVIDER_ACCEPTED',
      'UNKNOWN',
      'PROCESSING',
      'SENT',
      'FAILED',
      'BLOCKED',
    ] as const)(
      'preserves stored %s receipt before rejecting fresh work',
      async (state) => {
        const harness = buildStartHarness();
        const stored = {
          id: receiptId,
          state,
          providerExternalMessageId: 'accepted-message',
          providerThreadExternalId: 'accepted-chat',
          acceptedAt: new Date('2026-09-01T00:00:00Z'),
        };
        const before = structuredClone(stored);
        harness.actionApprovalService.findExecutionReceiptForBinding.mockResolvedValue(
          stored,
        );
        const result = harness.service.executeApproved(executeInput);
        if (state === 'PROCESSING')
          await expect(result).rejects.toThrow(
            'Instagram message execution is pending',
          );
        else
          await expect(result).resolves.toEqual({ status: state, receiptId });
        expect(stored).toEqual(before);
        expectNoFreshStartWork(harness);
        if (state === 'SENT' || state === 'FAILED') {
          expect(
            harness.budgetService.releaseStartTargetForReceipt,
          ).toHaveBeenCalledWith({
            workspaceId,
            actionExecutionReceiptId: receiptId,
            reason: state === 'SENT' ? 'PROJECTED' : 'RESOLVED',
          });
        } else
          expect(
            harness.budgetService.releaseStartTargetForReceipt,
          ).not.toHaveBeenCalled();
      },
    );

    it.each(['direct', 'approved'] as const)(
      'retains %s permission denial ahead of first-contact unavailability',
      async (entry) => {
        const harness = buildStartHarness();
        harness.permissionService.assertCanSend.mockRejectedValue(
          new Error('permission denied'),
        );
        await expect(
          entry === 'direct'
            ? harness.service.sendDirect(directInput)
            : harness.service.executeApproved(executeInput),
        ).rejects.toThrow('permission denied');
        expectNoFreshStartWork(harness);
        expect(
          harness.actionApprovalService.findExecutionReceiptForBinding,
        ).not.toHaveBeenCalled();
      },
    );
  },
);

describe('InstagramMessageSendService preserved entrypoint validation and REPLY recovery', () => {
  it('preserves historical v2 REPLY PROCESSING finalization', async () => {
    const h = buildHarness();
    const stored = { id: receiptId, state: 'PROCESSING' };
    h.actionApprovalService.findExecutionReceiptForBinding.mockResolvedValue(
      stored,
    );
    await expect(h.service.executeApproved(executeInput)).resolves.toEqual({
      status: 'FAILED',
      receiptId,
    });
    expect(stored.state).toBe('PROCESSING');
    expectNoFreshStartWork(h);
    expect(h.budgetService.releaseStartTargetForReceipt).toHaveBeenCalledWith({
      workspaceId,
      actionExecutionReceiptId: receiptId,
      reason: 'RESOLVED',
    });
  });

  it('retains kind/revision rejection before permission checks', async () => {
    const harness = buildHarness();
    harness.authorityService.getDraftActionKind.mockRejectedValue(
      new Error('Instagram message draft revision changed'),
    );
    await expect(
      harness.service.sendDirect({
        ...executeInput,
        draftId,
        expectedRevision: 1,
      }),
    ).rejects.toThrow('draft revision changed');
    expect(harness.permissionService.assertCanSend).not.toHaveBeenCalled();
    expectNoFreshStartWork(harness);
  });

  it.each([
    'workspaceId',
    'initiatorUserWorkspaceId',
    'interactionContextId',
  ] as const)(
    'passes %s to binding authorization and stops on denial',
    async (field) => {
      const harness = buildHarness();
      harness.actionApprovalService.getApprovedBinding.mockRejectedValue(
        new Error('Action approval binding is unavailable'),
      );
      const input = { ...executeInput, [field]: 'wrong-context' };
      await expect(harness.service.executeApproved(input)).rejects.toThrow(
        'Action approval binding is unavailable',
      );
      expect(
        harness.actionApprovalService.getApprovedBinding,
      ).toHaveBeenCalledWith({
        workspaceId: input.workspaceId,
        approvalBindingId,
        initiatorUserWorkspaceId: input.initiatorUserWorkspaceId,
        threadId: null,
        interactionContextType: input.interactionContextType,
        interactionContextId: input.interactionContextId,
      });
      expect(harness.permissionService.assertCanSend).not.toHaveBeenCalled();
      expectNoFreshStartWork(harness);
    },
  );

  it('keeps REPLY Accepted recovery receipt-first even when current authority is unavailable', async () => {
    const harness = buildHarness();
    harness.actionApprovalService.findExecutionReceiptForBinding.mockResolvedValue(
      { id: receiptId, state: 'PROVIDER_ACCEPTED' },
    );
    harness.authorityService.rebuildExecutionAuthority.mockRejectedValue(
      new Error('current authority unavailable'),
    );
    await expect(
      harness.service.executeApproved(executeInput),
    ).resolves.toEqual({ status: 'SENT', receiptId });
    expect(harness.projector.projectReceiptWithWriter).toHaveBeenCalledWith(
      receiptId,
      harness.messageProjectionWriter,
    );
    expect(
      harness.authorityService.rebuildExecutionAuthority,
    ).not.toHaveBeenCalled();
    expect(
      harness.recordAccessService.assertCanExecuteDraft,
    ).not.toHaveBeenCalled();
    expect(harness.budgetService.reserve).not.toHaveBeenCalled();
    expect(harness.client.sendMessage).not.toHaveBeenCalled();
  });

  it('blocks saved FIRST_MESSAGE using the real current-source reader before reconstruction or reads', async () => {
    const harness = await buildCurrentSourceHarness('START_CHAT');
    harness.query.mockClear();
    await expect(harness.service.executeApproved(executeInput)).rejects.toThrow(
      'Instagram first-contact sending is unavailable',
    );
    expect(harness.query).not.toHaveBeenCalled();
    expect(harness.readClient.listChats).not.toHaveBeenCalled();
    expect(harness.readClient.getChat).not.toHaveBeenCalled();
    expect(harness.budgetService.reserve).not.toHaveBeenCalled();
    expectNoDispatch(harness);
  });
});

describe('InstagramMessageSendService durable v3 acceptance replay', () => {
  it.each(['START_CHAT', 'REPLY'] as const)(
    'recovers %s through real binding reads, client, writer and projector without dispatch or fresh authority',
    async (kind) => {
      const h = createV3RecoveryFixture(kind);
      const approval = new ActionApprovalService(
        {
          getRepository: () => h.receiptRepository,
          transaction: async (callback: (manager: unknown) => unknown) =>
            callback({
              findOne: async () => ({ ...h.binding, state: 'CONSUMED' }),
              find: async () => [],
            }),
        } as never,
        h.projector,
      );
      const permission = { assertCanSend: jest.fn() };
      const budget = { releaseStartTargetForReceipt: jest.fn() };
      const fresh = jest.spyOn(h.reader, 'rebuildExecutionAuthority');
      const send = new InstagramMessageSendService(
        approval,
        h.reader,
        {
          withLock: async (_input: unknown, callback: () => unknown) =>
            callback(),
        } as never,
        budget as never,
        h.client,
        h.projector,
        h.writer,
        permission as never,
        h.access,
      );
      // Simulate the workspace projection commit followed by loss before receipt SENT.
      await expect(
        h.projector.projectReceipt(h.receipt.id, {
          afterWorkspaceProjection: async () => {
            throw new Error('postcommit response lost');
          },
        }),
      ).rejects.toThrow('postcommit response lost');
      expect(h.receipt.state).toBe('PROVIDER_ACCEPTED');
      const input = {
        workspaceId: h.workspaceId,
        initiatorUserWorkspaceId: h.binding.initiatorUserWorkspaceId,
        approvalBindingId: h.binding.id,
        threadId: null,
        interactionContextType: 'MYAH_INSTAGRAM_MESSAGE_DRAFT' as const,
        interactionContextId: h.binding.draftId,
        rolePermissionConfig: { unionOf: ['recovery-role'] },
      };
      for (let replay = 0; replay < 3; replay += 1) {
        await expect(send.executeApproved(input)).resolves.toEqual({
          status: 'SENT',
          receiptId: h.receipt.id,
        });
      }
      expect(h.rows.myahSocialConversation).toHaveLength(1);
      expect(h.rows.myahSocialMessage).toHaveLength(1);
      expect(fresh).not.toHaveBeenCalled();
      expect(
        h.fetch.mock.calls.every(
          ([url, init]) => init.method === 'GET' && !url.includes('/users'),
        ),
      ).toBe(true);
      expect(budget.releaseStartTargetForReceipt).toHaveBeenCalled();
    },
  );
});
