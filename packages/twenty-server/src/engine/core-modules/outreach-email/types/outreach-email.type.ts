export type OutreachMailboxSelection = {
  workspaceId: string;
  outreachActionId: string;
  connectedAccountId: string;
  messageChannelId: string;
  senderEmail: string;
  senderDisplayName: string | null;
};

export type OutreachPreparationAuthority = {
  workspaceId: string;
  outreachActionId: string;
  campaignCreatorId: string;
  creatorId: string;
  campaignId: string;
  recipientEmail: string;
  recipientLabel: string;
  campaignLabel: string;
  mailboxSelection: OutreachMailboxSelection;
  inReplyTo: string | null;
  messageThreadId: string | null;
  messageThreadExternalId: string | null;
};

export type PreparedOutreachEmailDraft = {
  workspaceId: string;
  outreachActionId: string;
  campaignCreatorId: string;
  creatorId: string;
  campaignId: string;
  recipientEmail: string;
  recipientLabel: string;
  campaignLabel: string;
  connectedAccountId: string;
  messageChannelId: string;
  senderEmail: string;
  senderDisplayName: string | null;
  subject: string;
  body: string;
  contentDigest: string;
  providerDraftExternalId: string;
  providerThreadExternalId: string | null;
  headerMessageId: string;
  inReplyTo: string | null;
  messageThreadId: string | null;
};
