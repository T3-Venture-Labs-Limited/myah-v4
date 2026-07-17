export type ActionEvidenceLinkInput = {
  objectMetadataId: string;
  recordId: string;
  role: string;
};

export type ExpectedActionBinding = {
  actionName: 'send_instagram_reply';
  actionVersion: 1;
  draftId: string;
  contentDigest: string;
  recipientFingerprint: string;
  sendingAccountFingerprint: string;
  inboundMessageId: string;
  inboundSenderIgsid: string;
  inboundDirection: 'INBOUND';
  inboundReceivedAt: Date;
  threadId: string;
  initiatorUserWorkspaceId: string;
  evidenceLinks: readonly ActionEvidenceLinkInput[];
};

export type ExpectedActionBindingWithWorkspace = ExpectedActionBinding & {
  workspaceId: string;
};

export type ProviderAcceptedOutcomeInput = {
  code: string;
  acceptedAt: Date;
};

export type AcceptedProviderOutcome = {
  code: 'accepted' | 'queued';
  acceptedAt: Date;
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
  }) => Promise<void>;
};

export const ACTION_RECEIPT_PROJECTION_WRITER = Symbol(
  'ACTION_RECEIPT_PROJECTION_WRITER',
);
