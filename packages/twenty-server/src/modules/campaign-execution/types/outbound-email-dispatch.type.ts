import { type EntityManager } from 'typeorm';

import { type ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import {
  type BeginOutboundEmailSubmissionInput,
  type CampaignSequenceSubmissionInput,
  type CampaignTestSubmissionInput,
  type DirectSubmissionInput,
  type OutboundEmailAttemptReceipt,
} from 'src/modules/campaign-execution/types/outbound-email-attempt.type';
import { type SendMessageInput } from 'src/modules/messaging/message-outbound-manager/types/send-message-input.type';

export type TrustedOutboundEmailTransportMaterial = {
  connectedAccount: ConnectedAccountEntity;
  sendMessageInput: SendMessageInput;
  // This is a canonical workspace Message UUID, never an RFC Message-ID.
  projectedMessageId: string | null;
};

export type DispatchTrustedOutboundEmailInput =
  | {
      kind: 'CAMPAIGN_SEQUENCE_FINAL';
      material: TrustedOutboundEmailTransportMaterial;
      submission: CampaignSequenceSubmissionInput;
    }
  | {
      kind: 'CAMPAIGN_TEST_FINAL';
      material: TrustedOutboundEmailTransportMaterial;
      submission: CampaignTestSubmissionInput;
    }
  | {
      kind: 'DIRECT_FINAL';
      material: TrustedOutboundEmailTransportMaterial;
      submission: DirectSubmissionInput;
    };

export type FinalSubmissionAuthorityRejectionReason =
  | 'DENIED'
  | 'STALE'
  | 'SUPPRESSED';

export type FinalSubmissionAuthorityRevalidationResult =
  | {
      status: 'AUTHORIZED';
      submission: BeginOutboundEmailSubmissionInput;
      // Confirms, but may not replace, the requested trusted projection evidence.
      projectedMessageId: string | null;
    }
  | {
      status: 'REJECTED';
      reason: FinalSubmissionAuthorityRejectionReason;
    };

export type FinalSubmissionAuthorityRevalidator = {
  revalidate(
    input: {
      kind: DispatchTrustedOutboundEmailInput['kind'];
      submission: BeginOutboundEmailSubmissionInput;
    },
    manager: EntityManager,
  ): Promise<FinalSubmissionAuthorityRevalidationResult>;
};

export type OutboundEmailDispatchTransactionPort = {
  runInTransaction<Result>(
    work: (manager: EntityManager) => Promise<Result>,
  ): Promise<Result>;
};

/**
 * Reports finite elapsed milliseconds from one monotonic time domain and must
 * continue advancing across suspension for the complete measured interval.
 * Selection of a concrete runtime clock is intentionally outside this slice.
 */
export type SuspendAwareMonotonicClock = {
  now(): number;
};

export type AcceptedOutboundEmailRecoveryEvidence = {
  kind: 'ACCEPTED_EVIDENCE';
  submission: BeginOutboundEmailSubmissionInput;
  providerMessageId: string;
  projectedMessageId: string | null;
};

export type DefinitelyUnacceptedOutboundEmailRecoveryEvidence = {
  kind: 'DEFINITELY_UNACCEPTED_EVIDENCE';
  submission: BeginOutboundEmailSubmissionInput;
  safeOutcomeReason:
    | 'DEFINITELY_UNACCEPTED_RETRYABLE'
    | 'DEFINITELY_UNACCEPTED_NON_RETRYABLE';
};

export type AmbiguousOutboundEmailRecoveryEvidence = {
  kind: 'AMBIGUOUS_EVIDENCE';
  submission: BeginOutboundEmailSubmissionInput;
};

export type UnpersistableAcceptanceEvidence = {
  kind: 'UNPERSISTABLE_ACCEPTANCE_EVIDENCE';
  attemptId: string;
  workspaceId: string;
  source: BeginOutboundEmailSubmissionInput['source'];
};

export type RecoverOutboundEmailOutcomeInput =
  | AcceptedOutboundEmailRecoveryEvidence
  | DefinitelyUnacceptedOutboundEmailRecoveryEvidence
  | AmbiguousOutboundEmailRecoveryEvidence;

export type OutboundEmailDispatchResult =
  | { status: 'ACCEPTED_RECORDED'; receipt: OutboundEmailAttemptReceipt }
  | {
      status: 'DEFINITELY_UNACCEPTED_RECORDED';
      receipt: OutboundEmailAttemptReceipt;
    }
  | { status: 'UNKNOWN_RECORDED'; receipt: OutboundEmailAttemptReceipt }
  | {
      status: 'UNKNOWN_PENDING_DEADLINE';
      evidence: AmbiguousOutboundEmailRecoveryEvidence;
    }
  | {
      status: 'OUTCOME_RECOVERY_REQUIRED';
      severity: 'HIGH';
      evidence:
        | AcceptedOutboundEmailRecoveryEvidence
        | DefinitelyUnacceptedOutboundEmailRecoveryEvidence
        | AmbiguousOutboundEmailRecoveryEvidence
        | UnpersistableAcceptanceEvidence;
    }
  | {
      status: 'NOT_PROCESSING_WINNER';
      receipt: OutboundEmailAttemptReceipt;
    }
  | {
      status: 'RESERVATION_WINDOW_EXPIRED';
      receipt: OutboundEmailAttemptReceipt;
    }
  | {
      status: 'AUTHORITY_REJECTED';
      reason: FinalSubmissionAuthorityRejectionReason;
    }
  | {
      status: 'BLOCKED';
      reason:
        | 'INVALID_IMAP_SMTP_TRANSPORT_MATERIAL'
        | 'INVALID_RESERVATION_BINDING';
    }
  | { status: 'CONTRACT_CONFLICT' };
