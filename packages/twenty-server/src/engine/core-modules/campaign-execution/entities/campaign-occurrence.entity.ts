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

import { CampaignEnrollmentEntity } from 'src/engine/core-modules/campaign-execution/entities/campaign-enrollment.entity';
import {
  type CampaignOccurrenceHoldReason,
  type CampaignOccurrenceState,
  type CampaignOccurrenceTerminalReason,
} from 'src/engine/core-modules/campaign-execution/types/campaign-execution-persistence.type';

@Entity({ name: 'campaignOccurrence', schema: 'core' })
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
    AND "holdReason" IS NOT NULL
    AND btrim("holdReason") <> ''
    AND "terminalReason" IS NULL
    AND "terminalAt" IS NULL
  ) OR (
    "state" IN ('SUCCEEDED', 'SKIPPED', 'CANCELLED')
    AND "holdReason" IS NULL
    AND "terminalReason" IS NOT NULL
    AND btrim("terminalReason") <> ''
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
