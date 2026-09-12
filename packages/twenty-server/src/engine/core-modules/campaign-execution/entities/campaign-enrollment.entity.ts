import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  ForeignKey,
  PrimaryColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

import { CampaignSequenceAuthorizationEntity } from 'src/engine/core-modules/campaign-sequence-authority/entities/campaign-sequence-authorization.entity';
import { CampaignExecutionEntity } from 'src/engine/core-modules/campaign-execution/entities/campaign-execution.entity';
import {
  type CampaignEnrollmentHoldReason,
  type CampaignEnrollmentState,
  type CampaignEnrollmentTerminalReason,
} from 'src/engine/core-modules/campaign-execution/types/campaign-execution-persistence.type';

@Entity({ name: 'campaignEnrollment', schema: 'core' })
@Unique('UQ_CEN_SCOPE_AUTH_CREATOR', [
  'workspaceId',
  'campaignId',
  'authorizationId',
  'creatorId',
])
@Unique('UQ_CEN_SCOPE_AUTH_ID', [
  'workspaceId',
  'campaignId',
  'authorizationId',
  'id',
])
@Unique('UQ_CEN_SCOPE_ID', ['workspaceId', 'campaignId', 'id'])
@ForeignKey(
  () => CampaignExecutionEntity,
  ['workspaceId', 'campaignId', 'campaignExecutionId'],
  ['workspaceId', 'campaignId', 'id'],
  {
    name: 'FK_CEN_EXECUTION_SCOPE',
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  },
)
@ForeignKey(
  () => CampaignSequenceAuthorizationEntity,
  ['workspaceId', 'campaignId', 'authorizationId'],
  ['workspaceId', 'campaignId', 'authorizationId'],
  {
    name: 'FK_CEN_AUTHORIZATION_SCOPE',
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  },
)
@Check(
  'CHK_CEN_AUTHORIZATION_GENERATION_POSITIVE',
  '"authorizationGeneration" > 0',
)
@Check('CHK_CEN_AUTHORED_MESSAGE_COUNT_POSITIVE', '"authoredMessageCount" > 0')
@Check(
  'CHK_CEN_AUTHORED_CURSOR_RANGE',
  '"nextAuthoredMessageIndex" >= 0 AND "nextAuthoredMessageIndex" <= "authoredMessageCount"',
)
@Check(
  'CHK_CEN_STATE',
  `"state" IN ('ACTIVE', 'REPLIED', 'EXCLUDED', 'FINISHED')`,
)
@Check(
  'CHK_CEN_TERMINAL_SHAPE',
  `(
    "state" = 'ACTIVE'
    AND ("holdReason" IS NULL OR "holdReason" IN ('WORKSPACE_NOT_ACTIVE', 'ATTACHMENTS_UNAVAILABLE', 'MATERIAL_STALE', 'SENDER_POOL_STALE', 'SENDER_NOT_READY', 'CAPACITY_CONFIGURATION_INVALID', 'THREAD_EVIDENCE_MISSING', 'THREAD_EVIDENCE_AMBIGUOUS', 'THREAD_SENDER_CHANGED', 'DEFINITELY_UNACCEPTED_REVIEW', 'PROJECTION_RECONCILIATION_REQUIRED', 'DISPATCH_CONTRACT_CONFLICT'))
    AND "terminalReason" IS NULL
    AND "terminalAt" IS NULL
  ) OR (
    "state" IN ('REPLIED', 'EXCLUDED', 'FINISHED')
    AND "holdReason" IS NULL
    AND "terminalReason" IN ('REPLY_RECEIVED', 'CREATOR_MISSING', 'CREATOR_DELETED', 'CAMPAIGN_CREATOR_MISSING', 'CAMPAIGN_CREATOR_DELETED', 'INVALID_STAGE', 'NON_EMAIL_CONTACT_METHOD', 'INVALID_EMAIL', 'DUPLICATE_CREATOR_EMAIL', 'SUPPRESSED_EMAIL', 'SEQUENCE_COMPLETED', 'NO_USABLE_AUTHORED_MESSAGE')
    AND "terminalAt" IS NOT NULL
    AND ("state" <> 'FINISHED' OR "nextAuthoredMessageIndex" = "authoredMessageCount")
  )`,
)
export class CampaignEnrollmentEntity {
  @PrimaryColumn({
    type: 'uuid',
    primaryKeyConstraintName: 'PK_CAMPAIGN_ENROLLMENT',
  })
  id: string;

  @Column({ type: 'uuid', update: false })
  workspaceId: string;

  @Column({ type: 'uuid', update: false })
  campaignId: string;

  @Column({ type: 'uuid', update: false })
  campaignExecutionId: string;

  @Column({ type: 'uuid', update: false })
  authorizationId: string;

  @Column({ type: 'integer', update: false })
  authorizationGeneration: number;

  @Column({ type: 'uuid', update: false })
  campaignCreatorId: string;

  @Column({ type: 'uuid', update: false })
  creatorId: string;

  @Column({ type: 'integer', update: false })
  authoredMessageCount: number;

  @Column({ type: 'integer' })
  nextAuthoredMessageIndex: number;

  @Column({ type: 'text' })
  state: CampaignEnrollmentState;

  @Column({ type: 'text', nullable: true })
  holdReason: CampaignEnrollmentHoldReason | null;

  @Column({ type: 'text', nullable: true })
  terminalReason: CampaignEnrollmentTerminalReason | null;

  @Column({ type: 'timestamptz', nullable: true })
  terminalAt: Date | null;

  @Column({ type: 'timestamptz', update: false })
  enrolledAt: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
