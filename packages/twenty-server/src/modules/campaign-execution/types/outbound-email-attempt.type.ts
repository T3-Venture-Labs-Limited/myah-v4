import {
  OUTBOUND_EMAIL_ATTEMPT_STATES,
  type OutboundEmailAttemptSource,
  type OutboundEmailAttemptState,
  type OutboundEmailCapacityState,
  type OutboundEmailSelectionConstraintKind,
} from 'src/engine/core-modules/campaign-execution/types/outbound-email-attempt-persistence.type';
import { type ReadyCampaignSenderReadiness } from 'src/modules/myah-campaign/types/campaign-sender-pool.type';

export {
  OUTBOUND_EMAIL_ATTEMPT_STATES,
  type OutboundEmailAttemptSource,
  type OutboundEmailAttemptState,
  type OutboundEmailCapacityState,
  type OutboundEmailSelectionConstraintKind,
};

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
  (RotatingSelectionConstraint | TrustedPinnedReplySelectionConstraint) & {
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
  (RotatingSelectionConstraint | TrustedPinnedReplySelectionConstraint) & {
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

export type OutboundEmailAttemptReservationRequestIdentity =
  OutboundEmailAttemptReservationIdentity extends infer Identity
    ? Identity extends OutboundEmailAttemptReservationIdentity
      ? Omit<Identity, 'localDate' | 'claimedAt' | 'slotAt' | 'unknownAfter'>
      : never
    : never;

export type ReserveOutboundEmailAttemptInput =
  OutboundEmailAttemptReservationRequestIdentity & {
    workspaceTimeZone: string;
    candidates: ReadyCampaignSenderReadiness[];
  };

export type ReserveOutboundEmailAttemptResult =
  | { status: 'RESERVED'; receipt: OutboundEmailAttemptReceipt }
  | { status: 'EXACT_REPLAY'; receipt: OutboundEmailAttemptReceipt }
  | { status: 'IDENTITY_CONFLICT' }
  | { status: 'STALE_PROJECTION' }
  | { status: 'MUTATION_WINDOW_STALE' }
  | { status: 'NOT_READY'; nextEligibleAt: Date }
  | {
      status: 'BLOCKED';
      reason: 'PINNED_SENDER_NOT_READY' | 'INVALID_CAPACITY_INPUT';
    };

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
  campaignExecutionId: string;
  authorizationGeneration: number;
  activationId: string;
  enrollmentId: string;
  occurrenceId: string;
  authorizationId: string;
  workflowVersionId: string;
  messageId: string;
  renderDigest: string;
  submissionCapability: {
    kind: 'CAMPAIGN_SEQUENCE_SUBMISSION';
    attemptId: string;
    campaignExecutionId: string;
    authorizationGeneration: number;
    activationId: string;
    renderDigest: string;
    reservationBinding: CampaignSequenceReservationBinding;
    renderContext: {
      workspaceId: string;
      campaignId: string;
      campaignExecutionId: string;
      authorizationGeneration: number;
      activationId: string;
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

type WithSubmission<Input extends object> =
  BeginOutboundEmailSubmissionInput extends infer Submission
    ? Submission extends BeginOutboundEmailSubmissionInput
      ? Submission & Input
      : never
    : never;

export type BlockReservedAttemptBeforeProviderInput = {
  reservation: OutboundEmailAttemptReservationIdentity;
  reason:
    | 'STALE_FINAL_EVIDENCE'
    | 'AUTHORITY_STALE'
    | 'RECIPIENT_SUPPRESSED'
    | 'WORKSPACE_NOT_ACTIVE'
    | 'CAMPAIGN_PAUSED'
    | 'CAMPAIGN_STOPPED'
    | 'AUTHORIZATION_STALE'
    | 'ENROLLMENT_REPLIED'
    | 'OCCURRENCE_CANCELLED'
    | 'AUDIENCE_DUPLICATE'
    | 'AUDIENCE_STAGE_INVALID'
    | 'AUDIENCE_CONTACT_INVALID'
    | 'MATERIAL_STALE'
    | 'SENDER_NOT_READY'
    | 'THREAD_EVIDENCE_INVALID'
    | 'DISPATCH_CONTRACT_CONFLICT'
    | 'INVALID_IMAP_SMTP_TRANSPORT_MATERIAL'
    | 'RESERVATION_EXPIRED';
};

export type AcceptedOutcomeEvidence = {
  providerMessageId: string;
  projectedMessageId: string | null;
  projectedMessageThreadId?: string | null;
  providerHeaderMessageId?: string | null;
  providerMessageExternalId?: string | null;
  providerThreadExternalId?: string | null;
  resolvedThreadExternalId?: string | null;
  providerDeliveredRecipients?: {
    to: string[];
    cc: string[];
    bcc: string[];
  } | null;
};

export type DefiniteOutcomeEvidence = {
  safeOutcomeReason:
    | 'DEFINITELY_UNACCEPTED_RETRYABLE'
    | 'DEFINITELY_UNACCEPTED_NON_RETRYABLE';
};

export type RecordAcceptedInput = WithSubmission<AcceptedOutcomeEvidence>;
export type RecordDefinitelyUnacceptedInput =
  WithSubmission<DefiniteOutcomeEvidence>;
export type MarkUnknownAfterDeadlineInput = BeginOutboundEmailSubmissionInput;
export type ResolveUnknownAcceptedInput = RecordAcceptedInput;
export type ResolveUnknownDefinitelyUnacceptedInput =
  RecordDefinitelyUnacceptedInput;

export type AttemptOutcomeResult =
  | { status: 'RECORDED'; receipt: OutboundEmailAttemptReceipt }
  | { status: 'EXACT_REPLAY'; receipt: OutboundEmailAttemptReceipt }
  | { status: 'NOT_FOUND' }
  | { status: 'IDENTITY_CONFLICT' }
  | { status: 'INCOMPATIBLE_STATE'; receipt: OutboundEmailAttemptReceipt }
  | { status: 'EVIDENCE_CONFLICT'; receipt: OutboundEmailAttemptReceipt };

export type UnknownAttemptOutcomeResult =
  | AttemptOutcomeResult
  | { status: 'NOT_DUE'; receipt: OutboundEmailAttemptReceipt };

export type BlockReservedAttemptBeforeProviderResult =
  | { status: 'RECORDED'; receipt: OutboundEmailAttemptReceipt }
  | { status: 'EXACT_REPLAY'; receipt: OutboundEmailAttemptReceipt }
  | { status: 'NOT_FOUND' }
  | { status: 'IDENTITY_CONFLICT' }
  | { status: 'NOT_RESERVED' };

type ReceiptOutcomeFields = {
  attemptState: OutboundEmailAttemptState;
  capacityState: OutboundEmailCapacityState;
  finalEvidenceDigest: string | null;
  providerMessageId: string | null;
  providerAcceptedAt: Date | null;
  providerHeaderMessageId?: string | null;
  providerMessageExternalId?: string | null;
  reconciledProviderHeaderMessageId?: string | null;
  providerThreadExternalId?: string | null;
  resolvedThreadExternalId?: string | null;
  providerDeliveredRecipients?: {
    to: string[];
    cc: string[];
    bcc: string[];
  } | null;
  safeOutcomeReason: string | null;
  retryable: boolean | null;
  projectedMessageId: string | null;
  projectedMessageThreadId?: string | null;
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
