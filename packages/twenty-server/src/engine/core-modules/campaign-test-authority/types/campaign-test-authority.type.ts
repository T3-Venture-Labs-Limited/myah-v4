export const CAMPAIGN_TEST_SELECTION_CONSTRAINT_KINDS = [
  'ROTATE',
  'PINNED_REPLY',
] as const;

export type CampaignTestSelectionConstraintKind =
  (typeof CAMPAIGN_TEST_SELECTION_CONSTRAINT_KINDS)[number];

export const CAMPAIGN_TEST_THREAD_SCOPE_KINDS = [
  'NEW_THREAD',
  'PLANNED_PRIOR_STEP',
  'EXISTING_EVIDENCE',
] as const;

export type CampaignTestThreadScopeKind =
  (typeof CAMPAIGN_TEST_THREAD_SCOPE_KINDS)[number];

export type CampaignTestPreparationProof = {
  testPreparationProofId: string;
  confirmationId: string;
  attemptId: string;
  workspaceId: string;
  campaignId: string;
  campaignCreatorId: string;
  workflowVersionId: string;
  messageId: string;
  requesterUserId: string;
  requesterUserWorkspaceId: string;
  normalizedRecipient: string;
  connectedAccountId: string;
  messageChannelId: string;
  provider: string;
  normalizedSenderHandle: string;
  senderPoolFingerprint: string;
  campaignCapacityTimeZone: string;
  selectionConstraintKind: CampaignTestSelectionConstraintKind;
  priorAcceptedEvidenceId: string | null;
  threadScopeKind: CampaignTestThreadScopeKind;
  plannedPriorMessageId: string | null;
  threadEnrollmentId: string | null;
  threadOccurrenceId: string | null;
  renderDigest: string;
  previewDigest: string;
  testTransportDigest: string;
  confirmationIssuedAt: Date;
  reservationEligibleUntil: Date;
  createdAt: Date;
  testSubmissionCapabilityId: string | null;
  finalEvidenceDigest: string | null;
};

export type CreateCampaignTestPreparationProofInput = Omit<
  CampaignTestPreparationProof,
  'createdAt' | 'testSubmissionCapabilityId' | 'finalEvidenceDigest'
>;

export type CampaignTestPreparationProofRequesterScope = Pick<
  CampaignTestPreparationProof,
  | 'workspaceId'
  | 'confirmationId'
  | 'requesterUserId'
  | 'requesterUserWorkspaceId'
>;

export type CampaignTestPreparationProofIdentity = Pick<
  CampaignTestPreparationProof,
  'workspaceId' | 'attemptId' | 'testPreparationProofId'
>;

export type FinalizeCampaignTestPreparationProofInput =
  CampaignTestPreparationProofIdentity &
    Pick<
      CampaignTestPreparationProof,
      'testSubmissionCapabilityId' | 'finalEvidenceDigest'
    > & {
      testSubmissionCapabilityId: string;
      finalEvidenceDigest: string;
    };

export type CampaignTestPreparationProofTransactionFailure = {
  status: 'TRANSACTION_REQUIRED';
};

export type CampaignTestPreparationProofInputFailure = {
  status: 'INVALID_INPUT';
};

export type CampaignTestPreparationProofReadResult =
  | { status: 'FOUND'; proof: CampaignTestPreparationProof }
  | { status: 'NOT_FOUND' }
  | { status: 'INVALID_PERSISTED_PROOF' }
  | CampaignTestPreparationProofInputFailure
  | CampaignTestPreparationProofTransactionFailure;

export type CreateCampaignTestPreparationProofResult =
  | { status: 'CREATED'; proof: CampaignTestPreparationProof }
  | { status: 'EXACT_REPLAY'; proof: CampaignTestPreparationProof }
  | { status: 'IDENTITY_CONFLICT' }
  | { status: 'INVALID_PERSISTED_PROOF' }
  | CampaignTestPreparationProofInputFailure
  | CampaignTestPreparationProofTransactionFailure;

export type FinalizeCampaignTestPreparationProofResult =
  | { status: 'FINALIZED'; proof: CampaignTestPreparationProof }
  | { status: 'EXACT_REPLAY'; proof: CampaignTestPreparationProof }
  | { status: 'FINALIZATION_CONFLICT' }
  | { status: 'NOT_FOUND' }
  | { status: 'INVALID_PERSISTED_PROOF' }
  | CampaignTestPreparationProofInputFailure
  | CampaignTestPreparationProofTransactionFailure;
