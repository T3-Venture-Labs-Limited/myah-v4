// Persisted-control shapes only. Neither a client payload nor these types confer
// historical permission, synchronization provenance, establishment or send authority.
export type CampaignReplyControl = {
  replyAgentEnabled: boolean;
  replyAgentMode: 'REVIEW' | 'AUTONOMOUS';
  replyAgentRevision: number;
  replyAgentEnabledAt: Date | null; // current enablement epoch; null before first enablement
  replyAgentChangedAt: Date | null;
  replyAgentChangedByWorkspaceMemberId: string | null;
};

export type CampaignReplyPauseInterval = {
  pausedAt: Date;
  pausedByWorkspaceMemberId: string;
  pausedRevision: number;
  resumedAt: Date | null;
  resumedByWorkspaceMemberId: string | null;
  resumedRevision: number | null;
};

export type CampaignCreatorReplyControl = {
  replyAgentPaused: boolean;
  replyAgentRevision: number;
  replyAgentPauseHistory: CampaignReplyPauseInterval[] | null; // null on legacy/untouched rows; no inferred pauses
  replyAgentChangedAt: Date | null;
  replyAgentChangedByWorkspaceMemberId: string | null;
};

export type CampaignEmailConversationBindingFact = {
  campaignId: string;
  participationId: string;
  creatorId: string;
  messageThreadId: string;
  messageChannelId: string;
  connectedAccountId: string;
  providerThreadId: string;
  creatorSender: string; // canonical inbound FROM handle
  accountRecipient: string; // canonical inbound TO handle; not outbound normalizedRecipient
  evidenceKind: 'ACCEPTED_CAMPAIGN_SEQUENCE' | 'OPERATOR_ATTRIBUTION';
  evidenceReference: string;
  establishedAt: Date; // server establishment, never backdated to provider acceptance
  establishedByWorkspaceMemberId: string | null;
  messageId: string | null; // non-null for message-scoped attribution only
  revokedAt: Date | null;
  revokedByWorkspaceMemberId: string | null;
  revocationReason: string | null;
};
