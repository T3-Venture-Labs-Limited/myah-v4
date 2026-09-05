import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
  Unique,
} from 'typeorm';

import { ActionExecutionReceiptEntity } from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';

export type InstagramSendOutcomeResolution =
  | 'CONFIRMED_SENT'
  | 'CLEARED_NOT_SENT';

@Entity({ name: 'instagramSendOutcomeResolution', schema: 'core' })
@Unique('UQ_INSTAGRAM_SEND_OUTCOME_RESOLUTION_RECEIPT', [
  'actionExecutionReceiptId',
])
@Check(
  'CHK_INSTAGRAM_SEND_OUTCOME_RESOLUTION_OUTCOME',
  `"outcome" IN ('CONFIRMED_SENT', 'CLEARED_NOT_SENT')`,
)
@Check(
  'CHK_INSTAGRAM_SEND_OUTCOME_RESOLUTION_EVIDENCE',
  `cardinality("evidenceTypes") > 0 AND cardinality("evidenceTypes") = cardinality("evidenceDigests")`,
)
export class InstagramSendOutcomeResolutionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  workspaceId: string;

  @Column({ type: 'uuid' })
  actionExecutionReceiptId: string;

  @Column({ type: 'uuid' })
  resolvedByUserWorkspaceId: string;

  @Column({ type: 'varchar' })
  outcome: InstagramSendOutcomeResolution;

  @Column({ type: 'text', array: true })
  evidenceTypes: string[];

  @Column({ type: 'varchar', length: 64, array: true })
  evidenceDigests: string[];

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId', referencedColumnName: 'id' })
  workspace: Relation<WorkspaceEntity>;

  @ManyToOne(() => ActionExecutionReceiptEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'actionExecutionReceiptId', referencedColumnName: 'id' })
  actionExecutionReceipt: Relation<ActionExecutionReceiptEntity>;

  @ManyToOne(() => UserWorkspaceEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'resolvedByUserWorkspaceId', referencedColumnName: 'id' })
  resolvedByUserWorkspace: Relation<UserWorkspaceEntity>;
}
