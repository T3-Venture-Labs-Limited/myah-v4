import {
  MyahInboxReplyUnavailableCode,
  MyahInboxReplyUnavailableError,
} from 'src/engine/core-modules/action-approval/definitions/myah-inbox-reply-action.definition';
import { ActionExecutionReceiptState } from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';
import {
  MyahInboxReplySendOutcome,
  MyahInboxReplySendReadinessStatus,
} from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-reply-send.dto';
import { type AuthContextUser } from 'src/engine/core-modules/auth/types/auth-context.type';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { WorkspaceMemberWorkspaceEntity } from 'src/modules/workspace-member/standard-objects/workspace-member.workspace-entity';
import {
  MyahInboxReplySendService,
  type MyahInboxReplySendRequest,
} from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-send.service';

const workspaceId = '20202020-1c25-4d02-bf25-6aeccf7ea419';
const userWorkspaceId = '20202020-1234-4678-9012-345678901234';
const userId = '20202020-1234-4678-9012-345678901235';
const workspaceMemberId = '20202020-0b5c-4178-bed7-d371f6411eaa';
const threadId = '20202020-0b5c-4178-bed7-d371f6411ea1';
const receiptId = '20202020-0b5c-4178-bed7-d371f6411ea2';
const approvalBindingId = '20202020-0b5c-4178-bed7-d371f6411ea3';
const workspace = new WorkspaceEntity();
workspace.id = workspaceId;
const authWorkspace = {
  ...workspace,
  createdAt: '2026-08-31T00:00:00.000Z',
  updatedAt: '2026-08-31T00:00:00.000Z',
  deletedAt: undefined,
  suspendedAt: null,
};
const user: AuthContextUser = {
  id: userId,
  firstName: 'Test',
  lastName: 'User',
  email: 'test@example.com',
  isEmailVerified: true,
  disabled: false,
  canImpersonate: false,
  canAccessFullAdminPanel: false,
  createdAt: '2026-08-31T00:00:00.000Z',
  updatedAt: '2026-08-31T00:00:00.000Z',
  deletedAt: '2026-08-31T00:00:00.000Z',
  locale: 'en',
};
const workspaceMember = new WorkspaceMemberWorkspaceEntity();
workspaceMember.id = workspaceMemberId;
const authContext = {
  type: 'user' as const,
  workspace: authWorkspace,
  userWorkspaceId,
  user,
  workspaceMemberId,
  workspaceMember,
};
const expectedActionBinding = {
  workspaceId,
  initiatorUserWorkspaceId: userWorkspaceId,
  actionName: 'send_inbox_reply' as const,
  actionVersion: 1 as const,
  draftId: threadId,
  threadId,
  contentDigest: 'content-digest',
  recipientFingerprint: 'recipient-fingerprint',
  sendingAccountFingerprint: 'account-fingerprint',
  actionContextFingerprint: 'context-fingerprint',
  evidenceLinks: [
    { objectMetadataId: 'thread-metadata-id', recordId: threadId, role: 'draft' },
  ],
};
const authority = {
  expectedActionBinding,
  canonicalGraph: {
    messageThreadId: threadId,
    draftRevision: 4,
    draftBody: { markdown: 'Thanks for the update', blocknote: null },
    connectedAccountId: 'connected-account-id',
    messageChannelId: 'message-channel-id',
    senderEmail: 'sender@example.com',
    senderDisplayName: null,
    recipientEmail: 'creator@example.com',
    recipientLabel: 'Creator',
    subject: 'Re: Partnership',
    inReplyTo: '<incoming@example.com>',
    parentMessageId: 'parent-message-id',
    providerMessageExternalId: 'provider-message-id',
    providerThreadExternalId: 'provider-thread-id',
    managedMailboxId: null,
    connectedAccount: { id: 'connected-account-id' },
  },
};

const receipt = (state: ActionExecutionReceiptState) => ({
  id: receiptId,
  workspaceId,
  state,
  providerCode: state === ActionExecutionReceiptState.SENT ? 'accepted' : null,
  outcome: state === ActionExecutionReceiptState.SENT ? 'accepted' : null,
  occurredAt: new Date('2026-08-31T00:00:00.000Z'),
});

const request = (): MyahInboxReplySendRequest => ({
  threadId,
  expectedDraftRevision: 4,
  authContext,
  user: authContext.user,
  workspace,
  userWorkspaceId,
  workspaceMemberId,
});

const draftSnapshot = {
  revision: 4,
  body: authority.canonicalGraph.draftBody,
  messageThreadMetadataId: 'thread-metadata-id',
};

const createService = (overrides?: {
  executeInboxReplyLocked?: jest.Mock;
  buildAuthority?: jest.Mock;
  rebuildExecutionAuthority?: jest.Mock;
  getReadableDraftSnapshot?: jest.Mock;
  reserveExecutionForBinding?: jest.Mock;
  findExecutionReceipt?: jest.Mock;
  findInboxReplyExecutionReceipt?: jest.Mock;
  getInboxReplyDraftExecutionState?: jest.Mock;
  sendMessage?: jest.Mock;
  recordProviderAccepted?: jest.Mock;
  recordProviderTerminalState?: jest.Mock;
  projectReceipt?: jest.Mock;
  saveMyahInboxDraftAfterProviderFailure?: jest.Mock;
}) => {
  const createApprovedInboxReplyBinding = jest
    .fn()
    .mockResolvedValue({ id: approvalBindingId });
  const invalidateApprovedInboxReplyBinding = jest.fn().mockResolvedValue(undefined);
  const executeInboxReplyLocked =
    overrides?.executeInboxReplyLocked ??
    jest.fn(
      async (
        _input: unknown,
        operation: (manager: object) => Promise<unknown>,
      ) => operation({}),
    );
  const buildAuthority = overrides?.buildAuthority ?? jest.fn().mockResolvedValue(authority);
  const rebuildExecutionAuthority =
    overrides?.rebuildExecutionAuthority ?? jest.fn().mockResolvedValue(authority);
  const reserveExecutionForBinding =
    overrides?.reserveExecutionForBinding ??
    jest.fn().mockResolvedValue({
      created: true,
      receipt: receipt(ActionExecutionReceiptState.PROCESSING),
    });
  const findExecutionReceipt =
    overrides?.findExecutionReceipt ??
    jest.fn().mockResolvedValue(receipt(ActionExecutionReceiptState.SENT));
  const getInboxReplyDraftExecutionState =
    overrides?.getInboxReplyDraftExecutionState ??
    jest.fn().mockResolvedValue(null);
  const getReadableDraftSnapshot =
    overrides?.getReadableDraftSnapshot ??
    jest.fn().mockResolvedValue(draftSnapshot);
  const sendMessage =
    overrides?.sendMessage ??
    jest.fn().mockResolvedValue({
      headerMessageId: '<sent@example.com>',
      messageExternalId: 'sent-message-id',
      threadExternalId: 'provider-thread-id',
    });
  const recordProviderAccepted =
    overrides?.recordProviderAccepted ?? jest.fn().mockResolvedValue(receipt(ActionExecutionReceiptState.PROVIDER_ACCEPTED));
  const recordProviderTerminalState =
    overrides?.recordProviderTerminalState ??
    jest.fn().mockImplementation(({ state }) => Promise.resolve(receipt(state)));
  const findInboxReplyExecutionReceipt =
    overrides?.findInboxReplyExecutionReceipt ??
    jest.fn().mockResolvedValue(receipt(ActionExecutionReceiptState.SENT));
  const projectReceipt = overrides?.projectReceipt ?? jest.fn().mockResolvedValue({ projected: true });
  const saveMyahInboxDraftAfterProviderFailure =
    overrides?.saveMyahInboxDraftAfterProviderFailure ??
    jest.fn().mockResolvedValue({
      status: 'SAVED',
      revision: 5,
      body: authority.canonicalGraph.draftBody,
    });

  return {
    service: new MyahInboxReplySendService(
      {
        executeInboxReplyLocked,
        createApprovedInboxReplyBinding,
        invalidateApprovedInboxReplyBinding,
        reserveExecutionForBinding,
        findExecutionReceipt,
        findInboxReplyExecutionReceipt,
        recordProviderAccepted,
        recordProviderTerminalState,
        getInboxReplyDraftExecutionState,
      } as never,
      {
        buildAuthority,
        rebuildExecutionAuthority,
        getReadableDraftSnapshot,
      } as never,
      { sendMessage } as never,
      { projectReceipt } as never,
      { saveMyahInboxDraftAfterProviderFailure } as never,
    ),
    executeInboxReplyLocked,
    createApprovedInboxReplyBinding,
    invalidateApprovedInboxReplyBinding,
    buildAuthority,
    rebuildExecutionAuthority,
    getReadableDraftSnapshot,
    reserveExecutionForBinding,
    findExecutionReceipt,
    findInboxReplyExecutionReceipt,
    sendMessage,
    getInboxReplyDraftExecutionState,
    recordProviderAccepted,
    recordProviderTerminalState,
    projectReceipt,
    saveMyahInboxDraftAfterProviderFailure,
  };
};

describe('MyahInboxReplySendService', () => {
  it('proves authority, reserves before one provider send, records acceptance, and projects', async () => {
    const setup = createService();

    const result = await setup.service.send(request());

    expect(setup.createApprovedInboxReplyBinding).toHaveBeenCalledWith(
      authority.expectedActionBinding,
    );
    expect(setup.executeInboxReplyLocked).toHaveBeenCalledWith(
      { workspaceId, draftId: threadId },
      expect.any(Function),
    );
    expect(setup.reserveExecutionForBinding).toHaveBeenCalledWith({
      approvalBindingId,
      expectedActionBinding: authority.expectedActionBinding,
    });
    expect(setup.sendMessage).toHaveBeenCalledTimes(1);
    expect(setup.sendMessage).toHaveBeenCalledWith(
      {
        to: ['creator@example.com'],
        subject: 'Re: Partnership',
        body: 'Thanks for the update',
        html: 'Thanks for the update',
        attachments: [],
        inReplyTo: '<incoming@example.com>',
        threadExternalId: 'provider-thread-id',
      },
      authority.canonicalGraph.connectedAccount,
    );
    expect(setup.recordProviderAccepted).toHaveBeenCalledWith(receiptId, {
      code: 'accepted',
      acceptedAt: expect.any(Date),
      providerMessageId: '<sent@example.com>',
      providerExternalMessageId: 'sent-message-id',
      providerThreadExternalId: 'provider-thread-id',
    });
    expect(setup.projectReceipt).toHaveBeenCalledWith(receiptId);
    expect(result).toEqual({
      outcome: MyahInboxReplySendOutcome.SENT,
      receiptId,
      revision: 4,
      body: authority.canonicalGraph.draftBody,
    });
  });

  it('returns the post-projection permission-scoped snapshot after a sent receipt clears the draft', async () => {
    const clearedSnapshot = {
      revision: 5,
      body: null,
      messageThreadMetadataId: 'thread-metadata-id',
    };
    const setup = createService({
      getReadableDraftSnapshot: jest.fn().mockResolvedValue(clearedSnapshot),
      findInboxReplyExecutionReceipt: jest
        .fn()
        .mockResolvedValue(receipt(ActionExecutionReceiptState.SENT)),
    });

    await expect(setup.service.send(request())).resolves.toEqual({
      outcome: MyahInboxReplySendOutcome.SENT,
      receiptId,
      revision: 5,
      body: null,
    });
    expect(setup.getReadableDraftSnapshot).toHaveBeenCalledWith({
      workspaceId,
      initiatorUserWorkspaceId: userWorkspaceId,
      messageThreadId: threadId,
    });
    expect(setup.findInboxReplyExecutionReceipt).toHaveBeenCalledWith({
      workspaceId,
      receiptId,
      draftId: threadId,
      initiatorUserWorkspaceId: userWorkspaceId,
      messageThreadMetadataId: 'thread-metadata-id',
    });
  });

  it('does not issue a second provider send for a duplicate logical receipt', async () => {
    const setup = createService({
      reserveExecutionForBinding: jest.fn().mockResolvedValue({
        created: false,
        receipt: receipt(ActionExecutionReceiptState.SENT),
      }),
    });

    await expect(setup.service.send(request())).resolves.toMatchObject({
      outcome: MyahInboxReplySendOutcome.SENT,
      receiptId,
    });
    expect(setup.sendMessage).not.toHaveBeenCalled();
    expect(setup.invalidateApprovedInboxReplyBinding).not.toHaveBeenCalled();
  });

  it('returns a safe stale outcome before creating a binding for an old draft revision', async () => {
    const setup = createService({
      buildAuthority: jest.fn().mockRejectedValue(
        new MyahInboxReplyUnavailableError(
          MyahInboxReplyUnavailableCode.THREAD_UNAVAILABLE,
        ),
      ),
    });

    await expect(setup.service.send(request())).resolves.toEqual({
      outcome: MyahInboxReplySendOutcome.STALE,
      receiptId: null,
      revision: 4,
      body: null,
    });
    expect(setup.createApprovedInboxReplyBinding).not.toHaveBeenCalled();
    expect(setup.sendMessage).not.toHaveBeenCalled();
  });

  it('invalidates only its receipt-free binding when authority changes after binding creation', async () => {
    const setup = createService({
      rebuildExecutionAuthority: jest.fn().mockRejectedValue(
        new MyahInboxReplyUnavailableError(
          MyahInboxReplyUnavailableCode.SENDER_UNAVAILABLE,
        ),
      ),
    });

    await expect(setup.service.send(request())).resolves.toMatchObject({
      outcome: MyahInboxReplySendOutcome.STALE,
      receiptId: null,
    });
    expect(setup.invalidateApprovedInboxReplyBinding).toHaveBeenCalledWith({
      workspaceId,
      approvalBindingId,
      initiatorUserWorkspaceId: userWorkspaceId,
      threadId,
      draftId: threadId,
    });
    expect(setup.reserveExecutionForBinding).not.toHaveBeenCalled();
  });

  it('records a definitive rejection, preserves the body, and advances its revision once', async () => {
    const setup = createService({
      sendMessage: jest.fn().mockRejectedValue({ responseCode: 550 }),
    });

    await expect(setup.service.send(request())).resolves.toEqual({
      outcome: MyahInboxReplySendOutcome.FAILED,
      receiptId,
      revision: 5,
      body: authority.canonicalGraph.draftBody,
    });
    expect(setup.recordProviderTerminalState).toHaveBeenCalledWith({
      receiptId,
      state: ActionExecutionReceiptState.FAILED,
      code: 'failed',
    });
    expect(setup.saveMyahInboxDraftAfterProviderFailure).toHaveBeenCalledWith({
      ...request(),
      expectedRevision: 4,
      body: authority.canonicalGraph.draftBody,
    });
    expect(
      setup.saveMyahInboxDraftAfterProviderFailure.mock.invocationCallOrder[0],
    ).toBeLessThan(
      setup.recordProviderTerminalState.mock.invocationCallOrder[0],
    );
    expect(setup.sendMessage).toHaveBeenCalledTimes(1);
    expect(setup.recordProviderAccepted).not.toHaveBeenCalled();
  });

  it('locks an ambiguous provider outcome without mutating the draft or retrying', async () => {
    const setup = createService({
      sendMessage: jest.fn().mockRejectedValue(new Error('socket reset')),
    });

    await expect(setup.service.send(request())).resolves.toEqual({
      outcome: MyahInboxReplySendOutcome.UNKNOWN,
      receiptId,
      revision: 4,
      body: authority.canonicalGraph.draftBody,
    });
    expect(setup.recordProviderTerminalState).toHaveBeenCalledWith({
      receiptId,
      state: ActionExecutionReceiptState.UNKNOWN,
      code: 'unknown',
    });
    expect(setup.saveMyahInboxDraftAfterProviderFailure).not.toHaveBeenCalled();
    expect(setup.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('treats an accepted provider result that cannot be recorded as unknown without a second send', async () => {
    const setup = createService({
      recordProviderAccepted: jest
        .fn()
        .mockRejectedValue(new Error('receipt store unavailable')),
    });

    await expect(setup.service.send(request())).resolves.toMatchObject({
      outcome: MyahInboxReplySendOutcome.UNKNOWN,
      receiptId,
    });
    expect(setup.recordProviderTerminalState).toHaveBeenCalledWith({
      receiptId,
      state: ActionExecutionReceiptState.UNKNOWN,
      code: 'unknown',
    });
    expect(setup.projectReceipt).not.toHaveBeenCalled();
    expect(setup.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('leaves a provider-accepted projection failure pending for provider-free reconciliation', async () => {
    const setup = createService({
      projectReceipt: jest.fn().mockRejectedValue(new Error('projection failed')),
      findInboxReplyExecutionReceipt: jest
        .fn()
        .mockResolvedValue(receipt(ActionExecutionReceiptState.PROVIDER_ACCEPTED)),
    });

    await expect(setup.service.send(request())).resolves.toEqual({
      outcome: MyahInboxReplySendOutcome.SENDING,
      receiptId,
      revision: 4,
      body: authority.canonicalGraph.draftBody,
    });
    expect(setup.recordProviderTerminalState).not.toHaveBeenCalled();
    expect(setup.saveMyahInboxDraftAfterProviderFailure).not.toHaveBeenCalled();
    expect(setup.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('reads status only for the authenticated workspace, actor, receipt evidence, and current thread', async () => {
    const setup = createService({
      findInboxReplyExecutionReceipt: jest
        .fn()
        .mockResolvedValue(receipt(ActionExecutionReceiptState.UNKNOWN)),
    });

    await expect(
      setup.service.getStatus({
        ...request(),
        receiptId,
      }),
    ).resolves.toEqual({
      outcome: MyahInboxReplySendOutcome.UNKNOWN,
      receiptId,
      revision: draftSnapshot.revision,
      body: draftSnapshot.body,
    });
    expect(setup.findInboxReplyExecutionReceipt).toHaveBeenCalledWith({
      workspaceId,
      receiptId,
      draftId: threadId,
      initiatorUserWorkspaceId: userWorkspaceId,
      messageThreadMetadataId: draftSnapshot.messageThreadMetadataId,
    });
    expect(setup.buildAuthority).not.toHaveBeenCalled();
  });

  it('does not expose the current draft for a foreign receipt', async () => {
    const setup = createService({
      findInboxReplyExecutionReceipt: jest.fn().mockResolvedValue(null),
    });

    await expect(
      setup.service.getStatus({
        ...request(),
        receiptId,
      }),
    ).resolves.toEqual({
      outcome: MyahInboxReplySendOutcome.STALE,
      receiptId: null,
      revision: 0,
      body: null,
    });
  });

  it.each([
    ['deleted', new Error('thread unavailable')],
    ['unreadable', new Error('thread hidden')],
  ])('does not expose a receipt when the status thread is %s', async (_case, error) => {
    const setup = createService({
      getReadableDraftSnapshot: jest.fn().mockRejectedValue(error),
    });

    await expect(
      setup.service.getStatus({
        ...request(),
        receiptId,
      }),
    ).resolves.toEqual({
      outcome: MyahInboxReplySendOutcome.STALE,
      receiptId: null,
      revision: 0,
      body: null,
    });
    expect(setup.findInboxReplyExecutionReceipt).not.toHaveBeenCalled();
  });

  it.each([
    [ActionExecutionReceiptState.FAILED, MyahInboxReplySendOutcome.FAILED],
    [ActionExecutionReceiptState.UNKNOWN, MyahInboxReplySendOutcome.UNKNOWN],
    [ActionExecutionReceiptState.SENT, MyahInboxReplySendOutcome.SENT],
  ])(
    'returns a %s receipt with the current cleared draft after delivery readiness changes',
    async (state, outcome) => {
      const setup = createService({
        getReadableDraftSnapshot: jest.fn().mockResolvedValue({
          ...draftSnapshot,
          revision: 5,
          body: null,
        }),
        buildAuthority: jest.fn().mockRejectedValue(
          new MyahInboxReplyUnavailableError(
            MyahInboxReplyUnavailableCode.RECONNECT_REQUIRED,
          ),
        ),
        findInboxReplyExecutionReceipt: jest
          .fn()
          .mockResolvedValue(receipt(state)),
      });

      await expect(
        setup.service.getStatus({
          ...request(),
          receiptId,
        }),
      ).resolves.toEqual({
        outcome,
        receiptId,
        revision: 5,
        body: null,
      });
      expect(setup.buildAuthority).not.toHaveBeenCalled();
    },
  );

  it('maps only known authority failures to safe readiness without exposing raw errors', async () => {
    const setup = createService({
      buildAuthority: jest.fn().mockRejectedValue(
        new MyahInboxReplyUnavailableError(
          MyahInboxReplyUnavailableCode.RECONNECT_REQUIRED,
        ),
      ),
    });

    await expect(
      setup.service.getReadiness({
        ...request(),
      }),
    ).resolves.toEqual({
      status: MyahInboxReplySendReadinessStatus.RECONNECT_REQUIRED,
      reason: 'Reconnect the sending mailbox before sending this reply.',
    });
  });

  it.each([
    ['PENDING', MyahInboxReplySendReadinessStatus.OUTCOME_PENDING],
    ['UNKNOWN', MyahInboxReplySendReadinessStatus.OUTCOME_UNKNOWN],
  ])('reports the current draft %s execution state', async (state, status) => {
    const setup = createService({
      getInboxReplyDraftExecutionState: jest.fn().mockResolvedValue(state),
    });

    await expect(setup.service.getReadiness(request())).resolves.toMatchObject({
      status,
    });
    expect(setup.getInboxReplyDraftExecutionState).toHaveBeenCalledWith({
      workspaceId,
      initiatorUserWorkspaceId: userWorkspaceId,
      draftId: threadId,
    });
  });


  it.each([
    ['PENDING', MyahInboxReplySendReadinessStatus.OUTCOME_PENDING],
    ['UNKNOWN', MyahInboxReplySendReadinessStatus.OUTCOME_UNKNOWN],
  ])('reports existing %s before mutable readiness failures', async (state, status) => {
    const setup = createService({
      buildAuthority: jest.fn().mockRejectedValue(
        new MyahInboxReplyUnavailableError(
          MyahInboxReplyUnavailableCode.RECONNECT_REQUIRED,
        ),
      ),
      getInboxReplyDraftExecutionState: jest.fn().mockResolvedValue(state),
    });

    await expect(setup.service.getReadiness(request())).resolves.toMatchObject({
      status,
    });
    expect(setup.buildAuthority).not.toHaveBeenCalled();
  });
  it.each([
    ['CAS conflict', { status: 'CONFLICT', revision: 5, body: authority.canonicalGraph.draftBody }],
    ['CAS write error', new Error('write failed')],
  ])('keeps the receipt locked as UNKNOWN after a failed-draft %s', async (_case, result) => {
    const setup = createService({
      sendMessage: jest.fn().mockRejectedValue({ responseCode: 550 }),
      saveMyahInboxDraftAfterProviderFailure: jest.fn().mockImplementation(() =>
        result instanceof Error ? Promise.reject(result) : Promise.resolve(result),
      ),
    });

    await expect(setup.service.send(request())).resolves.toMatchObject({
      outcome: MyahInboxReplySendOutcome.UNKNOWN,
      receiptId,
    });
    expect(setup.recordProviderTerminalState).toHaveBeenCalledWith({
      receiptId,
      state: ActionExecutionReceiptState.UNKNOWN,
      code: 'unknown',
    });
    expect(setup.recordProviderTerminalState).not.toHaveBeenCalledWith({
      receiptId,
      state: ActionExecutionReceiptState.FAILED,
      code: 'failed',
    });
    expect(setup.sendMessage).toHaveBeenCalledTimes(1);
  });

  it.each(['PENDING', 'UNKNOWN'])(
    'does not expose %s readiness for an unreadable thread',
    async (state) => {
      const setup = createService({
        getReadableDraftSnapshot: jest
          .fn()
          .mockRejectedValue(new Error('thread unavailable')),
        getInboxReplyDraftExecutionState: jest.fn().mockResolvedValue(state),
      });

      await expect(setup.service.getReadiness(request())).resolves.toEqual({
        status: MyahInboxReplySendReadinessStatus.THREAD_UNAVAILABLE,
        reason: 'This Inbox thread is unavailable for a reply.',
      });
      expect(setup.getInboxReplyDraftExecutionState).not.toHaveBeenCalled();
      expect(setup.buildAuthority).not.toHaveBeenCalled();
    },
  );

  it('contains invalidation failure as stale without provider I/O', async () => {
    const setup = createService({
      rebuildExecutionAuthority: jest.fn().mockRejectedValue(new Error('changed')),
    });
    setup.invalidateApprovedInboxReplyBinding.mockRejectedValueOnce(
      new Error('cleanup failed'),
    );

    await expect(setup.service.send(request())).resolves.toMatchObject({
      outcome: MyahInboxReplySendOutcome.STALE,
      receiptId: null,
    });
    expect(setup.sendMessage).not.toHaveBeenCalled();
  });
});
