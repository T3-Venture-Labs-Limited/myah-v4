import { type EntityManager } from 'typeorm';

// W2 keeps this core leaf unregistered and dependency-neutral. W8 links these
// mirrored persistence shapes to the generated twenty-shared workflow export.
export type CampaignSequenceAuthorizationPreparedProof = Readonly<{
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
  preparedProof: CampaignSequenceAuthorizationPreparedProof;
  reviewedWindow: Readonly<{
    timeZone: string;
    startLocalTime: string;
    endLocalTime: string;
  }>;
  campaignCapacityTimeZone: string;
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

export type CampaignSequenceAuthorizationCurrentProjection = Readonly<{
  schemaVersion: 1;
  authorizationId: string;
  generation: number;
  state: 'ACTIVE' | 'REVOKED';
  workflowVersionId: string;
  preparedFingerprint: string;
  authorizedAt: string;
  revokedAt: string | null;
  revocationReason: 'CAMPAIGN_PAUSED' | 'CAMPAIGN_COMPLETED' | null;
}>;

export type CampaignSequenceAuthorizationTransactionContext = Readonly<{
  manager: EntityManager;
  workspaceId: string;
  campaignId: string;
  lockedCampaign: Readonly<{
    id: string;
    lifecycleStatus: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED';
    currentAuthorityProjection: unknown;
  }>;
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

export type CampaignSequenceAuthorizationStructureResult =
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

export type CampaignSequenceAuthorizationRequestLookupResult =
  | Readonly<{ kind: 'NOT_FOUND' }>
  | Readonly<{
      kind: 'EXACT_MATCH';
      authorization: CampaignSequenceAuthorizationRecord;
    }>
  | Readonly<{ kind: 'IDEMPOTENCY_KEY_CONFLICT' }>;

export type CampaignSequenceAuthorizationKeyLookupResult =
  | Readonly<{ kind: 'NOT_FOUND' }>
  | Readonly<{
      kind: 'FOUND';
      authorization: CampaignSequenceAuthorizationRecord;
    }>;

export type CreateCampaignSequenceAuthorizationResult = Readonly<{
  kind: 'CREATED';
  authorization: CampaignSequenceAuthorizationRecord;
}>;

export type RevokeCampaignSequenceAuthorizationResult =
  | Readonly<{
      kind: 'REVOKED';
      authorization: CampaignSequenceAuthorizationRecord;
    }>
  | Readonly<{
      kind: 'ALREADY_REVOKED';
      authorization: CampaignSequenceAuthorizationRecord;
    }>
  | Readonly<{ kind: 'NO_CURRENT_AUTHORITY' }>;

export type CampaignSequenceAuthorizationServiceDependencies = Readonly<{
  generateAuthorizationId: () => string;
  now: () => Date;
}>;
