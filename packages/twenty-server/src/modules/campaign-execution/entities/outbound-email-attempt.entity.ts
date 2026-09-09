import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

import {
  type OutboundEmailAttemptSource,
  type OutboundEmailAttemptState,
  type OutboundEmailCapacityState,
  type OutboundEmailSelectionConstraintKind,
} from 'src/modules/campaign-execution/types/outbound-email-attempt.type';

@Index(
  'IDX_OUTBOUND_EMAIL_ATTEMPT_RECONCILIATION',
  ['attemptState', 'unknownAfter'],
  { where: "\"attemptState\" IN ('PROCESSING', 'UNKNOWN')" },
)
@Index(
  'UQ_OUTBOUND_EMAIL_ATTEMPT_ACCEPTED_OCCURRENCE',
  ['workspaceId', 'occurrenceId'],
  {
    unique: true,
    where: '"source" = \'CAMPAIGN_SEQUENCE\' AND "attemptState" = \'ACCEPTED\'',
  },
)
@Index(
  'UQ_OUTBOUND_EMAIL_ATTEMPT_UNRESOLVED_OCCURRENCE',
  ['workspaceId', 'occurrenceId'],
  {
    unique: true,
    where:
      "\"source\" = 'CAMPAIGN_SEQUENCE' AND \"attemptState\" IN ('RESERVED', 'PROCESSING', 'UNKNOWN')",
  },
)
@Index(
  'UQ_OUTBOUND_EMAIL_ATTEMPT_OCCURRENCE_NUMBER',
  ['workspaceId', 'occurrenceId', 'attemptNumber'],
  { unique: true, where: '"source" = \'CAMPAIGN_SEQUENCE\'' },
)
@Index(
  'UQ_OUTBOUND_EMAIL_ATTEMPT_PROJECTED_MESSAGE',
  ['workspaceId', 'projectedMessageId'],
  { unique: true, where: '"projectedMessageId" IS NOT NULL' },
)
@Index(
  'UQ_OUTBOUND_EMAIL_ATTEMPT_PROVIDER_MESSAGE',
  ['workspaceId', 'connectedAccountId', 'provider', 'providerMessageId'],
  { unique: true, where: '"providerMessageId" IS NOT NULL' },
)
@Check(
  'CHK_OUTBOUND_EMAIL_ATTEMPT_SELECTION_EVIDENCE',
  `(
    ("selectionConstraintKind" = 'PINNED_REPLY' AND "priorAcceptedEvidenceId" IS NOT NULL)
    OR
    ("selectionConstraintKind" IN ('ROTATE', 'EXPLICIT') AND "priorAcceptedEvidenceId" IS NULL)
  )`,
)
@Check(
  'CHK_OUTBOUND_EMAIL_ATTEMPT_UNKNOWN_AFTER',
  `"unknownAfter" = "claimedAt" + interval '60 seconds'`,
)
@Check(
  'CHK_OUTBOUND_EMAIL_ATTEMPT_STATE_CAPACITY_SHAPE',
  `(
    ("attemptState" IN ('RESERVED', 'PROCESSING') AND "capacityState" = 'RESERVED')
    OR ("attemptState" = 'BLOCKED' AND "capacityState" = 'RELEASED')
    OR ("attemptState" = 'ACCEPTED' AND "capacityState" = 'CONSUMED')
    OR ("attemptState" = 'DEFINITELY_UNACCEPTED' AND "capacityState" = 'RELEASED')
    OR ("attemptState" = 'UNKNOWN' AND "capacityState" = 'PROVISIONAL_UNKNOWN')
  )`,
)
@Check(
  'CHK_OUTBOUND_EMAIL_ATTEMPT_SOURCE_SHAPE',
  `(
    (
      "source" = 'CAMPAIGN_SEQUENCE'
      AND "selectionConstraintKind" IN ('ROTATE', 'PINNED_REPLY')
      AND "campaignId" IS NOT NULL
      AND "enrollmentId" IS NOT NULL
      AND "occurrenceId" IS NOT NULL
      AND "authorizationId" IS NOT NULL
      AND "workflowVersionId" IS NOT NULL
      AND "messageId" IS NOT NULL
      AND "attemptNumber" IS NOT NULL
      AND "attemptNumber" > 0
      AND "renderDigest" IS NOT NULL
      AND "senderPoolFingerprint" IS NOT NULL
      AND "testPreparationProofId" IS NULL
      AND "requesterUserWorkspaceId" IS NULL
      AND "previewDigest" IS NULL
      AND "testTransportDigest" IS NULL
      AND "directReservationCapabilityId" IS NULL
    ) OR (
      "source" = 'CAMPAIGN_TEST'
      AND "selectionConstraintKind" IN ('ROTATE', 'PINNED_REPLY')
      AND "campaignId" IS NOT NULL
      AND "workflowVersionId" IS NOT NULL
      AND "messageId" IS NOT NULL
      AND "testPreparationProofId" IS NOT NULL
      AND "requesterUserWorkspaceId" IS NOT NULL
      AND "renderDigest" IS NOT NULL
      AND "previewDigest" IS NOT NULL
      AND "testTransportDigest" IS NOT NULL
      AND "senderPoolFingerprint" IS NOT NULL
      AND "enrollmentId" IS NULL
      AND "occurrenceId" IS NULL
      AND "authorizationId" IS NULL
      AND "attemptNumber" IS NULL
      AND "directReservationCapabilityId" IS NULL
    ) OR (
      "source" IN ('INBOX', 'AUTOMATED_REPLY')
      AND "directReservationCapabilityId" IS NOT NULL
      AND "selectionConstraintKind" IN ('PINNED_REPLY', 'EXPLICIT')
      AND "campaignId" IS NULL
      AND "enrollmentId" IS NULL
      AND "occurrenceId" IS NULL
      AND "authorizationId" IS NULL
      AND "workflowVersionId" IS NULL
      AND "messageId" IS NULL
      AND "attemptNumber" IS NULL
      AND "renderDigest" IS NULL
      AND "testPreparationProofId" IS NULL
      AND "requesterUserWorkspaceId" IS NULL
      AND "previewDigest" IS NULL
      AND "testTransportDigest" IS NULL
      AND "senderPoolFingerprint" IS NULL
    )
  )`,
)
@Entity({ name: 'outboundEmailAttempt', schema: 'core' })
export class OutboundEmailAttemptEntity {
  @PrimaryColumn({ type: 'uuid' })
  attemptId: string;

  @Column({ nullable: false, type: 'uuid' })
  workspaceId: string;

  @Column({ nullable: false, type: 'text' })
  source: OutboundEmailAttemptSource;

  @Column({ nullable: false, type: 'text' })
  attemptState: OutboundEmailAttemptState;

  @Column({ nullable: false, type: 'text' })
  capacityState: OutboundEmailCapacityState;

  @Column({ nullable: false, type: 'uuid' })
  connectedAccountId: string;

  @Column({ nullable: false, type: 'uuid' })
  messageChannelId: string;

  @Column({ nullable: false, type: 'text' })
  provider: string;

  @Column({ nullable: false, type: 'text' })
  normalizedSenderHandle: string;

  @Column({ nullable: false, type: 'text' })
  normalizedRecipient: string;

  @Column({ nullable: false, type: 'text' })
  selectionConstraintKind: OutboundEmailSelectionConstraintKind;

  @Column({ nullable: true, type: 'uuid' })
  priorAcceptedEvidenceId: string | null;

  @Column({ nullable: true, type: 'text' })
  senderPoolFingerprint: string | null;

  @Column({ nullable: false, type: 'date' })
  localDate: string;

  @Column({ nullable: false, type: 'timestamptz' })
  claimedAt: Date;

  @Column({ nullable: false, type: 'timestamptz' })
  slotAt: Date;

  @Column({ nullable: false, type: 'timestamptz' })
  unknownAfter: Date;

  @Column({ nullable: true, type: 'uuid' })
  campaignId: string | null;

  @Column({ nullable: true, type: 'uuid' })
  enrollmentId: string | null;

  @Column({ nullable: true, type: 'uuid' })
  occurrenceId: string | null;

  @Column({ nullable: true, type: 'uuid' })
  authorizationId: string | null;

  @Column({ nullable: true, type: 'uuid' })
  workflowVersionId: string | null;

  @Column({ nullable: true, type: 'uuid' })
  messageId: string | null;

  @Column({ nullable: true, type: 'integer' })
  attemptNumber: number | null;

  @Column({ nullable: true, type: 'text' })
  renderDigest: string | null;

  @Column({ nullable: true, type: 'uuid' })
  testPreparationProofId: string | null;

  @Column({ nullable: true, type: 'uuid' })
  requesterUserWorkspaceId: string | null;

  @Column({ nullable: true, type: 'text' })
  previewDigest: string | null;

  @Column({ nullable: true, type: 'text' })
  testTransportDigest: string | null;

  @Column({ nullable: true, type: 'uuid' })
  directReservationCapabilityId: string | null;

  @Column({ nullable: true, type: 'text' })
  finalEvidenceDigest: string | null;

  @Column({ nullable: true, type: 'text' })
  providerMessageId: string | null;

  @Column({ nullable: true, type: 'timestamptz' })
  providerAcceptedAt: Date | null;

  @Column({ nullable: true, type: 'text' })
  safeOutcomeReason: string | null;

  @Column({ nullable: true, type: 'boolean' })
  retryable: boolean | null;

  @Column({ nullable: true, type: 'uuid' })
  projectedMessageId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
