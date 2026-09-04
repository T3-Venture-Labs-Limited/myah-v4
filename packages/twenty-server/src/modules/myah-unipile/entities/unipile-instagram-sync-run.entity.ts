import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';

import { UnipileInstagramAccountBindingEntity } from 'src/modules/myah-unipile/entities/unipile-instagram-account-binding.entity';

export enum UnipileInstagramSyncRunStatus {
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

@Entity({ name: 'unipileInstagramSyncRun', schema: 'core' })
@Index('IDX_UNIPILE_IG_SYNC_RUN_RUNNING_BINDING', ['bindingId'], {
  unique: true,
  where: `"status" = 'RUNNING'`,
})
export class UnipileInstagramSyncRunEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  bindingId: string;

  @Column({
    type: 'enum',
    enum: UnipileInstagramSyncRunStatus,
    enumName: 'unipileInstagramSyncRun_status_enum',
    default: UnipileInstagramSyncRunStatus.RUNNING,
  })
  status: UnipileInstagramSyncRunStatus;

  @Column({ type: 'timestamptz', nullable: true })
  overlapAfter: Date | null;

  @Column({ type: 'text', nullable: true })
  chatCursor: string | null;

  @Column({ type: 'text', nullable: true })
  currentChatId: string | null;

  @Column({ type: 'text', nullable: true })
  currentChatAttendeeId: string | null;

  @Column({ type: 'text', nullable: true })
  messageCursor: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedChatHighWaterAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  failureCode: string | null;

  @Column({ type: 'text', nullable: true })
  failureReason: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => UnipileInstagramAccountBindingEntity, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'bindingId', referencedColumnName: 'id' })
  binding: Relation<UnipileInstagramAccountBindingEntity>;
}
