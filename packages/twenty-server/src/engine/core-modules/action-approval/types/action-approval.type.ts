export type ActionEvidenceLinkInput = {
  objectMetadataId: string;
  recordId: string;
  role: string;
};

type ActionBindingBase = {
  actionVersion: 1;
  draftId: string;
  contentDigest: string;
  recipientFingerprint: string;
  sendingAccountFingerprint: string;
  threadId: string;
  initiatorUserWorkspaceId: string;
  evidenceLinks: readonly ActionEvidenceLinkInput[];
};

export type InstagramReplyExpectedActionBinding = ActionBindingBase & {
  actionName: 'send_instagram_reply';
  actionContextFingerprint?: null;
  inboundMessageId: string;
  inboundSenderIgsid: string;
  inboundDirection: 'INBOUND';
  inboundReceivedAt: Date;
};

export type OutreachEmailExpectedActionBinding = ActionBindingBase & {
  actionName: 'send_outreach_email';
  actionContextFingerprint: string;
};

export type MyahInboxReplyExpectedActionBinding = ActionBindingBase & {
  actionName: 'send_inbox_reply';
  actionContextFingerprint: string;
};

export type ExpectedActionBinding =
  | InstagramReplyExpectedActionBinding
  | OutreachEmailExpectedActionBinding
  | MyahInboxReplyExpectedActionBinding;

export type ExpectedActionBindingWithWorkspace = ExpectedActionBinding & {
  workspaceId: string;
};

export type ProviderAcceptedOutcomeInput = {
  code: string;
  acceptedAt: Date;
  providerMessageId?: string;
  providerExternalMessageId?: string;
  providerThreadExternalId?: string;
};

export type AcceptedProviderOutcome = {
  code: 'accepted' | 'queued';
  acceptedAt: Date;
  providerMessageId?: string;
  providerExternalMessageId?: string;
  providerThreadExternalId?: string;
};

export type ActionApprovalFaultHooks = {
  afterReservation?: (receipt: SafeActionExecutionReceipt) => Promise<void>;
  afterProviderAccepted?: (
    receipt: SafeActionExecutionReceipt,
  ) => Promise<void>;
  afterWorkspaceProjection?: (receiptId: string) => Promise<void>;
};

export type SafeActionExecutionReceipt = {
  id: string;
  workspaceId: string;
  state: string;
  providerCode: string | null;
  outcome: string | null;
  occurredAt: Date;
};

export type ActionExecutionReservation = {
  created: boolean;
  receipt: SafeActionExecutionReceipt;
};

export type ActionReceiptProjectionWriter = {
  project: (input: {
    receiptId: string;
    workspaceId: string;
    draftId: string;
    contentDigest: string;
    actionName: ExpectedActionBinding['actionName'];
    providerMessageId: string | null;
    providerExternalMessageId: string | null;
    providerThreadExternalId: string | null;
    recipientFingerprint: string | null;
    sendingAccountFingerprint: string | null;
    actionContextFingerprint: string | null;
    evidenceLinks: readonly ActionEvidenceLinkInput[];
  }) => Promise<void>;
};

export const ACTION_RECEIPT_PROJECTION_WRITER = Symbol(
  'ACTION_RECEIPT_PROJECTION_WRITER',
);
