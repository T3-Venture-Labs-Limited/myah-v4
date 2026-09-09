import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Check(
  'CHK_MAILBOX_CAPACITY_DAY_RESERVED_COUNT_NONNEGATIVE',
  '"reservedCount" >= 0',
)
@Check(
  'CHK_MAILBOX_CAPACITY_DAY_ACCEPTED_COUNT_NONNEGATIVE',
  '"acceptedCount" >= 0',
)
@Unique('UQ_MAILBOX_CAPACITY_DAY_WORKSPACE_ACCOUNT_LOCAL_DATE', [
  'workspaceId',
  'connectedAccountId',
  'localDate',
])
@Entity({ name: 'mailboxCapacityDay', schema: 'core' })
export class MailboxCapacityDayEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: false, type: 'uuid' })
  workspaceId: string;

  @Column({ nullable: false, type: 'uuid' })
  connectedAccountId: string;

  @Column({ nullable: false, type: 'date' })
  localDate: string;

  @Column({ default: 0, nullable: false, type: 'integer' })
  reservedCount: number;

  @Column({ default: 0, nullable: false, type: 'integer' })
  acceptedCount: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
