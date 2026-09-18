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

export type InstagramMessageActionKind = 'START_CHAT' | 'REPLY';

export type InstagramMessageIdentitySnapshot = {
  publicIdentifier: string;
  providerId: string;
  providerMessagingId: string;
  creatorRecordId: string;
  accountBindingId: string;
  instagramAccountRecordId: string;
  unipileAccountId: string;
  instagramUserId: string;
  recipientSourceValues: Array<{ field: string; value: string }>;
} & (
  | {
      actionKind: 'START_CHAT';
      conversationRecordId: null;
      providerChatId: null;
      attendeeProviderId: null;
    }
  | {
      actionKind: 'REPLY';
      conversationRecordId: string;
      providerChatId: string;
      attendeeProviderId: string;
    }
);

export type InstagramMessageInteractionContextType =
  | 'MYAH_INBOX_INSTAGRAM_DRAFT'
  | 'MYAH_INSTAGRAM_MESSAGE_DRAFT';

type InstagramMessageBindingBase = {
  actionName: 'send_instagram_message';
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

/** Historical receipts retain this exact v2 shape; no fresh approval may create it. */
export type InstagramMessageV2ExpectedActionBinding =
  InstagramMessageBindingBase & {
    actionVersion: 2;
    interactionContextType: 'MYAH_INBOX_INSTAGRAM_DRAFT' | null;
    instagramMessageSnapshot?: null;
    composerInputDigest?: null;
  };

export type InstagramMessageV3ExpectedActionBinding =
  InstagramMessageBindingBase & {
    actionVersion: 3;
    interactionContextType: 'MYAH_INSTAGRAM_MESSAGE_DRAFT' | null;
    instagramMessageSnapshot: InstagramMessageIdentitySnapshot;
    composerInputDigest: string | null;
  };

export type InstagramMessageExpectedActionBinding =
  | InstagramMessageV2ExpectedActionBinding
  | InstagramMessageV3ExpectedActionBinding;

export type ExpectedActionBinding =
  | InstagramReplyExpectedActionBinding
  | OutreachEmailExpectedActionBinding
  | MyahInboxReplyExpectedActionBinding
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
  | (Exclude<
      ExpectedActionBindingWithWorkspace,
      InstagramMessageExpectedActionBinding
    > & {
      receiptId: string;
      providerMessageId: string | null;
      providerExternalMessageId: string | null;
      providerThreadExternalId: string | null;
    })
  | (InstagramMessageExpectedActionBinding & {
      workspaceId: string;
      receiptId: string;
      providerMessageId: string | null;
      providerExternalMessageId: string | null;
      providerThreadExternalId: string | null;
    });

export type ActionReceiptProjectionWriter = {
  project: (input: ActionReceiptProjectionInput) => Promise<void>;
};

export const ACTION_RECEIPT_PROJECTION_WRITER = Symbol(
  'ACTION_RECEIPT_PROJECTION_WRITER',
);

// Internal lookup keys, never returned directly to the browser.
export type InstagramMessageConfirmedDestinationSource = {
  snapshot: InstagramMessageIdentitySnapshot;
  providerChatId: string;
  providerMessageId: string;
  contentDigest: string;
};
