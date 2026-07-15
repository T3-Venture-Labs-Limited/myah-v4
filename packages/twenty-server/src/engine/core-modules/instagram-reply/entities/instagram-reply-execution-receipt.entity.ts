import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

export enum InstagramReplyExecutionState {
  PROCESSING = 'PROCESSING',
  SENT = 'SENT',
  FAILED = 'FAILED',
  BLOCKED = 'BLOCKED',
  UNKNOWN = 'UNKNOWN',
}

@Index('IDX_INSTAGRAM_REPLY_EXECUTION_RECEIPT_STATE', ['state'])
@Unique('IDX_INSTAGRAM_REPLY_EXECUTION_RECEIPT_APPROVAL_REQUEST', [
  'approvalRequestId',
])
@Entity({ name: 'instagramReplyExecutionReceipt', schema: 'core' })
export class InstagramReplyExecutionReceiptEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  approvalRequestId: string;

  @Column({
    type: 'enum',
    enum: InstagramReplyExecutionState,
    default: InstagramReplyExecutionState.PROCESSING,
  })
  state: InstagramReplyExecutionState;

  @Column({ type: 'text', nullable: true })
  providerMessageId: string | null;

  @Column({ type: 'text', nullable: true })
  failureCode: string | null;

  @Column({ type: 'text', nullable: true })
  failureReason: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
