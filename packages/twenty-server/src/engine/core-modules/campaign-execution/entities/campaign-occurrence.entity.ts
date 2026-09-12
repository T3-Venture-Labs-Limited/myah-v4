import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  ForeignKey,
  Index,
  PrimaryColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

import { CampaignEnrollmentEntity } from 'src/engine/core-modules/campaign-execution/entities/campaign-enrollment.entity';
import {
  type CampaignOccurrenceHoldReason,
  type CampaignOccurrenceState,
  type CampaignOccurrenceTerminalReason,
} from 'src/engine/core-modules/campaign-execution/types/campaign-execution-persistence.type';

@Entity({ name: 'campaignOccurrence', schema: 'core' })
@Index('IDX_CO_DUE_PENDING', ['dueAt', 'workspaceId', 'campaignId', 'id'], {
  where: `"state" = 'PENDING'`,
})
@Index('IDX_CO_UNRESOLVED', ['state', 'updatedAt', 'id'], {
  where: `"state" IN ('IN_FLIGHT', 'UNKNOWN', 'HELD')`,
})
@Unique('UQ_CO_ENROLLMENT_VERSION_MESSAGE', [
  'enrollmentId',
  'workflowVersionId',
  'messageId',
])
@Unique('UQ_CO_ENROLLMENT_AUTHORED_INDEX', [
  'enrollmentId',
  'authoredMessageIndex',
])
@Unique('UQ_CO_ATTEMPT_BINDING', [
  'workspaceId',
  'campaignId',
  'enrollmentId',
  'id',
  'workflowVersionId',
  'messageId',
])
@ForeignKey(
  () => CampaignEnrollmentEntity,
  ['workspaceId', 'campaignId', 'enrollmentId'],
  ['workspaceId', 'campaignId', 'id'],
  {
    name: 'FK_CO_ENROLLMENT_SCOPE',
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  },
)
@Check('CHK_CO_AUTHORED_INDEX_NONNEGATIVE', '"authoredMessageIndex" >= 0')
@Check(
  'CHK_CO_STATE',
  `"state" IN ('PENDING', 'IN_FLIGHT', 'SUCCEEDED', 'SKIPPED', 'HELD', 'UNKNOWN', 'CANCELLED')`,
)
@Check(
  'CHK_CO_TERMINAL_SHAPE',
  `(
    "state" IN ('PENDING', 'IN_FLIGHT', 'UNKNOWN')
    AND "holdReason" IS NULL
    AND "terminalReason" IS NULL
    AND "terminalAt" IS NULL
  ) OR (
    "state" = 'HELD'
    AND "holdReason" IN ('WORKSPACE_NOT_ACTIVE', 'ATTACHMENTS_UNAVAILABLE', 'MATERIAL_STALE', 'SENDER_POOL_STALE', 'SENDER_NOT_READY', 'CAPACITY_CONFIGURATION_INVALID', 'THREAD_EVIDENCE_MISSING', 'THREAD_EVIDENCE_AMBIGUOUS', 'THREAD_SENDER_CHANGED', 'DEFINITELY_UNACCEPTED_REVIEW', 'PROJECTION_RECONCILIATION_REQUIRED', 'DISPATCH_CONTRACT_CONFLICT')
    AND "terminalReason" IS NULL
    AND "terminalAt" IS NULL
  ) OR (
    "state" IN ('SUCCEEDED', 'SKIPPED', 'CANCELLED')
    AND "holdReason" IS NULL
    AND "terminalReason" IN ('PROVIDER_ACCEPTED', 'CREATOR_MISSING', 'CREATOR_DELETED', 'CAMPAIGN_CREATOR_MISSING', 'CAMPAIGN_CREATOR_DELETED', 'INVALID_STAGE', 'NON_EMAIL_CONTACT_METHOD', 'INVALID_EMAIL', 'DUPLICATE_CREATOR_EMAIL', 'SUPPRESSED_EMAIL', 'CAMPAIGN_PAUSED', 'CAMPAIGN_COMPLETED', 'AUTHORIZATION_REVOKED', 'ENROLLMENT_REPLIED', 'SUPERSEDED_BY_WORKFLOW_VERSION')
    AND "terminalAt" IS NOT NULL
  )`,
)
export class CampaignOccurrenceEntity {
  @PrimaryColumn({
    type: 'uuid',
    primaryKeyConstraintName: 'PK_CAMPAIGN_OCCURRENCE',
  })
  id: string;

  @Column({ type: 'uuid', update: false })
  workspaceId: string;

  @Column({ type: 'uuid', update: false })
  campaignId: string;

  @Column({ type: 'uuid', update: false })
  enrollmentId: string;

  @Column({ type: 'uuid', update: false })
  workflowVersionId: string;

  @Column({ type: 'uuid', update: false })
  messageId: string;

  @Column({ type: 'integer', update: false })
  authoredMessageIndex: number;

  @Column({ type: 'text' })
  state: CampaignOccurrenceState;

  @Column({ type: 'timestamptz' })
  dueAt: Date;

  @Column({ type: 'text', nullable: true })
  holdReason: CampaignOccurrenceHoldReason | null;

  @Column({ type: 'text', nullable: true })
  terminalReason: CampaignOccurrenceTerminalReason | null;

  @Column({ type: 'timestamptz', nullable: true })
  terminalAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
