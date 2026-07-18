import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';

import { ActionApprovalBindingEvidenceLinkEntity } from 'src/engine/core-modules/action-approval/entities/action-approval-binding-evidence-link.entity';
import { ActionExecutionReceiptEntity } from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';

export enum ActionApprovalBindingState {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CHANGES_REQUESTED = 'CHANGES_REQUESTED',
  EXPIRED = 'EXPIRED',
  CONSUMED = 'CONSUMED',
}

@Entity({ name: 'actionApprovalBinding', schema: 'core' })
export class ActionApprovalBindingEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  workspaceId: string;

  @Column({ type: 'uuid' })
  initiatorUserWorkspaceId: string;

  @Column({ type: 'varchar' })
  actionName: string;

  @Column({ type: 'integer' })
  actionVersion: number;

  @Column({ type: 'uuid' })
  draftId: string;

  @Column({ type: 'varchar', length: 64 })
  contentDigest: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  recipientFingerprint: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  sendingAccountFingerprint: string | null;

  @Column({ type: 'text', nullable: true })
  inboundMessageId: string | null;

  @Column({ type: 'text', nullable: true })
  inboundSenderIgsid: string | null;

  @Column({ type: 'text', nullable: true })
  inboundDirection: 'INBOUND' | null;

  @Column({ type: 'timestamptz', nullable: true })
  inboundReceivedAt: Date | null;

  @Column({ type: 'uuid' })
  threadId: string;

  @Column({
    type: 'enum',
    enum: ActionApprovalBindingState,
    enumName: 'actionApprovalBinding_state_enum',
  })
  state: ActionApprovalBindingState;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  decidedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(
    () => ActionApprovalBindingEvidenceLinkEntity,
    (evidenceLink) => evidenceLink.actionApprovalBinding,
  )
  evidenceLinks: Relation<ActionApprovalBindingEvidenceLinkEntity[]>;

  @OneToMany(
    () => ActionExecutionReceiptEntity,
    (receipt) => receipt.actionApprovalBinding,
  )
  receipts: Relation<ActionExecutionReceiptEntity[]>;
}
