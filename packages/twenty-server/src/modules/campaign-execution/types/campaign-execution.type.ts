import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { type LockedCampaignLifecycleContext } from 'src/modules/campaign-execution/types/campaign-lifecycle-transaction.type';
import {
  type CampaignProgressionHistoryResult,
  type CampaignProgressionHistoryScope,
} from 'src/modules/campaign-execution/types/campaign-progression-history-reader.type';

export type CampaignLifecycleState =
  | 'DRAFT'
  | 'ACTIVE'
  | 'PAUSED'
  | 'COMPLETED';

export type CampaignSendingWindow = Readonly<{
  timeZone: string;
  startLocalTime: string;
  endLocalTime: string;
}>;

export type CampaignSequencePreparedProof = Readonly<{
  kind: 'PREPARED';
  workspaceId: string;
  campaignId: string;
  workflowId: string;
  workflowVersionId: string;
  initiatingUserWorkspaceId: string;
  initiatingUserId: string;
  initiatingWorkspaceMemberId: string;
  orderedMessageIds: readonly string[];
  usedChannels: readonly ['EMAIL'];
  sequenceDigest: string;
  fixedMaterialDigest: string;
  senderAuthorityDigest: string;
  preparedFingerprint: string;
  signatureDigest: string | null;
  fixedMaterialProofs: readonly Readonly<{
    messageId: string;
    orderedAttachmentProofs: readonly Readonly<{
      fileId: string;
      filename: string;
      contentType: string;
      size: number;
      contentDigest: string;
    }>[];
  }>[];
  senderPoolFingerprint: string;
  senderPoolSerializationRevision: string;
  senderPoolRotationPolicyId: string;
}>;

export type CampaignSequenceAuthorizationRequest = Readonly<{
  preparedProof: CampaignSequencePreparedProof;
  reviewedWindow: CampaignSendingWindow;
  campaignCapacityTimeZone: string;
}>;

export type CampaignExecutionScopeInput = Readonly<{
  workspaceId: string;
  campaignId: string;
  authContext: WorkspaceAuthContext;
}>;

/** Internal server-composed input; this is not a public/GraphQL DTO. */
export type StartCampaignInput = CampaignExecutionScopeInput &
  Readonly<{
    startIdempotencyKey: string;
    request: CampaignSequenceAuthorizationRequest;
  }>;

export type UpdateCampaignSendingWindowInput = CampaignExecutionScopeInput &
  Readonly<{
    window: CampaignSendingWindow;
  }>;

export type CampaignActivationResult = Readonly<{
  campaignExecutionId: string;
  activationId: string;
  authorizationId: string;
  authorizationGeneration: number;
  workflowVersionId: string;
  activatedAt: string;
  lifecycleStatus: 'ACTIVE';
  createdEnrollmentCount: number;
  createdOccurrenceCount: number;
}>;

export type StartCampaignResult =
  | Readonly<{
      status: 'ACTIVATED';
      mayActivate: true;
      activation: CampaignActivationResult;
    }>
  | Readonly<{
      status: 'REPLAYED';
      mayActivate: boolean;
      activation: CampaignActivationResult;
    }>
  | Readonly<{
      status: 'BLOCKED';
      reason:
        | 'INCONSISTENT_CURRENT_AUTHORITY'
        | 'IDEMPOTENCY_KEY_CONFLICT'
        | 'CAMPAIGN_ALREADY_ACTIVE'
        | 'CAMPAIGN_COMPLETED'
        | 'CHANGED_WORKFLOW_VERSION_UNMAPPED'
        | 'MISSING_SENDING_WINDOW'
        | 'WORKSPACE_CAPACITY_TIMEZONE_UNAVAILABLE'
        | 'SEQUENCE_UNAVAILABLE'
        | 'CURRENT_REVIEW_INVALID'
        | 'PROGRESSION_HISTORY_UNAVAILABLE';
    }>;

export type PauseCampaignResult =
  | Readonly<{
      status: 'PAUSED';
      changed: boolean;
      campaignExecutionId: string;
      lifecycleStatus: 'PAUSED';
      inFlightCount: number;
    }>
  | Readonly<{
      status: 'BLOCKED';
      reason:
        | 'INVALID_LIFECYCLE_TRANSITION'
        | 'INCONSISTENT_CURRENT_AUTHORITY'
        | 'MISSING_EXECUTION';
    }>;

export type CompleteCampaignResult =
  | Readonly<{
      status: 'COMPLETED';
      changed: boolean;
      campaignExecutionId: string;
      lifecycleStatus: 'COMPLETED';
    }>
  | Readonly<{
      status: 'BLOCKED';
      reason:
        | 'INVALID_LIFECYCLE_TRANSITION'
        | 'INCONSISTENT_CURRENT_AUTHORITY'
        | 'MISSING_EXECUTION';
    }>;

export type UpdateCampaignSendingWindowResult =
  | Readonly<{
      status: 'UPDATED' | 'UNCHANGED';
      createdExecution: boolean;
      campaignExecutionId: string;
      window: CampaignSendingWindow;
    }>
  | Readonly<{
      status: 'BLOCKED';
      reason:
        | 'INVALID_LIFECYCLE_TRANSITION'
        | 'WORKSPACE_CAPACITY_TIMEZONE_UNAVAILABLE';
    }>;

export type CampaignExecutionRecord = Readonly<{
  campaignExecutionId: string;
  workspaceId: string;
  campaignId: string;
  window: CampaignSendingWindow;
  campaignCapacityTimeZone: string | null;
}>;

export type CampaignActivationRecord = Readonly<{
  workspaceId: string;
  campaignId: string;
  campaignExecutionId: string;
  activationId: string;
  authorizationId: string;
  authorizationGeneration: number;
  workflowVersionId: string;
  activatedAt: string;
  createdEnrollmentCount: number;
  createdOccurrenceCount: number;
}>;

export type CampaignSequenceAuthorizationBinding = Readonly<{
  schemaVersion: 1;
  authorizationId: string;
  generation: number;
  startIdempotencyKey: string;
  workspaceId: string;
  campaignId: string;
  campaignExecutionId: string;
  workflowVersionId: string;
  request: CampaignSequenceAuthorizationRequest;
  futureEligibleCampaignCreatorsAuthorized: true;
  authorizedAt: string;
}>;

export type CampaignSequenceAuthorizationRecord = Readonly<{
  authorizationId: string;
  workspaceId: string;
  campaignId: string;
  campaignExecutionId: string;
  generation: number;
  startIdempotencyKey: string;
  preparedFingerprint: string;
  workflowId: string;
  workflowVersionId: string;
  initiatingUserWorkspaceId: string;
  state: 'ACTIVE' | 'REVOKED';
  authorizedAt: string;
  revokedAt: string | null;
  revocationReason: 'CAMPAIGN_PAUSED' | 'CAMPAIGN_COMPLETED' | null;
  binding: CampaignSequenceAuthorizationBinding;
  createdAt: string;
  updatedAt: string;
}>;

export type CampaignSequenceAuthorityStructureResult =
  | Readonly<{ kind: 'NO_CURRENT_AUTHORITY' }>
  | Readonly<{
      kind: 'CURRENT_ACTIVE';
      authorization: CampaignSequenceAuthorizationRecord;
    }>
  | Readonly<{
      kind: 'CURRENT_REVOKED';
      authorization: CampaignSequenceAuthorizationRecord;
    }>
  | Readonly<{
      kind: 'INCONSISTENT_CURRENT_AUTHORITY';
      blockerCode: string;
    }>;

export type CampaignSequenceAuthorityLookupResult =
  | Readonly<{ kind: 'NOT_FOUND' }>
  | Readonly<{
      kind: 'EXACT_MATCH';
      authorization: CampaignSequenceAuthorizationRecord;
    }>
  | Readonly<{ kind: 'IDEMPOTENCY_KEY_CONFLICT' }>;

export type CampaignSequenceAuthorityCreateResult = Readonly<{
  kind: 'CREATED';
  authorization: CampaignSequenceAuthorizationRecord;
}>;

export type CampaignSequenceAuthorityRevokeResult =
  | Readonly<{
      kind: 'REVOKED' | 'ALREADY_REVOKED';
      authorization: CampaignSequenceAuthorizationRecord;
    }>
  | Readonly<{ kind: 'NO_CURRENT_AUTHORITY' }>;

export type CampaignSequenceAuthorityTransactionContext = Readonly<{
  manager: WorkspaceEntityManager;
  workspaceId: string;
  campaignId: string;
  lockedCampaign: Readonly<{
    id: string;
    lifecycleStatus: CampaignLifecycleState;
    currentAuthorityProjection: unknown;
  }>;
}>;

export type CampaignSequenceExecutionPlanNode =
  | Readonly<{
      messageId: string;
      channel: 'EMAIL';
      replyToThread: boolean;
    }>
  | Readonly<{
      messageId: string;
      channel: 'INSTAGRAM';
    }>;

export type CampaignSequenceExecutionPlan = Readonly<{
  kind: 'READY';
  workspaceId: string;
  campaignId: string;
  workflowId: string;
  workflowVersionId: string;
  nodes: readonly CampaignSequenceExecutionPlanNode[];
  delaysSeconds: readonly number[];
}>;

export type CampaignSequenceExecutionPlanResult =
  | CampaignSequenceExecutionPlan
  | Readonly<{
      kind: 'BLOCKED_SEQUENCE_INVALID';
      issues: readonly unknown[];
    }>
  | Readonly<{
      kind: 'BLOCKED_DEPENDENCY_INTEGRITY';
      reason:
        | 'CAMPAIGN_NOT_FOUND'
        | 'WORKFLOW_NOT_FOUND'
        | 'WORKFLOW_VERSION_NOT_FOUND'
        | 'WORKFLOW_VERSION_NOT_CURRENT_ACTIVE'
        | 'SEQUENCE_NOT_AUTHORED'
        | 'SEQUENCE_MALFORMED';
    }>;

export type CampaignEligibleCreator = Readonly<{
  campaignCreatorId: string;
  creatorId: string;
  usableMessageIds: readonly string[];
}>;

export type CampaignNewActivationReviewResult =
  | Readonly<{
      status: 'READY';
      eligibleCreators: readonly CampaignEligibleCreator[];
    }>
  | Readonly<{
      status: 'BLOCKED';
      reason: string;
    }>;

export type CampaignEnrollmentState =
  | 'ACTIVE'
  | 'REPLIED'
  | 'EXCLUDED'
  | 'FINISHED';

export type CampaignOccurrenceState =
  | 'PENDING'
  | 'IN_FLIGHT'
  | 'SUCCEEDED'
  | 'SKIPPED'
  | 'HELD'
  | 'UNKNOWN'
  | 'CANCELLED';

export type CampaignPlannedEnrollment = Readonly<{
  enrollmentId: string;
  workspaceId: string;
  campaignId: string;
  campaignExecutionId: string;
  authorizationId: string;
  authorizationGeneration: number;
  campaignCreatorId: string;
  creatorId: string;
  authoredMessageCount: number;
  nextAuthoredMessageIndex: number;
  state: 'ACTIVE' | 'FINISHED';
  terminalReason: 'NO_USABLE_AUTHORED_MESSAGE' | null;
  terminalAt: string | null;
  enrolledAt: string;
  occurrence: CampaignPlannedOccurrence | null;
}>;

export type CampaignPlannedOccurrence = Readonly<{
  occurrenceId: string;
  workspaceId: string;
  campaignId: string;
  enrollmentId: string;
  workflowVersionId: string;
  messageId: string;
  authoredMessageIndex: number;
  state: 'PENDING';
  dueAt: string;
}>;

export type CampaignActivationGraph = Readonly<{
  activation: CampaignActivationRecord;
  enrollments: readonly CampaignPlannedEnrollment[];
}>;

/**
 * Local W6 mirror of the accepted MYAH-321 four-method participant. The later
 * W7/W15 adapter must delegate to the immutable accepted source. It is DB-only,
 * uses only the supplied manager, and cannot control/retain the transaction or
 * perform provider, cache, event, file, queue, or network I/O.
 */
export interface CampaignSequenceAuthorityPort {
  inspectCurrentAuthorityInTransaction(
    context: CampaignSequenceAuthorityTransactionContext,
  ): Promise<CampaignSequenceAuthorityStructureResult>;

  lookupStartRequestInTransaction(
    context: CampaignSequenceAuthorityTransactionContext,
    input: Readonly<{
      startIdempotencyKey: string;
      request: CampaignSequenceAuthorizationRequest;
    }>,
  ): Promise<CampaignSequenceAuthorityLookupResult>;

  createNewAuthorizationInTransaction(
    context: CampaignSequenceAuthorityTransactionContext,
    input: Readonly<{
      startIdempotencyKey: string;
      campaignExecutionId: string;
      request: CampaignSequenceAuthorizationRequest;
    }>,
  ): Promise<CampaignSequenceAuthorityCreateResult>;

  revokeCurrentAuthorizationInTransaction(
    context: CampaignSequenceAuthorityTransactionContext,
    input: Readonly<{
      reason: 'CAMPAIGN_PAUSED' | 'CAMPAIGN_COMPLETED';
    }>,
  ): Promise<CampaignSequenceAuthorityRevokeResult>;
}

/**
 * Local W6 mirror of the accepted MYAH-319 supplied-manager reader. It uses
 * only the exact active manager, takes no locks, writes nothing, opens/switches
 * no context/transaction/repository, and performs no event, file, provider,
 * queue, or network I/O.
 */
export interface CampaignExecutionPlanReaderPort {
  loadExecutionPlanInTransaction(
    input: Readonly<{
      workspaceId: string;
      campaignId: string;
      workflowVersionId: string;
    }>,
    manager: WorkspaceEntityManager,
  ): Promise<CampaignSequenceExecutionPlanResult>;
}

/**
 * Local W6 mirror of the accepted WTZ-B supplied-manager reader. The future
 * adapter delegates to that reviewed leaf with the exact active manager and
 * cannot substitute a fallback or caller-provided timezone.
 */
export interface CampaignCapacityTimeZoneReaderPort {
  readCampaignCapacityTimeZoneInTransaction(
    input: Readonly<{ workspaceId: string }>,
    manager: WorkspaceEntityManager,
  ): Promise<
    | Readonly<{
        status: 'CONFIGURED';
        campaignCapacityTimeZone: string;
      }>
    | Readonly<{
        status: 'BLOCKED';
        reason:
          | 'WORKSPACE_SCOPE_UNAVAILABLE'
          | 'NOT_CONFIGURED'
          | 'INVALID_STORED_TIME_ZONE';
      }>
  >;
}

/**
 * DB-only current-proof, exact-window, sender-pool and Creator eligibility
 * revalidator. It uses only the supplied locked context/manager, must not
 * switch or retain transaction/context/repository state, and performs no
 * cache, provider, event, file, queue, or network I/O. It returns no due
 * times, IDs, history, authority, or writes.
 */
export interface CampaignNewActivationReviewPort {
  revalidateNewActivationInTransaction(
    input: Readonly<{
      context: LockedCampaignLifecycleContext;
      execution: CampaignExecutionRecord;
      request: CampaignSequenceAuthorizationRequest;
      plan: CampaignSequenceExecutionPlan;
      campaignCapacityTimeZone: string;
    }>,
  ): Promise<CampaignNewActivationReviewResult>;
}

/**
 * DB-only persistence participant. `createActivationGraphInTransaction` owns no
 * planning or authority: it must insert the immutable activation with final
 * counts, CAS Campaign lifecycle, create/reuse enrollment identity by exact
 * `(workspaceId, campaignId, authorizationId, creatorId)` while preserving
 * immutable first-admission `campaignCreatorId` and terminal stickiness,
 * insert enrollments in Creator order, insert at most one occurrence per
 * enrollment, and validate exact created identities/counts against the
 * activation. Every method uses only the exact supplied locked
 * context/manager; it must not open, switch, nest, retry, or retain a
 * transaction/query runner/context/repository and performs no cache, provider,
 * event, file, queue, network, rendering, attachment, or filesystem I/O.
 */
export interface CampaignExecutionPersistencePort {
  loadExecutionInTransaction(
    context: LockedCampaignLifecycleContext,
  ): Promise<CampaignExecutionRecord | null>;

  loadActivationByAuthorizationInTransaction(
    context: LockedCampaignLifecycleContext,
    authorizationId: string,
  ): Promise<CampaignActivationRecord | null>;

  writeSendingWindowInTransaction(
    context: LockedCampaignLifecycleContext,
    input: Readonly<{
      window: CampaignSendingWindow;
      campaignCapacityTimeZone: string;
    }>,
  ): Promise<
    Readonly<{
      status: 'UPDATED' | 'UNCHANGED';
      createdExecution: boolean;
      execution: CampaignExecutionRecord;
    }>
  >;

  createActivationGraphInTransaction(
    context: LockedCampaignLifecycleContext,
    graph: CampaignActivationGraph,
  ): Promise<CampaignActivationGraph>;

  transitionLifecycleInTransaction(
    context: LockedCampaignLifecycleContext,
    input: Readonly<{
      from: 'ACTIVE' | 'PAUSED';
      to: 'PAUSED' | 'COMPLETED';
    }>,
  ): Promise<void>;

  countInFlightAttemptsInTransaction(
    context: LockedCampaignLifecycleContext,
  ): Promise<number>;
}

/**
 * Existing W5 same-manager exact-version history contract consumed through
 * injection; no inference, fallback timing, cross-version mapping, or I/O is
 * permitted.
 */
export interface CampaignExecutionHistoryPort {
  readSameWorkflowVersionHistoryInTransaction(
    input: CampaignProgressionHistoryScope,
    manager: WorkspaceEntityManager,
  ): Promise<CampaignProgressionHistoryResult>;
}

/** Pure deterministic window adjustment; no clock, transaction, or I/O. */
export interface CampaignInitialDueTimePort {
  adjustInitialDueAt(
    input: Readonly<{
      anchorAt: string;
      delaySeconds: number;
      window: CampaignSendingWindow;
    }>,
  ): string;
}

/** Server-only identity source; operation callers cannot provide durable IDs. */
export interface CampaignExecutionIdentityPort {
  generateActivationId(): string;
  generateEnrollmentId(): string;
  generateOccurrenceId(): string;
}
