import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  Unique,
} from 'typeorm';

import {
  type CampaignTestSelectionConstraintKind,
  type CampaignTestThreadScopeKind,
} from 'src/engine/core-modules/campaign-test-authority/types/campaign-test-authority.type';

@Index('UQ_CTP_SUBMISSION_CAPABILITY', ['testSubmissionCapabilityId'], {
  unique: true,
  where: '"testSubmissionCapabilityId" IS NOT NULL',
})
@Unique('UQ_CTP_CONFIRMATION', ['confirmationId'])
@Unique('UQ_CTP_ATTEMPT', ['attemptId'])
@Unique('UQ_CTP_SCOPE_ATTEMPT_PROOF', [
  'workspaceId',
  'attemptId',
  'testPreparationProofId',
])
@Check(
  'CHK_CTP_SELECTION_SHAPE',
  `(
    (
      "selectionConstraintKind" = 'ROTATE'
      AND "priorAcceptedEvidenceId" IS NULL
      AND "threadScopeKind" IN ('NEW_THREAD', 'PLANNED_PRIOR_STEP')
    ) OR (
      "selectionConstraintKind" = 'PINNED_REPLY'
      AND "priorAcceptedEvidenceId" IS NOT NULL
      AND "threadScopeKind" = 'EXISTING_EVIDENCE'
    )
  )`,
)
@Check(
  'CHK_CTP_THREAD_SCOPE_SHAPE',
  `(
    (
      "threadScopeKind" = 'NEW_THREAD'
      AND "plannedPriorMessageId" IS NULL
      AND "threadEnrollmentId" IS NULL
      AND "threadOccurrenceId" IS NULL
    ) OR (
      "threadScopeKind" = 'PLANNED_PRIOR_STEP'
      AND "plannedPriorMessageId" IS NOT NULL
      AND "threadEnrollmentId" IS NULL
      AND "threadOccurrenceId" IS NULL
    ) OR (
      "threadScopeKind" = 'EXISTING_EVIDENCE'
      AND "plannedPriorMessageId" IS NULL
      AND "threadEnrollmentId" IS NOT NULL
      AND "threadOccurrenceId" IS NOT NULL
      AND "priorAcceptedEvidenceId" IS NOT NULL
    )
  )`,
)
@Check(
  'CHK_CTP_FINALIZATION_PAIR',
  `(
    ("testSubmissionCapabilityId" IS NULL AND "finalEvidenceDigest" IS NULL)
    OR
    ("testSubmissionCapabilityId" IS NOT NULL AND "finalEvidenceDigest" IS NOT NULL)
  )`,
)
@Check(
  'CHK_CTP_RESERVATION_EXPIRY',
  '"reservationEligibleUntil" > "confirmationIssuedAt"',
)
@Check(
  'CHK_CTP_DIGEST_SHAPES',
  `(
    "renderDigest" ~ '^[0-9a-f]{64}$'
    AND "previewDigest" ~ '^[0-9a-f]{64}$'
    AND "testTransportDigest" ~ '^[0-9a-f]{64}$'
    AND (
      "finalEvidenceDigest" IS NULL
      OR "finalEvidenceDigest" ~ '^[0-9a-f]{64}$'
    )
  )`,
)
@Check(
  'CHK_CTP_TEXT_SHAPES',
  `(
    btrim("provider") <> ''
    AND btrim("normalizedSenderHandle") <> ''
    AND btrim("normalizedRecipient") <> ''
    AND btrim("senderPoolFingerprint") <> ''
    AND btrim("campaignCapacityTimeZone") <> ''
  )`,
)
@Entity({ name: 'campaignTestPreparationProof', schema: 'core' })
export class CampaignTestPreparationProofEntity {
  @PrimaryColumn({
    primaryKeyConstraintName: 'PK_CAMPAIGN_TEST_PREPARATION_PROOF',
    type: 'uuid',
    update: false,
  })
  testPreparationProofId: string;

  @Column({ type: 'uuid', update: false })
  confirmationId: string;

  @Column({ type: 'uuid', update: false })
  attemptId: string;

  @Column({ type: 'uuid', update: false })
  workspaceId: string;

  @Column({ type: 'uuid', update: false })
  campaignId: string;

  @Column({ type: 'uuid', update: false })
  campaignCreatorId: string;

  @Column({ type: 'uuid', update: false })
  workflowVersionId: string;

  @Column({ type: 'uuid', update: false })
  messageId: string;

  @Column({ type: 'uuid', update: false })
  requesterUserId: string;

  @Column({ type: 'uuid', update: false })
  requesterUserWorkspaceId: string;

  @Column({ type: 'text', update: false })
  normalizedRecipient: string;

  @Column({ type: 'uuid', update: false })
  connectedAccountId: string;

  @Column({ type: 'uuid', update: false })
  messageChannelId: string;

  @Column({ type: 'text', update: false })
  provider: string;

  @Column({ type: 'text', update: false })
  normalizedSenderHandle: string;

  @Column({ type: 'text', update: false })
  senderPoolFingerprint: string;

  @Column({ type: 'text', update: false })
  campaignCapacityTimeZone: string;

  @Column({ type: 'text', update: false })
  selectionConstraintKind: CampaignTestSelectionConstraintKind;

  @Column({ nullable: true, type: 'uuid', update: false })
  priorAcceptedEvidenceId: string | null;

  @Column({ type: 'text', update: false })
  threadScopeKind: CampaignTestThreadScopeKind;

  @Column({ nullable: true, type: 'uuid', update: false })
  plannedPriorMessageId: string | null;

  @Column({ nullable: true, type: 'uuid', update: false })
  threadEnrollmentId: string | null;

  @Column({ nullable: true, type: 'uuid', update: false })
  threadOccurrenceId: string | null;

  @Column({ type: 'text', update: false })
  renderDigest: string;

  @Column({ type: 'text', update: false })
  previewDigest: string;

  @Column({ type: 'text', update: false })
  testTransportDigest: string;

  @Column({ type: 'timestamptz', update: false })
  confirmationIssuedAt: Date;

  @Column({ type: 'timestamptz', update: false })
  reservationEligibleUntil: Date;

  @CreateDateColumn({ type: 'timestamptz', update: false })
  createdAt: Date;

  @Column({ nullable: true, type: 'uuid', update: true })
  testSubmissionCapabilityId: string | null;

  @Column({ nullable: true, type: 'text', update: true })
  finalEvidenceDigest: string | null;
}
