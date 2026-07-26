import { ConnectedAccountProvider } from 'twenty-shared/types';

import { type OutreachEmailActionDefinition } from 'src/engine/core-modules/action-approval/definitions/outreach-email-action.definition';
import { ActionExecutionReceiptState } from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';
import { type ActionApprovalService } from 'src/engine/core-modules/action-approval/services/action-approval.service';
import { type ActionReceiptProjectorService } from 'src/engine/core-modules/action-approval/services/action-receipt-projector.service';
import { SendOutreachEmailTool } from 'src/engine/core-modules/tool/tools/outreach-email-tool/send-outreach-email-tool';
import { SendOutreachEmailInputZodSchema } from 'src/engine/core-modules/tool/tools/outreach-email-tool/outreach-email-tool.schema';
import { type ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { type MessagingMessageOutboundService } from 'src/modules/messaging/message-outbound-manager/services/messaging-message-outbound.service';
import { type SentMessagePersistenceService } from 'src/modules/messaging/message-outbound-manager/services/sent-message-persistence.service';

const WORKSPACE_ID = '00000000-0000-4000-8000-000000000001';
const USER_WORKSPACE_ID = '00000000-0000-4000-8000-000000000002';
const THREAD_ID = '00000000-0000-4000-8000-000000000003';
const APPROVAL_BINDING_ID = '00000000-0000-4000-8000-000000000004';
const OUTREACH_ACTION_ID = '00000000-0000-4000-8000-000000000005';
const CONNECTED_ACCOUNT_ID = '00000000-0000-4000-8000-000000000006';
const MESSAGE_CHANNEL_ID = '00000000-0000-4000-8000-000000000007';
const RECEIPT_ID = '00000000-0000-4000-8000-000000000008';

const input = { actionApprovalBindingId: APPROVAL_BINDING_ID };
const context = {
  workspaceId: WORKSPACE_ID,
  userWorkspaceId: USER_WORKSPACE_ID,
  threadId: THREAD_ID,
};
const binding = {
  workspaceId: WORKSPACE_ID,
  actionName: 'send_outreach_email',
  actionVersion: 1,
  draftId: OUTREACH_ACTION_ID,
  contentDigest: 'a'.repeat(64),
  recipientFingerprint: 'b'.repeat(64),
  sendingAccountFingerprint: 'c'.repeat(64),
  actionContextFingerprint: 'd'.repeat(64),
  initiatorUserWorkspaceId: USER_WORKSPACE_ID,
  threadId: THREAD_ID,
  evidenceLinks: [],
};
const connectedAccount = {
  id: CONNECTED_ACCOUNT_ID,
  workspaceId: WORKSPACE_ID,
  provider: ConnectedAccountProvider.GOOGLE,
  handle: 'sender@example.com',
  archivedAt: null,
} as ConnectedAccountEntity;
const canonicalGraph = {
  outreachActionId: OUTREACH_ACTION_ID,
  campaignCreatorId: '00000000-0000-4000-8000-000000000009',
  creatorId: '00000000-0000-4000-8000-000000000010',
  campaignId: '00000000-0000-4000-8000-000000000011',
  subject: 'Approved subject',
  body: 'Approved <body> & exact',
  recipientEmail: 'creator@example.com',
  recipientLabel: 'Creator Name',
  campaignLabel: 'Launch Campaign',
  connectedAccountId: CONNECTED_ACCOUNT_ID,
  messageChannelId: MESSAGE_CHANNEL_ID,
  senderEmail: 'sender@example.com',
  senderDisplayName: 'Sender Name',
  providerDraftExternalId: 'provider-draft-id',
  providerThreadExternalId: 'provider-thread-id',
  messageThreadId: null,
  inReplyTo: null,
  parentMessageRecordId: null,
  connectedAccount,
};
const authority = {
  expectedActionBinding: binding,
  canonicalGraph,
};
const processingReceipt = {
  id: RECEIPT_ID,
  state: ActionExecutionReceiptState.PROCESSING,
};
const sendResult = {
  headerMessageId: '<sent@example.com>',
  messageExternalId: 'provider-message-id',
  threadExternalId: 'provider-thread-id',
};

const buildTool = () => {
  const getApprovedBinding = jest.fn().mockResolvedValue(binding);
  const findExecutionReceiptForBinding = jest.fn().mockResolvedValue(null);
  const reserveExecutionForBinding = jest.fn().mockResolvedValue({
    created: true,
    receipt: processingReceipt,
  });
  const recordProviderAccepted = jest.fn().mockResolvedValue(undefined);
  const recordProviderTerminalState = jest.fn().mockResolvedValue(undefined);
  const actionApprovalService = {
    getApprovedBinding,
    findExecutionReceiptForBinding,
    reserveExecutionForBinding,
    recordProviderAccepted,
    recordProviderTerminalState,
  } as unknown as ActionApprovalService;
  const rebuildExecutionAuthority = jest.fn().mockResolvedValue(authority);
  const actionDefinition = {
    rebuildExecutionAuthority,
  } as unknown as OutreachEmailActionDefinition;
  const sendDraft = jest.fn().mockResolvedValue(sendResult);
  const messageOutboundService = {
    sendDraft,
  } as unknown as MessagingMessageOutboundService;
  const persistSentMessage = jest.fn().mockResolvedValue({
    messageId: 'workspace-message-id',
    messageThreadId: 'workspace-thread-id',
  });
  const sentMessagePersistenceService = {
    persistSentMessage,
  } as unknown as SentMessagePersistenceService;
  const projectReceipt = jest.fn().mockResolvedValue(undefined);
  const projector = {
    projectReceipt,
  } as unknown as ActionReceiptProjectorService;

  return {
    getApprovedBinding,
    findExecutionReceiptForBinding,
    reserveExecutionForBinding,
    recordProviderAccepted,
    recordProviderTerminalState,
    rebuildExecutionAuthority,
    sendDraft,
    persistSentMessage,
    projectReceipt,
    tool: new SendOutreachEmailTool(
      actionApprovalService,
      actionDefinition,
      messageOutboundService,
      sentMessagePersistenceService,
      projector,
    ),
  };
};

describe('SendOutreachEmailTool', () => {
  it('accepts only an approval binding UUID and requires member-bound chat context', async () => {
    const { tool, getApprovedBinding } = buildTool();

    expect(SendOutreachEmailInputZodSchema.safeParse(input).success).toBe(true);
    expect(
      SendOutreachEmailInputZodSchema.safeParse({
        ...input,
        subject: 'caller supplied',
      }).success,
    ).toBe(false);
    await expect(
      tool.execute(input, {
        workspaceId: WORKSPACE_ID,
        userWorkspaceId: USER_WORKSPACE_ID,
      }),
    ).resolves.toMatchObject({ success: false });
    expect(getApprovedBinding).not.toHaveBeenCalled();
  });

  it('reserves before one exact provider send, records acceptance, persists, and projects', async () => {
    const {
      tool,
      getApprovedBinding,
      rebuildExecutionAuthority,
      reserveExecutionForBinding,
      recordProviderAccepted,
      sendDraft,
      persistSentMessage,
      projectReceipt,
    } = buildTool();

    await expect(tool.execute(input, context)).resolves.toEqual({
      success: true,
      message: 'Outreach email accepted.',
    });
    expect(getApprovedBinding).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      approvalBindingId: APPROVAL_BINDING_ID,
      initiatorUserWorkspaceId: USER_WORKSPACE_ID,
      threadId: THREAD_ID,
    });
    expect(rebuildExecutionAuthority).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      binding,
    });
    expect(reserveExecutionForBinding).toHaveBeenCalledWith({
      approvalBindingId: APPROVAL_BINDING_ID,
      expectedActionBinding: binding,
    });
    expect(sendDraft).toHaveBeenCalledWith(
      'provider-draft-id',
      {
        to: ['creator@example.com'],
        subject: 'Approved subject',
        body: 'Approved <body> & exact',
        html: 'Approved &lt;body&gt; &amp; exact',
        attachments: [],
        inReplyTo: undefined,
        threadExternalId: 'provider-thread-id',
      },
      connectedAccount,
    );
    expect(recordProviderAccepted).toHaveBeenCalledWith(RECEIPT_ID, {
      code: 'accepted',
      acceptedAt: expect.any(Date),
      providerMessageId: '<sent@example.com>',
    });
    expect(persistSentMessage).toHaveBeenCalledWith({
      sendResult,
      subject: 'Approved subject',
      body: 'Approved <body> & exact',
      recipients: { to: ['creator@example.com'], cc: [], bcc: [] },
      connectedAccount,
      messageChannelId: MESSAGE_CHANNEL_ID,
      inReplyTo: undefined,
      parentThreadExternalId: 'provider-thread-id',
      workspaceId: WORKSPACE_ID,
    });
    expect(projectReceipt).toHaveBeenCalledWith(RECEIPT_ID);
    expect(getApprovedBinding.mock.invocationCallOrder[0]).toBeLessThan(
      rebuildExecutionAuthority.mock.invocationCallOrder[0],
    );
    expect(rebuildExecutionAuthority.mock.invocationCallOrder[0]).toBeLessThan(
      reserveExecutionForBinding.mock.invocationCallOrder[0],
    );
    expect(reserveExecutionForBinding.mock.invocationCallOrder[0]).toBeLessThan(
      sendDraft.mock.invocationCallOrder[0],
    );
  });

  it.each([
    [
      'explicit HTTP rejection',
      { response: { status: 400 }, credential: 'secret' },
      ActionExecutionReceiptState.FAILED,
      'failed',
    ],
    [
      'timeout ambiguity',
      new Error('socket timeout credential=secret'),
      ActionExecutionReceiptState.UNKNOWN,
      'unknown',
    ],
  ])(
    'records %s without exposing or retrying it',
    async (_label, error, state, code) => {
      const {
        tool,
        sendDraft,
        recordProviderAccepted,
        recordProviderTerminalState,
        persistSentMessage,
      } = buildTool();

      sendDraft.mockRejectedValueOnce(error);

      await expect(tool.execute(input, context)).resolves.toEqual({
        success: false,
        message: 'Outreach email was not sent.',
      });
      expect(recordProviderTerminalState).toHaveBeenCalledWith({
        receiptId: RECEIPT_ID,
        state,
        code,
      });
      expect(recordProviderAccepted).not.toHaveBeenCalled();
      expect(persistSentMessage).not.toHaveBeenCalled();
    },
  );

  it.each([
    ActionExecutionReceiptState.PROCESSING,
    ActionExecutionReceiptState.BLOCKED,
    ActionExecutionReceiptState.FAILED,
    ActionExecutionReceiptState.UNKNOWN,
  ])('never retries an existing %s receipt', async (state) => {
    const {
      tool,
      findExecutionReceiptForBinding,
      rebuildExecutionAuthority,
      reserveExecutionForBinding,
      sendDraft,
    } = buildTool();

    findExecutionReceiptForBinding.mockResolvedValueOnce({
      id: RECEIPT_ID,
      state,
    });

    await expect(tool.execute(input, context)).resolves.toMatchObject({
      success: false,
    });
    expect(rebuildExecutionAuthority).not.toHaveBeenCalled();
    expect(reserveExecutionForBinding).not.toHaveBeenCalled();
    expect(sendDraft).not.toHaveBeenCalled();
  });

  it.each([
    ActionExecutionReceiptState.PROCESSING,
    ActionExecutionReceiptState.BLOCKED,
    ActionExecutionReceiptState.FAILED,
    ActionExecutionReceiptState.UNKNOWN,
  ])('never sends for a concurrent %s reservation', async (state) => {
    const { tool, reserveExecutionForBinding, sendDraft } = buildTool();

    reserveExecutionForBinding.mockResolvedValueOnce({
      created: false,
      receipt: { id: RECEIPT_ID, state },
    });

    await expect(tool.execute(input, context)).resolves.toMatchObject({
      success: false,
    });
    expect(sendDraft).not.toHaveBeenCalled();
  });

  it('repairs an existing accepted receipt without provider submission', async () => {
    const {
      tool,
      findExecutionReceiptForBinding,
      rebuildExecutionAuthority,
      projectReceipt,
      sendDraft,
    } = buildTool();

    findExecutionReceiptForBinding.mockResolvedValueOnce({
      id: RECEIPT_ID,
      state: ActionExecutionReceiptState.PROVIDER_ACCEPTED,
    });

    await expect(tool.execute(input, context)).resolves.toEqual({
      success: true,
      message: 'Outreach email accepted.',
    });
    expect(projectReceipt).toHaveBeenCalledWith(RECEIPT_ID);
    expect(rebuildExecutionAuthority).not.toHaveBeenCalled();
    expect(sendDraft).not.toHaveBeenCalled();
  });

  it('returns success for an existing SENT receipt without provider submission', async () => {
    const { tool, findExecutionReceiptForBinding, projectReceipt, sendDraft } =
      buildTool();

    findExecutionReceiptForBinding.mockResolvedValueOnce({
      id: RECEIPT_ID,
      state: ActionExecutionReceiptState.SENT,
    });

    await expect(tool.execute(input, context)).resolves.toEqual({
      success: true,
      message: 'Outreach email accepted.',
    });
    expect(projectReceipt).not.toHaveBeenCalled();
    expect(sendDraft).not.toHaveBeenCalled();
  });

  it('does not resend when post-acceptance persistence or projection fails', async () => {
    const {
      tool,
      sendDraft,
      recordProviderAccepted,
      persistSentMessage,
      projectReceipt,
    } = buildTool();

    persistSentMessage.mockRejectedValueOnce(
      new Error('workspace save failed'),
    );
    projectReceipt.mockRejectedValueOnce(new Error('projection failed'));

    await expect(tool.execute(input, context)).resolves.toEqual({
      success: true,
      message: 'Outreach email accepted.',
    });
    expect(sendDraft).toHaveBeenCalledTimes(1);
    expect(recordProviderAccepted).toHaveBeenCalledTimes(1);
    expect(projectReceipt).toHaveBeenCalledTimes(1);
  });
});
