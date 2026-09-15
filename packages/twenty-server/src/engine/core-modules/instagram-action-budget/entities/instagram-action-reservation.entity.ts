import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

import { ActionExecutionReceiptEntity } from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';

export enum InstagramActionKind {
  START_CHAT = 'START_CHAT',
  REPLY = 'REPLY',
}

@Index(
  'IDX_INSTAGRAM_ACTION_RESERVATION_ACTIVE_WINDOW',
  ['workspaceId', 'instagramAccountRecordId', 'reservedAt'],
  { where: '"releasedAt" IS NULL' },
)
@Index(
  'IDX_INSTAGRAM_ACTION_RESERVATION_START_CHAT_TARGET',
  ['workspaceId', 'instagramAccountRecordId', 'targetFingerprint'],
  {
    unique: true,
    where: '"actionKind" = \'START_CHAT\' AND "targetLockReleasedAt" IS NULL',
  },
)
@Unique('UQ_INSTAGRAM_ACTION_RESERVATION_RECEIPT', ['actionExecutionReceiptId'])
@Entity({ name: 'instagramActionReservation', schema: 'core' })
export class InstagramActionReservationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  workspaceId: string;

  @Column({ type: 'uuid' })
  instagramAccountRecordId: string;

  @Column({ type: 'uuid' })
  actionExecutionReceiptId: string;

  @Column({
    type: 'enum',
    enum: InstagramActionKind,
    enumName: 'instagramActionReservation_actionKind_enum',
  })
  actionKind: InstagramActionKind;

  @Column({ type: 'varchar', length: 64 })
  targetFingerprint: string;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  reservedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  providerAttemptedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  releasedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  releaseReason: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  targetLockReleasedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId', referencedColumnName: 'id' })
  workspace: Relation<WorkspaceEntity>;

  @ManyToOne(() => ActionExecutionReceiptEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'actionExecutionReceiptId', referencedColumnName: 'id' })
  actionExecutionReceipt: Relation<ActionExecutionReceiptEntity>;
}
