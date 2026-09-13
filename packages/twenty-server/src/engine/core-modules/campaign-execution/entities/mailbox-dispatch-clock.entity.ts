import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Unique('UQ_MAILBOX_DISPATCH_CLOCK_WORKSPACE_ACCOUNT', [
  'workspaceId',
  'connectedAccountId',
])
@Entity({ name: 'mailboxDispatchClock', schema: 'core' })
export class MailboxDispatchClockEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: false, type: 'uuid' })
  workspaceId: string;

  @Column({ nullable: false, type: 'uuid' })
  connectedAccountId: string;

  @Column({ nullable: true, type: 'timestamptz' })
  nextEligibleAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
