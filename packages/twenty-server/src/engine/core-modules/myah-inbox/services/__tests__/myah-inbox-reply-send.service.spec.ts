import {
  MyahInboxReplyUnavailableCode,
  MyahInboxReplyUnavailableError,
} from 'src/engine/core-modules/action-approval/definitions/myah-inbox-reply-action.definition';
import { ActionExecutionReceiptState } from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';
import {
  MyahInboxReplySendOutcome,
  MyahInboxReplySendReadinessStatus,
} from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-reply-send.dto';
import { MyahInboxReplySendService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-send.service';

const workspaceId = '20202020-1c25-4d02-bf25-6aeccf7ea419';
const userWorkspaceId = '20202020-1234-4678-9012-345678901234';
const userId = '20202020-1234-4678-9012-345678901235';
const workspaceMemberId = '20202020-0b5c-4178-bed7-d371f6411eaa';
const threadId = '20202020-0b5c-4178-bed7-d371f6411ea1';
const receiptId = '20202020-0b5c-4178-bed7-d371f6411ea2';
const approvalBindingId = '20202020-0b5c-4178-bed7-d371f6411ea3';
const workspace = { id: workspaceId };
const authContext = {
  type: 'user',
  workspace,
  userWorkspaceId,
  user: { id: userId },
  workspaceMemberId,
  workspaceMember: { id: workspaceMemberId },
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

const request = () => ({
  threadId,
  expectedDraftRevision: 4,
  authContext,
  user: authContext.user,
  workspace,
  userWorkspaceId,
  workspaceMemberId,
});

const createService = (overrides?: {
  buildAuthority?: jest.Mock;
  rebuildExecutionAuthority?: jest.Mock;
  reserveExecution?: jest.Mock;
  findExecutionReceipt?: jest.Mock;
  sendMessage?: jest.Mock;
  recordProviderAccepted?: jest.Mock;
  recordProviderTerminalState?: jest.Mock;
  projectReceipt?: jest.Mock;
  saveMyahInboxDraft?: jest.Mock;
}) => {
  const createApprovedInboxReplyBinding = jest
    .fn()
    .mockResolvedValue({ id: approvalBindingId });
  const invalidateApprovedInboxReplyBinding = jest.fn().mockResolvedValue(undefined);
  const buildAuthority = overrides?.buildAuthority ?? jest.fn().mockResolvedValue(authority);
  const rebuildExecutionAuthority =
    overrides?.rebuildExecutionAuthority ?? jest.fn().mockResolvedValue(authority);
  const reserveExecution =
    overrides?.reserveExecution ??
    jest.fn().mockResolvedValue({
      created: true,
      receipt: receipt(ActionExecutionReceiptState.PROCESSING),
    });
  const findExecutionReceipt =
    overrides?.findExecutionReceipt ??
    jest.fn().mockResolvedValue(receipt(ActionExecutionReceiptState.SENT));
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
    overrides?.recordProviderTerminalState ?? jest.fn().mockResolvedValue(receipt(ActionExecutionReceiptState.UNKNOWN));
  const projectReceipt = overrides?.projectReceipt ?? jest.fn().mockResolvedValue({ projected: true });
  const saveMyahInboxDraft =
    overrides?.saveMyahInboxDraft ??
    jest.fn().mockResolvedValue({
      status: 'SAVED',
      revision: 5,
      body: authority.canonicalGraph.draftBody,
    });

  return {
    service: new MyahInboxReplySendService(
      {
        createApprovedInboxReplyBinding,
        invalidateApprovedInboxReplyBinding,
        reserveExecution,
        findExecutionReceipt,
        recordProviderAccepted,
        recordProviderTerminalState,
      } as never,
      { buildAuthority, rebuildExecutionAuthority } as never,
      { sendMessage } as never,
      { projectReceipt } as never,
      { saveMyahInboxDraft } as never,
    ),
    createApprovedInboxReplyBinding,
    invalidateApprovedInboxReplyBinding,
    buildAuthority,
    rebuildExecutionAuthority,
    reserveExecution,
    findExecutionReceipt,
    sendMessage,
    recordProviderAccepted,
    recordProviderTerminalState,
    projectReceipt,
    saveMyahInboxDraft,
  };
};

describe('MyahInboxReplySendService', () => {
  it('proves authority, reserves before one provider send, records acceptance, and projects', async () => {
    const setup = createService();

    const result = await setup.service.send(request());

    expect(setup.createApprovedInboxReplyBinding).toHaveBeenCalledWith(
      authority.expectedActionBinding,
    );
    expect(setup.reserveExecution).toHaveBeenCalledWith(
      authority.expectedActionBinding,
    );
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

  it('does not issue a second provider send for a duplicate logical receipt', async () => {
    const setup = createService({
      reserveExecution: jest.fn().mockResolvedValue({
        created: false,
        receipt: receipt(ActionExecutionReceiptState.SENT),
      }),
    });

    await expect(setup.service.send(request())).resolves.toMatchObject({
      outcome: MyahInboxReplySendOutcome.SENT,
      receiptId,
    });
    expect(setup.sendMessage).not.toHaveBeenCalled();
    expect(setup.invalidateApprovedInboxReplyBinding).toHaveBeenCalledWith({
      workspaceId,
      approvalBindingId,
      initiatorUserWorkspaceId: userWorkspaceId,
      threadId,
      draftId: threadId,
    });
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
    expect(setup.reserveExecution).not.toHaveBeenCalled();
    expect(setup.sendMessage).not.toHaveBeenCalled();
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
    expect(setup.saveMyahInboxDraft).toHaveBeenCalledWith({
      ...request(),
      expectedRevision: 4,
      body: authority.canonicalGraph.draftBody,
    });
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
    expect(setup.saveMyahInboxDraft).not.toHaveBeenCalled();
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
      findExecutionReceipt: jest
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
    expect(setup.saveMyahInboxDraft).not.toHaveBeenCalled();
    expect(setup.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('reads a receipt only for the authenticated workspace, actor, action, and thread', async () => {
    const setup = createService({
      findExecutionReceipt: jest
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
    });
    expect(setup.findExecutionReceipt).toHaveBeenCalledWith({
      workspaceId,
      receiptId,
      actionName: 'send_inbox_reply',
      draftId: threadId,
      initiatorUserWorkspaceId: userWorkspaceId,
    });
  });

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
});
