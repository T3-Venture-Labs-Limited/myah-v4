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
    {
      objectMetadataId: 'thread-metadata-id',
      recordId: threadId,
      role: 'draft',
    },
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
  execute?: jest.Mock;
}) => {
  const createApprovedInboxReplyBinding = jest
    .fn()
    .mockResolvedValue({ id: approvalBindingId });
  const invalidateApprovedInboxReplyBinding = jest
    .fn()
    .mockResolvedValue(undefined);
  const executeInboxReplyLocked =
    overrides?.executeInboxReplyLocked ??
    jest.fn(
      async (
        _input: unknown,
        operation: (manager: object) => Promise<unknown>,
      ) => operation({}),
    );
  const buildAuthority =
    overrides?.buildAuthority ?? jest.fn().mockResolvedValue(authority);
  const rebuildExecutionAuthority =
    overrides?.rebuildExecutionAuthority ??
    jest.fn().mockResolvedValue(authority);
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
    overrides?.recordProviderAccepted ??
    jest
      .fn()
      .mockResolvedValue(
        receipt(ActionExecutionReceiptState.PROVIDER_ACCEPTED),
      );
  const recordProviderTerminalState =
    overrides?.recordProviderTerminalState ??
    jest
      .fn()
      .mockImplementation(({ state }) => Promise.resolve(receipt(state)));
  const findInboxReplyExecutionReceipt =
    overrides?.findInboxReplyExecutionReceipt ??
    jest.fn().mockResolvedValue(receipt(ActionExecutionReceiptState.SENT));
  const projectReceipt =
    overrides?.projectReceipt ??
    jest.fn().mockResolvedValue({ projected: true });
  const saveMyahInboxDraftAfterProviderFailure =
    overrides?.saveMyahInboxDraftAfterProviderFailure ??
    jest.fn().mockResolvedValue({
      status: 'SAVED',
      revision: 5,
      body: authority.canonicalGraph.draftBody,
    });
  const execute =
    overrides?.execute ??
    jest.fn().mockResolvedValue({
      receipt: receipt(ActionExecutionReceiptState.PROVIDER_ACCEPTED),
      authority,
      draft: null,
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
      { sendMessage, execute } as never,
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
    execute,
  };
};

describe('MyahInboxReplySendService', () => {
  it('returns the receipt status after shared execution accepts the provider send', async () => {
    const setup = createService();

    await expect(setup.service.send(request())).resolves.toEqual({
      outcome: MyahInboxReplySendOutcome.SENT,
      receiptId,
      revision: 4,
      body: authority.canonicalGraph.draftBody,
    });
    expect(setup.createApprovedInboxReplyBinding).toHaveBeenCalledWith(
      authority.expectedActionBinding,
    );
    expect(setup.executeInboxReplyLocked).toHaveBeenCalledWith(
      { workspaceId, draftId: threadId },
      expect.any(Function),
    );
  });

  it('creates the explicit-click binding then delegates approved execution', async () => {
    const setup = createService();

    await setup.service.send(request());

    expect(setup.execute).toHaveBeenCalledWith({
      approvalBindingId,
      binding: authority.expectedActionBinding,
      workspaceId,
    });
  });

  it('does not issue provider I/O itself for an approved alias execution', async () => {
    const aliasAuthority = {
      ...authority,
      canonicalGraph: {
        ...authority.canonicalGraph,
        senderEmail: 'brand-alias@example.com',
        connectedAccount: {
          id: 'connected-account-id',
          handle: 'brand-alias@example.com',
          provider: 'google',
          accessToken: 'provider-token',
        },
      },
    };
    const setup = createService({
      buildAuthority: jest.fn().mockResolvedValue(aliasAuthority),
      execute: jest.fn().mockResolvedValue({
        receipt: receipt(ActionExecutionReceiptState.SENT),
        authority: aliasAuthority,
        draft: null,
      }),
    });

    await setup.service.send(request());

    expect(setup.execute).toHaveBeenCalledTimes(1);
    expect(setup.sendMessage).not.toHaveBeenCalled();
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
      execute: jest.fn().mockResolvedValue({
        receipt: receipt(ActionExecutionReceiptState.SENT),
        authority,
        draft: null,
      }),
    });

    await expect(setup.service.send(request())).resolves.toMatchObject({
      outcome: MyahInboxReplySendOutcome.SENT,
      receiptId,
    });
    expect(setup.execute).toHaveBeenCalledTimes(1);
    expect(setup.sendMessage).not.toHaveBeenCalled();
    expect(setup.invalidateApprovedInboxReplyBinding).not.toHaveBeenCalled();
  });

  it('returns a safe stale outcome before creating a binding for an old draft revision', async () => {
    const setup = createService({
      buildAuthority: jest
        .fn()
        .mockRejectedValue(
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

  it('invalidates only its receipt-free binding when shared execution finds authority drift', async () => {
    const setup = createService({
      execute: jest.fn().mockRejectedValue(new Error('source graph drifted')),
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
  });

  it('returns the definitive failure result from shared execution unchanged', async () => {
    const draft = {
      status: 'SAVED',
      revision: 5,
      body: authority.canonicalGraph.draftBody,
    };
    const setup = createService({
      execute: jest.fn().mockResolvedValue({
        receipt: receipt(ActionExecutionReceiptState.FAILED),
        authority,
        draft,
      }),
    });

    await expect(setup.service.send(request())).resolves.toEqual({
      outcome: MyahInboxReplySendOutcome.FAILED,
      receiptId,
      revision: 5,
      body: authority.canonicalGraph.draftBody,
    });
    expect(setup.execute).toHaveBeenCalledTimes(1);
  });

  it('returns an unknown provider outcome from shared execution unchanged', async () => {
    const setup = createService({
      execute: jest.fn().mockResolvedValue({
        receipt: receipt(ActionExecutionReceiptState.UNKNOWN),
        authority,
        draft: null,
      }),
    });

    await expect(setup.service.send(request())).resolves.toEqual({
      outcome: MyahInboxReplySendOutcome.UNKNOWN,
      receiptId,
      revision: 4,
      body: authority.canonicalGraph.draftBody,
    });
    expect(setup.execute).toHaveBeenCalledTimes(1);
  });

  it('returns an unknown receipt when shared execution cannot record acceptance', async () => {
    const setup = createService({
      execute: jest.fn().mockResolvedValue({
        receipt: receipt(ActionExecutionReceiptState.UNKNOWN),
        authority,
        draft: null,
      }),
    });

    await expect(setup.service.send(request())).resolves.toMatchObject({
      outcome: MyahInboxReplySendOutcome.UNKNOWN,
      receiptId,
    });
  });

  it('leaves a provider-accepted projection failure pending for provider-free reconciliation', async () => {
    const setup = createService({
      execute: jest.fn().mockResolvedValue({
        receipt: receipt(ActionExecutionReceiptState.PROVIDER_ACCEPTED),
        authority,
        draft: null,
      }),
      findInboxReplyExecutionReceipt: jest
        .fn()
        .mockResolvedValue(
          receipt(ActionExecutionReceiptState.PROVIDER_ACCEPTED),
        ),
    });

    await expect(setup.service.send(request())).resolves.toEqual({
      outcome: MyahInboxReplySendOutcome.SENDING,
      receiptId,
      revision: 4,
      body: authority.canonicalGraph.draftBody,
    });
    expect(setup.execute).toHaveBeenCalledTimes(1);
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
  ])(
    'does not expose a receipt when the status thread is %s',
    async (_case, error) => {
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
    },
  );

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
        buildAuthority: jest
          .fn()
          .mockRejectedValue(
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

  it('returns the current draft snapshot with send readiness', async () => {
    const setup = createService();

    await expect(setup.service.getReadiness(request())).resolves.toEqual({
      status: MyahInboxReplySendReadinessStatus.READY,
      reason: null,
      revision: draftSnapshot.revision,
      body: draftSnapshot.body,
    });
  });

  it('maps only known authority failures to safe readiness without exposing raw errors', async () => {
    const setup = createService({
      buildAuthority: jest
        .fn()
        .mockRejectedValue(
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
      revision: draftSnapshot.revision,
      body: draftSnapshot.body,
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
      draftId: threadId,
    });
  });

  it.each([
    ['PENDING', MyahInboxReplySendReadinessStatus.OUTCOME_PENDING],
    ['UNKNOWN', MyahInboxReplySendReadinessStatus.OUTCOME_UNKNOWN],
  ])(
    'reports existing %s before mutable readiness failures',
    async (state, status) => {
      const setup = createService({
        buildAuthority: jest
          .fn()
          .mockRejectedValue(
            new MyahInboxReplyUnavailableError(
              MyahInboxReplyUnavailableCode.RECONNECT_REQUIRED,
            ),
          ),
        getInboxReplyDraftExecutionState: jest.fn().mockResolvedValue(state),
      });

      await expect(
        setup.service.getReadiness(request()),
      ).resolves.toMatchObject({
        status,
      });
      expect(setup.buildAuthority).not.toHaveBeenCalled();
    },
  );
  it('keeps the receipt outcome unknown when shared execution cannot preserve a rejected-provider draft', async () => {
    const setup = createService({
      execute: jest.fn().mockResolvedValue({
        receipt: receipt(ActionExecutionReceiptState.UNKNOWN),
        authority,
        draft: null,
      }),
    });

    await expect(setup.service.send(request())).resolves.toMatchObject({
      outcome: MyahInboxReplySendOutcome.UNKNOWN,
      receiptId,
    });
    expect(setup.execute).toHaveBeenCalledTimes(1);
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
        revision: 0,
        body: null,
      });
      expect(setup.getInboxReplyDraftExecutionState).not.toHaveBeenCalled();
      expect(setup.buildAuthority).not.toHaveBeenCalled();
    },
  );

  it('contains invalidation failure as stale without provider I/O', async () => {
    const setup = createService({
      execute: jest.fn().mockRejectedValue(new Error('source graph drifted')),
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
