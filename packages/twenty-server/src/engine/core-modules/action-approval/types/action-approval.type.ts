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

export type MyahReplyContextSnapshot = {
  schemaVersion: 1;
  channel: 'EMAIL' | 'INSTAGRAM';
  deliveryTargetId: string;
  draftId: string;
  replyContext: { kind: 'CAMPAIGN'; campaignId: string } | { kind: 'GENERAL' };
  contactAnchor: {
    kind: 'CREATOR' | 'EMAIL_THREAD' | 'INSTAGRAM_CONVERSATION';
    id: string;
  };
  creatorId: string | null;
  eligibilityEvidenceDigest: string;
  authoredContextFingerprint: string | null;
  reviewedContextFingerprint: string | null;
  contextFingerprint: string;
};

export type EmailContextV2Binding = {
  actionName: 'send_inbox_reply';
  actionVersion: 2;
  draftId: string;
  contentDigest: string;
  recipientFingerprint: string;
  sendingAccountFingerprint: string;
  actionContextFingerprint: string;
  threadId: string | null;
  interactionContextType: 'MYAH_INBOX_EMAIL_CONTEXT_DRAFT' | null;
  interactionContextId: string | null;
  myahReplyContextSnapshot: MyahReplyContextSnapshot;
  initiatorUserWorkspaceId: string;
  evidenceLinks: readonly ActionEvidenceLinkInput[];
};

export const isContextEmailV2 = (
  binding: ExpectedActionBinding,
): binding is EmailContextV2Binding =>
  binding.actionName === 'send_inbox_reply' && binding.actionVersion === 2;

export const emailV2TargetId = (binding: EmailContextV2Binding): string =>
  binding.myahReplyContextSnapshot.deliveryTargetId;

export type InstagramMessageActionKind = 'START_CHAT' | 'REPLY';

export type InstagramMessageInteractionContextType =
  'MYAH_INBOX_INSTAGRAM_DRAFT';

export type InstagramMessageExpectedActionBinding = {
  actionName: 'send_instagram_message';
  actionVersion: 2;
  actionKind: InstagramMessageActionKind;
  draftId: string;
  contentDigest: string;
  recipientFingerprint: string;
  sendingAccountFingerprint: string;
  actionContextFingerprint: string;
  threadId: string | null;
  interactionContextType: InstagramMessageInteractionContextType | null;
  interactionContextId: string | null;
  initiatorUserWorkspaceId: string;
  evidenceLinks: readonly ActionEvidenceLinkInput[];
};

export type ExpectedActionBinding =
  | InstagramReplyExpectedActionBinding
  | OutreachEmailExpectedActionBinding
  | MyahInboxReplyExpectedActionBinding
  | EmailContextV2Binding
  | InstagramMessageExpectedActionBinding;

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

export type ActionReceiptProjectionInput =
  ExpectedActionBindingWithWorkspace & {
    receiptId: string;
    providerMessageId: string | null;
    providerExternalMessageId: string | null;
    providerThreadExternalId: string | null;
  };

export type ActionReceiptProjectionWriter = {
  project: (input: ActionReceiptProjectionInput) => Promise<void>;
};

export const ACTION_RECEIPT_PROJECTION_WRITER = Symbol(
  'ACTION_RECEIPT_PROJECTION_WRITER',
);
