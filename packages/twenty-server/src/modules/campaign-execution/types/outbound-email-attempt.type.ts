export const OUTBOUND_EMAIL_ATTEMPT_STATES = [
  'RESERVED',
  'PROCESSING',
  'BLOCKED',
  'ACCEPTED',
  'DEFINITELY_UNACCEPTED',
  'UNKNOWN',
] as const;

export type OutboundEmailAttemptState =
  (typeof OUTBOUND_EMAIL_ATTEMPT_STATES)[number];

export type OutboundEmailAttemptSource =
  | 'CAMPAIGN_SEQUENCE'
  | 'CAMPAIGN_TEST'
  | 'INBOX'
  | 'AUTOMATED_REPLY';

export type OutboundEmailCapacityState =
  | 'RESERVED'
  | 'CONSUMED'
  | 'RELEASED'
  | 'PROVISIONAL_UNKNOWN';

export type OutboundEmailSelectionConstraintKind =
  | 'ROTATE'
  | 'PINNED_REPLY'
  | 'EXPLICIT';

type CommonReservationIdentity = {
  attemptId: string;
  workspaceId: string;
  connectedAccountId: string;
  messageChannelId: string;
  provider: string;
  normalizedSenderHandle: string;
  normalizedRecipient: string;
  localDate: string;
  claimedAt: Date;
  slotAt: Date;
  unknownAfter: Date;
};

type RotatingSelectionConstraint = {
  selectionConstraintKind: 'ROTATE';
  priorAcceptedEvidenceId: null;
};

type TrustedPinnedReplySelectionConstraint = {
  selectionConstraintKind: 'PINNED_REPLY';
  priorAcceptedEvidenceId: string;
};

type ExplicitSelectionConstraint = {
  selectionConstraintKind: 'EXPLICIT';
  priorAcceptedEvidenceId: null;
};

type CommonReservationBinding = {
  localDate: string;
  claimedAt: Date;
  slotAt: Date;
  unknownAfter: Date;
};

export type CampaignSequenceReservationBinding = CommonReservationBinding &
  (RotatingSelectionConstraint | TrustedPinnedReplySelectionConstraint) & {
    attemptNumber: number;
    senderPoolFingerprint: string;
  };

export type CampaignTestReservationBinding = CommonReservationBinding &
  RotatingSelectionConstraint & {
    senderPoolFingerprint: string;
  };

export type DirectReservationBinding = CommonReservationBinding &
  (TrustedPinnedReplySelectionConstraint | ExplicitSelectionConstraint) & {
    directReservationCapabilityId: string;
  };

export type CampaignSequenceAttemptReservationIdentity =
  CommonReservationIdentity &
    (RotatingSelectionConstraint | TrustedPinnedReplySelectionConstraint) & {
      source: 'CAMPAIGN_SEQUENCE';
      campaignId: string;
      enrollmentId: string;
      occurrenceId: string;
      authorizationId: string;
      workflowVersionId: string;
      messageId: string;
      attemptNumber: number;
      senderPoolFingerprint: string;
      renderDigest: string;
      reservationEvidence: {
        kind: 'CAMPAIGN_SEQUENCE_RESERVATION';
      };
    };

export type CampaignTestAttemptReservationIdentity = CommonReservationIdentity &
  RotatingSelectionConstraint & {
    source: 'CAMPAIGN_TEST';
    campaignId: string;
    workflowVersionId: string;
    messageId: string;
    senderPoolFingerprint: string;
    renderDigest: string;
    previewDigest: string;
    testTransportDigest: string;
    requesterUserWorkspaceId: string;
    reservationEvidence: {
      kind: 'TEST_PREPARATION_PROOF';
      testPreparationProofId: string;
      maySubmit: false;
    };
  };

export type DirectAttemptReservationIdentity = CommonReservationIdentity &
  (TrustedPinnedReplySelectionConstraint | ExplicitSelectionConstraint) & {
    source: 'INBOX' | 'AUTOMATED_REPLY';
    directReservationCapabilityId: string;
    reservationEvidence: {
      kind: 'DIRECT_RESERVATION_CAPABILITY';
      directReservationCapabilityId: string;
    };
  };

export type OutboundEmailAttemptReservationIdentity =
  | CampaignSequenceAttemptReservationIdentity
  | CampaignTestAttemptReservationIdentity
  | DirectAttemptReservationIdentity;

type CommonSubmissionInput = {
  attemptId: string;
  workspaceId: string;
  connectedAccountId: string;
  messageChannelId: string;
  provider: string;
  normalizedSenderHandle: string;
  normalizedRecipient: string;
  finalEvidenceDigest: string;
};

export type CampaignSequenceSubmissionInput = CommonSubmissionInput & {
  source: 'CAMPAIGN_SEQUENCE';
  campaignId: string;
  enrollmentId: string;
  occurrenceId: string;
  authorizationId: string;
  workflowVersionId: string;
  messageId: string;
  renderDigest: string;
  submissionCapability: {
    kind: 'CAMPAIGN_SEQUENCE_SUBMISSION';
    attemptId: string;
    renderDigest: string;
    reservationBinding: CampaignSequenceReservationBinding;
    renderContext: {
      workspaceId: string;
      campaignId: string;
      enrollmentId: string;
      occurrenceId: string;
      authorizationId: string;
      workflowVersionId: string;
      messageId: string;
      connectedAccountId: string;
      messageChannelId: string;
      provider: string;
      normalizedSenderHandle: string;
      normalizedRecipient: string;
    };
  };
};

export type CampaignTestSubmissionInput = CommonSubmissionInput & {
  source: 'CAMPAIGN_TEST';
  campaignId: string;
  workflowVersionId: string;
  messageId: string;
  testPreparationProofId: string;
  requesterUserWorkspaceId: string;
  renderDigest: string;
  previewDigest: string;
  testTransportDigest: string;
  submissionCapability: {
    kind: 'CAMPAIGN_TEST_SUBMISSION';
    testSubmissionCapabilityId: string;
    attemptId: string;
    testPreparationProofId: string;
    workspaceId: string;
    campaignId: string;
    workflowVersionId: string;
    messageId: string;
    requesterUserWorkspaceId: string;
    normalizedRecipient: string;
    connectedAccountId: string;
    messageChannelId: string;
    provider: string;
    normalizedSenderHandle: string;
    reservationBinding: CampaignTestReservationBinding;
    renderDigest: string;
    previewDigest: string;
    testTransportDigest: string;
  };
};

export type DirectSubmissionInput = CommonSubmissionInput & {
  source: 'INBOX' | 'AUTOMATED_REPLY';
  directReservationCapabilityId: string;
  submissionCapability: {
    kind: 'DIRECT_SUBMISSION_CAPABILITY';
    directSubmissionCapabilityId: string;
    directReservationCapabilityId: string;
    attemptId: string;
    workspaceId: string;
    connectedAccountId: string;
    messageChannelId: string;
    provider: string;
    normalizedSenderHandle: string;
    normalizedRecipient: string;
    reservationBinding: DirectReservationBinding;
    finalEvidenceDigest: string;
  };
};

export type BeginOutboundEmailSubmissionInput =
  | CampaignSequenceSubmissionInput
  | CampaignTestSubmissionInput
  | DirectSubmissionInput;

type ReceiptOutcomeFields = {
  attemptState: OutboundEmailAttemptState;
  capacityState: OutboundEmailCapacityState;
  finalEvidenceDigest: string | null;
  providerMessageId: string | null;
  providerAcceptedAt: Date | null;
  safeOutcomeReason: string | null;
  retryable: boolean | null;
  projectedMessageId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type OutboundEmailAttemptReceipt = Readonly<
  CommonReservationIdentity &
    ReceiptOutcomeFields & {
      source: OutboundEmailAttemptSource;
      selectionConstraintKind: OutboundEmailSelectionConstraintKind;
      priorAcceptedEvidenceId: string | null;
      senderPoolFingerprint: string | null;
      campaignId: string | null;
      enrollmentId: string | null;
      occurrenceId: string | null;
      authorizationId: string | null;
      workflowVersionId: string | null;
      messageId: string | null;
      attemptNumber: number | null;
      renderDigest: string | null;
      testPreparationProofId: string | null;
      requesterUserWorkspaceId: string | null;
      previewDigest: string | null;
      testTransportDigest: string | null;
      directReservationCapabilityId: string | null;
    }
>;

export const hasVerifiedSentEvidence = (
  receipt: OutboundEmailAttemptReceipt,
): boolean =>
  receipt.attemptState === 'ACCEPTED' && receipt.projectedMessageId !== null;

export const OUTBOUND_EMAIL_ATTEMPT_TRANSITIONS = Object.freeze({
  ACCEPTED: {
    capacityState: 'CONSUMED',
    compactSpacing: false,
    retryAutomatically: false,
  },
  BLOCKED: {
    capacityState: 'RELEASED',
    compactSpacing: false,
    retryAutomatically: false,
  },
  DEFINITELY_UNACCEPTED: {
    capacityState: 'RELEASED',
    compactSpacing: false,
    retryAutomatically: false,
  },
  UNKNOWN: {
    capacityState: 'PROVISIONAL_UNKNOWN',
    compactSpacing: false,
    retryAutomatically: false,
  },
  UNKNOWN_RESOLUTIONS: ['ACCEPTED', 'DEFINITELY_UNACCEPTED'],
} as const);
