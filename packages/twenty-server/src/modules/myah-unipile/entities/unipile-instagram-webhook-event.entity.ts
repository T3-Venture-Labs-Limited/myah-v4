import {
  Check,
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

import { UnipileInstagramAccountBindingEntity } from 'src/modules/myah-unipile/entities/unipile-instagram-account-binding.entity';

export enum UnipileInstagramWebhookEventType {
  MESSAGE_RECEIVED = 'MESSAGE_RECEIVED',
  MESSAGE_READ = 'MESSAGE_READ',
  MESSAGE_DELIVERED = 'MESSAGE_DELIVERED',
  MESSAGE_EDITED = 'MESSAGE_EDITED',
  MESSAGE_DELETED = 'MESSAGE_DELETED',
  MESSAGE_REACTION = 'MESSAGE_REACTION',
  ACCOUNT_STATUS = 'ACCOUNT_STATUS',
}

export enum UnipileInstagramWebhookEventStatus {
  RECEIVED = 'RECEIVED',
  ENQUEUED = 'ENQUEUED',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

@Entity({ name: 'unipileInstagramWebhookEvent', schema: 'core' })
@Unique('UQ_UNIPILE_IG_WEBHOOK_EVENT_FINGERPRINT', ['eventFingerprint'])
@Check(
  'CHK_UNIPILE_IG_WEBHOOK_EVENT_RETRY_STATE',
  `"attemptCount" >= 0 AND (("status" IN ('PROCESSING', 'COMPLETED', 'FAILED') AND "nextAttemptAt" IS NULL) OR "status" IN ('RECEIVED', 'ENQUEUED'))`,
)
@Index('IDX_UNIPILE_IG_WEBHOOK_EVENT_STATUS_NEXT_ATTEMPT_UPDATED_AT', [
  'status',
  'nextAttemptAt',
  'updatedAt',
])
export class UnipileInstagramWebhookEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  bindingId: string;

  @Column({ type: 'text' })
  eventFingerprint: string;

  @Column({
    type: 'enum',
    enum: UnipileInstagramWebhookEventType,
    enumName: 'unipileInstagramWebhookEvent_eventType_enum',
  })
  eventType: UnipileInstagramWebhookEventType;

  @Column({ type: 'text', nullable: true })
  unipileChatId: string | null;

  @Column({ type: 'text', nullable: true })
  unipileMessageId: string | null;

  @Column({ type: 'text', nullable: true })
  attendeeProviderId: string | null;

  @Column({ type: 'text', nullable: true })
  accountStatus: string | null;

  @Column({ type: 'text', nullable: true })
  deliveryState: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  deliveryStateUpdatedAt: Date | null;

  @Column({
    type: 'enum',
    enum: UnipileInstagramWebhookEventStatus,
    enumName: 'unipileInstagramWebhookEvent_status_enum',
    default: UnipileInstagramWebhookEventStatus.RECEIVED,
  })
  status: UnipileInstagramWebhookEventStatus;

  @Column({ type: 'int', default: 0 })
  attemptCount: number;

  @Column({ type: 'timestamptz', nullable: true })
  nextAttemptAt: Date | null;

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
