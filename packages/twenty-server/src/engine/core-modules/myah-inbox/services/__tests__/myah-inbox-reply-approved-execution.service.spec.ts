import { ActionExecutionReceiptState } from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';
import { MyahInboxDraftSaveStatus } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-draft-save-result.dto';
import { MyahInboxReplyApprovedExecutionService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-approved-execution.service';

const workspaceId = '20202020-1c25-4d02-bf25-6aeccf7ea419';
const userWorkspaceId = '20202020-1234-4678-9012-345678901234';
const userId = '20202020-1234-4678-9012-345678901235';
const workspaceMemberId = '20202020-0b5c-4178-bed7-d371f6411eaa';
const draftId = '20202020-0b5c-4178-bed7-d371f6411ea1';
const receiptId = '20202020-0b5c-4178-bed7-d371f6411ea2';
const approvalBindingId = '20202020-0b5c-4178-bed7-d371f6411ea3';

const expectedActionBinding = {
  workspaceId,
  initiatorUserWorkspaceId: userWorkspaceId,
  actionName: 'send_inbox_reply' as const,
  actionVersion: 1 as const,
  draftId,
  threadId: draftId,
  contentDigest: 'content-digest',
  recipientFingerprint: 'recipient-fingerprint',
  sendingAccountFingerprint: 'account-fingerprint',
  actionContextFingerprint: 'context-fingerprint',
  evidenceLinks: [
    {
      objectMetadataId: 'thread-metadata-id',
      recordId: draftId,
      role: 'draft',
    },
    {
      objectMetadataId: 'message-metadata-id',
      recordId: 'parent-message-id',
      role: 'thread_parent',
    },
  ],
};

const authority = {
  expectedActionBinding,
  canonicalGraph: {
    messageThreadId: draftId,
    draftRevision: 4,
    draftBody: { markdown: 'Thanks for the update', blocknote: null },
    connectedAccountId: 'connected-account-id',
    messageChannelId: 'message-channel-id',
    senderEmail: 'sender@example.com',
    senderDisplayName: 'Brand',
    recipientEmail: 'creator@example.com',
    recipientLabel: 'Creator',
    subject: 'Re: Partnership',
    inReplyTo: '<incoming@example.com>',
    parentMessageId: 'parent-message-id',
    parentAssociationDirection: 'INCOMING' as const,
    providerMessageExternalId: 'provider-message-id',
    providerThreadExternalId: 'provider-thread-id',
    managedMailboxId: null,
    connectedAccount: { id: 'connected-account-id' },
  },
};

const binding = expectedActionBinding;

const receipt = (state: ActionExecutionReceiptState) => ({
  id: receiptId,
  workspaceId,
  state,
  providerCode: state === ActionExecutionReceiptState.SENT ? 'accepted' : null,
  outcome: state === ActionExecutionReceiptState.SENT ? 'accepted' : null,
  occurredAt: new Date('2026-09-02T00:00:00.000Z'),
});

const actor = {
  userId,
  userWorkspaceId,
  actorContext: { workspaceMemberId },
  authContext: {
    type: 'user' as const,
    userWorkspaceId,
    user: { id: userId },
    workspace: { id: workspaceId },
    workspaceMemberId,
    workspaceMember: { id: workspaceMemberId },
  },
};

const createService = (overrides?: {
  executeInboxReplyLocked?: jest.Mock;
  findExecutionReceiptForBinding?: jest.Mock;
  rebuildExecutionAuthority?: jest.Mock;
  reserveExecutionForBinding?: jest.Mock;
  sendMessage?: jest.Mock;
  recordProviderAccepted?: jest.Mock;
  recordProviderTerminalState?: jest.Mock;
  projectReceipt?: jest.Mock;
  saveMyahInboxDraftAfterProviderFailure?: jest.Mock;
  buildUserAndAgentActorContext?: jest.Mock;
}) => {
  const executeInboxReplyLocked =
    overrides?.executeInboxReplyLocked ??
    jest.fn(async (_input, operation: () => Promise<unknown>) => operation());
  const findExecutionReceiptForBinding =
    overrides?.findExecutionReceiptForBinding ??
    jest.fn().mockResolvedValue(null);
  const rebuildExecutionAuthority =
    overrides?.rebuildExecutionAuthority ??
    jest.fn().mockResolvedValue(authority);
  const reserveExecutionForBinding =
    overrides?.reserveExecutionForBinding ??
    jest.fn().mockResolvedValue({
      created: true,
      receipt: receipt(ActionExecutionReceiptState.PROCESSING),
    });
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
  const projectReceipt =
    overrides?.projectReceipt ??
    jest.fn().mockResolvedValue({ projected: true });
  const saveMyahInboxDraftAfterProviderFailure =
    overrides?.saveMyahInboxDraftAfterProviderFailure ??
    jest.fn().mockResolvedValue({
      status: MyahInboxDraftSaveStatus.SAVED,
      revision: 5,
      body: authority.canonicalGraph.draftBody,
    });
  const buildUserAndAgentActorContext =
    overrides?.buildUserAndAgentActorContext ??
    jest.fn().mockResolvedValue(actor);

  return {
    service: new MyahInboxReplyApprovedExecutionService(
      {
        executeInboxReplyLocked,
        findExecutionReceiptForBinding,
        reserveExecutionForBinding,
        recordProviderAccepted,
        recordProviderTerminalState,
      } as never,
      { rebuildExecutionAuthority } as never,
      { sendMessage } as never,
      { projectReceipt } as never,
      { saveMyahInboxDraftAfterProviderFailure } as never,
      { buildUserAndAgentActorContext } as never,
    ),
    executeInboxReplyLocked,
    findExecutionReceiptForBinding,
    rebuildExecutionAuthority,
    reserveExecutionForBinding,
    sendMessage,
    recordProviderAccepted,
    recordProviderTerminalState,
    projectReceipt,
    saveMyahInboxDraftAfterProviderFailure,
    buildUserAndAgentActorContext,
  };
};

describe('MyahInboxReplyApprovedExecutionService', () => {
  it('reserves one receipt, sends once, records acceptance, and projects it', async () => {
    const setup = createService();

    const result = await setup.service.execute({
      approvalBindingId,
      binding,
      workspaceId,
    });

    expect(setup.executeInboxReplyLocked).toHaveBeenCalledWith(
      { workspaceId, draftId },
      expect.any(Function),
    );
    expect(setup.rebuildExecutionAuthority).toHaveBeenCalledWith({
      workspaceId,
      binding: expectedActionBinding,
    });
    expect(setup.reserveExecutionForBinding).toHaveBeenCalledWith({
      approvalBindingId,
      expectedActionBinding,
    });
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
      receipt: receipt(ActionExecutionReceiptState.PROVIDER_ACCEPTED),
      authority,
      draft: null,
    });
  });

  it('returns an existing sent receipt without rebuilding mutable draft authority or another provider call', async () => {
    const setup = createService({
      findExecutionReceiptForBinding: jest
        .fn()
        .mockResolvedValue(receipt(ActionExecutionReceiptState.SENT)),
    });

    await expect(
      setup.service.execute({ approvalBindingId, binding, workspaceId }),
    ).resolves.toEqual({
      receipt: receipt(ActionExecutionReceiptState.SENT),
      authority: null,
      draft: null,
    });
    expect(setup.findExecutionReceiptForBinding).toHaveBeenCalledWith({
      workspaceId,
      approvalBindingId,
    });
    expect(setup.rebuildExecutionAuthority).not.toHaveBeenCalled();
    expect(setup.reserveExecutionForBinding).not.toHaveBeenCalled();
    expect(setup.sendMessage).not.toHaveBeenCalled();
    expect(setup.projectReceipt).not.toHaveBeenCalled();
  });

  it('reconciles an existing provider-accepted receipt without rebuilding mutable draft authority or retrying the provider', async () => {
    const setup = createService({
      findExecutionReceiptForBinding: jest
        .fn()
        .mockResolvedValue(
          receipt(ActionExecutionReceiptState.PROVIDER_ACCEPTED),
        ),
      rebuildExecutionAuthority: jest
        .fn()
        .mockRejectedValue(new Error('draft no longer exists')),
    });

    await expect(
      setup.service.execute({ approvalBindingId, binding, workspaceId }),
    ).resolves.toEqual({
      receipt: receipt(ActionExecutionReceiptState.PROVIDER_ACCEPTED),
      authority: null,
      draft: null,
    });
    expect(setup.rebuildExecutionAuthority).not.toHaveBeenCalled();
    expect(setup.reserveExecutionForBinding).not.toHaveBeenCalled();
    expect(setup.projectReceipt).toHaveBeenCalledWith(receiptId);
    expect(setup.sendMessage).not.toHaveBeenCalled();
  });

  it.each([
    ActionExecutionReceiptState.PROCESSING,
    ActionExecutionReceiptState.UNKNOWN,
    ActionExecutionReceiptState.FAILED,
  ])('does not rebuild authority or retry a %s receipt', async (state) => {
    const setup = createService({
      findExecutionReceiptForBinding: jest
        .fn()
        .mockResolvedValue(receipt(state)),
    });

    await expect(
      setup.service.execute({ approvalBindingId, binding, workspaceId }),
    ).resolves.toEqual({
      receipt: receipt(state),
      authority: null,
      draft: null,
    });

    expect(setup.rebuildExecutionAuthority).not.toHaveBeenCalled();
    expect(setup.reserveExecutionForBinding).not.toHaveBeenCalled();
    expect(setup.sendMessage).not.toHaveBeenCalled();
  });

  it('rejects source authority drift before reserving a receipt', async () => {
    const setup = createService({
      rebuildExecutionAuthority: jest
        .fn()
        .mockRejectedValue(new Error('source graph drifted')),
    });

    await expect(
      setup.service.execute({ approvalBindingId, binding, workspaceId }),
    ).rejects.toThrow('source graph drifted');
    expect(setup.reserveExecutionForBinding).not.toHaveBeenCalled();
    expect(setup.sendMessage).not.toHaveBeenCalled();
  });

  it('releases the advisory lock before a confirmed rejection preserves the draft and records the failure', async () => {
    let lockReleased = false;
    const setup = createService({
      executeInboxReplyLocked: jest.fn(
        async (_input, operation: () => Promise<unknown>) => {
          const result = await operation();
          lockReleased = true;

          return result;
        },
      ),
      sendMessage: jest.fn().mockImplementation(() => {
        expect(lockReleased).toBe(true);

        return Promise.reject({ responseCode: 550 });
      }),
      saveMyahInboxDraftAfterProviderFailure: jest
        .fn()
        .mockImplementation(() => {
          expect(lockReleased).toBe(true);

          return Promise.resolve({
            status: MyahInboxDraftSaveStatus.SAVED,
            revision: 5,
            body: authority.canonicalGraph.draftBody,
          });
        }),
      recordProviderTerminalState: jest.fn().mockImplementation(({ state }) => {
        expect(lockReleased).toBe(true);

        return Promise.resolve(receipt(state));
      }),
    });

    await expect(
      setup.service.execute({ approvalBindingId, binding, workspaceId }),
    ).resolves.toEqual({
      receipt: receipt(ActionExecutionReceiptState.FAILED),
      authority,
      draft: {
        status: MyahInboxDraftSaveStatus.SAVED,
        revision: 5,
        body: authority.canonicalGraph.draftBody,
      },
    });
    expect(setup.buildUserAndAgentActorContext).toHaveBeenCalledWith(
      userWorkspaceId,
      workspaceId,
    );
    expect(setup.saveMyahInboxDraftAfterProviderFailure).toHaveBeenCalledWith({
      authContext: actor.authContext,
      user: actor.authContext.user,
      workspace: actor.authContext.workspace,
      workspaceMemberId,
      threadId: draftId,
      expectedRevision: 4,
      body: authority.canonicalGraph.draftBody,
    });
    expect(
      setup.saveMyahInboxDraftAfterProviderFailure.mock.invocationCallOrder[0],
    ).toBeLessThan(
      setup.recordProviderTerminalState.mock.invocationCallOrder[0],
    );
  });

  it('locks an unknown provider outcome without drafting or retrying', async () => {
    const setup = createService({
      sendMessage: jest.fn().mockRejectedValue(new Error('socket reset')),
    });

    await expect(
      setup.service.execute({ approvalBindingId, binding, workspaceId }),
    ).resolves.toMatchObject({
      receipt: receipt(ActionExecutionReceiptState.UNKNOWN),
      authority,
      draft: null,
    });
    expect(setup.saveMyahInboxDraftAfterProviderFailure).not.toHaveBeenCalled();
    expect(setup.recordProviderTerminalState).toHaveBeenCalledWith({
      receiptId,
      state: ActionExecutionReceiptState.UNKNOWN,
      code: 'unknown',
    });
    expect(setup.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('locks an unknown outcome when the failure draft CAS cannot be saved', async () => {
    const setup = createService({
      sendMessage: jest.fn().mockRejectedValue({ responseCode: 550 }),
      saveMyahInboxDraftAfterProviderFailure: jest.fn().mockResolvedValue({
        status: MyahInboxDraftSaveStatus.CONFLICT,
        revision: 5,
        body: authority.canonicalGraph.draftBody,
      }),
    });

    await expect(
      setup.service.execute({ approvalBindingId, binding, workspaceId }),
    ).resolves.toMatchObject({
      receipt: receipt(ActionExecutionReceiptState.UNKNOWN),
      draft: null,
    });
    expect(setup.recordProviderTerminalState).toHaveBeenCalledWith({
      receiptId,
      state: ActionExecutionReceiptState.UNKNOWN,
      code: 'unknown',
    });
  });
});
