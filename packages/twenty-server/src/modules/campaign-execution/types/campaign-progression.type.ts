import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import {
  type CampaignEnrollmentHoldReason,
  type CampaignEnrollmentTerminalReason,
  type CampaignOccurrenceHoldReason,
  type CampaignOccurrenceTerminalReason,
} from 'src/engine/core-modules/campaign-execution/types/campaign-execution-persistence.type';

export type {
  CampaignEnrollmentHoldReason,
  CampaignEnrollmentTerminalReason,
  CampaignOccurrenceHoldReason,
  CampaignOccurrenceTerminalReason,
};

export type CampaignOccurrenceClaimResult =
  | { status: 'RESERVED'; attemptId: string }
  | { status: 'DISPATCHABLE_REPLAY'; attemptId: string }
  | { status: 'NOT_DUE'; nextDueAt: Date }
  | { status: 'ALREADY_CLAIMED' | 'TERMINAL' }
  | {
      status: 'CANCELLED';
      reason: Extract<
        CampaignOccurrenceTerminalReason,
        | 'CAMPAIGN_PAUSED'
        | 'CAMPAIGN_COMPLETED'
        | 'AUTHORIZATION_REVOKED'
        | 'ENROLLMENT_REPLIED'
      >;
    }
  | {
      status: 'EXCLUDED';
      reason: Extract<
        CampaignEnrollmentTerminalReason,
        | 'CREATOR_MISSING'
        | 'CREATOR_DELETED'
        | 'CAMPAIGN_CREATOR_MISSING'
        | 'CAMPAIGN_CREATOR_DELETED'
        | 'INVALID_STAGE'
        | 'NON_EMAIL_CONTACT_METHOD'
        | 'INVALID_EMAIL'
        | 'DUPLICATE_CREATOR_EMAIL'
        | 'SUPPRESSED_EMAIL'
      >;
    }
  | { status: 'HELD'; reason: CampaignOccurrenceHoldReason }
  | { status: 'DEFERRED'; nextDueAt: Date };

export type CampaignProgressionTransitionResult =
  | { status: 'CHANGED' | 'EXACT_REPLAY' }
  | { status: 'STATE_CONFLICT' | 'NOT_FOUND' };

export type CampaignAcceptedProgressionInput = {
  workspaceId: string;
  campaignId: string;
  enrollmentId: string;
  occurrenceId: string;
  attemptId: string;
  campaignCreatorId: string;
  acceptedAuthoredMessageIndex: number;
  acceptedAt: Date;
  nextOccurrence: null | {
    occurrenceId: string;
    workflowVersionId: string;
    messageId: string;
    authoredMessageIndex: number;
    dueAt: Date;
  };
};

export type CampaignAttemptRoutingCoordinate = Readonly<{
  workspaceId: string;
  campaignId: string;
  campaignExecutionId: string;
  authorizationId: string;
  authorizationGeneration: number;
  activationId: string;
  workflowVersionId: string;
  enrollmentId: string;
  occurrenceId: string;
  connectedAccountId: string;
  messageChannelId: string;
  attemptId: string;
}>;

export interface CampaignProgressionPort {
  claimAndReserveDueOccurrenceInTransaction(
    input: {
      workspaceId: string;
      campaignId: string;
      occurrenceId: string;
    },
    manager: WorkspaceEntityManager,
  ): Promise<CampaignOccurrenceClaimResult>;
  reconcileAcceptedInTransaction(
    input: CampaignAttemptRoutingCoordinate,
    manager: WorkspaceEntityManager,
  ): Promise<{
    status:
      | 'PROGRESSED'
      | 'EXACT_REPLAY'
      | 'PROJECTION_PENDING'
      | 'TERMINAL_SUPPRESSED';
  }>;
  reconcileDefinitelyUnacceptedInTransaction(
    input: CampaignAttemptRoutingCoordinate,
    manager: WorkspaceEntityManager,
  ): Promise<{ status: 'HELD' | 'EXACT_REPLAY' }>;
  reconcileUnknownInTransaction(
    input: CampaignAttemptRoutingCoordinate,
    manager: WorkspaceEntityManager,
  ): Promise<{ status: 'UNKNOWN' | 'EXACT_REPLAY' }>;
  cancelBeforeSubmissionInTransaction(
    input: {
      workspaceId: string;
      campaignId: string;
      occurrenceId: string;
      reason: Extract<
        CampaignOccurrenceTerminalReason,
        | 'CAMPAIGN_PAUSED'
        | 'CAMPAIGN_COMPLETED'
        | 'AUTHORIZATION_REVOKED'
        | 'ENROLLMENT_REPLIED'
      >;
    },
    manager: WorkspaceEntityManager,
  ): Promise<{
    status:
      | 'CANCELLED'
      | 'BLOCKED_RESERVED'
      | 'PROCESSING_IN_FLIGHT'
      | 'EXACT_REPLAY';
  }>;
  terminalizeReplyInTransaction(
    input: {
      workspaceId: string;
      campaignId: string;
      enrollmentId: string;
      inboundEvidenceId: string;
    },
    manager: WorkspaceEntityManager,
  ): Promise<{
    status: 'REPLIED' | 'PROCESSING_IN_FLIGHT' | 'EXACT_REPLAY';
  }>;
  tryCompleteCampaignInTransaction(
    input: { workspaceId: string; campaignId: string },
    manager: WorkspaceEntityManager,
  ): Promise<{ status: 'COMPLETED' | 'NOT_COMPLETE' | 'EXACT_REPLAY' }>;
}
