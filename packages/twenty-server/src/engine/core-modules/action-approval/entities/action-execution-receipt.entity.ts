import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';

import { ActionApprovalBindingEntity } from 'src/engine/core-modules/action-approval/entities/action-approval-binding.entity';

export enum ActionExecutionReceiptState {
  PROCESSING = 'PROCESSING',
  PROVIDER_ACCEPTED = 'PROVIDER_ACCEPTED',
  SENT = 'SENT',
  BLOCKED = 'BLOCKED',
  FAILED = 'FAILED',
  UNKNOWN = 'UNKNOWN',
}

@Entity({ name: 'actionExecutionReceipt', schema: 'core' })
export class ActionExecutionReceiptEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  workspaceId: string;

  @Column({ type: 'uuid' })
  actionApprovalBindingId: string;

  @Column({ type: 'varchar', length: 64 })
  idempotencyKey: string;

  @Column({
    type: 'enum',
    enum: ActionExecutionReceiptState,
    enumName: 'actionExecutionReceipt_state_enum',
  })
  state: ActionExecutionReceiptState;

  @Column({ type: 'text', nullable: true })
  providerMessageId: string | null;

  @Column({ type: 'text', nullable: true })
  providerCode: string | null;

  @Column({ type: 'varchar', nullable: true })
  redactedOutcome: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(
    () => ActionApprovalBindingEntity,
    (binding) => binding.receipts,
    { onDelete: 'RESTRICT' },
  )
  @JoinColumn({ name: 'actionApprovalBindingId' })
  actionApprovalBinding: Relation<ActionApprovalBindingEntity>;
}
