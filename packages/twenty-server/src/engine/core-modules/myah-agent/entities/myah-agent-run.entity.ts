import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

export const MYAH_AGENT_RUN_STATUSES = [
  'RUNNING',
  'DRAFTED',
  'HANDED_OFF',
  'SKIPPED',
  'SENT',
  'SEND_UNKNOWN',
  'FAILED',
] as const;

export type MyahAgentRunStatus = (typeof MYAH_AGENT_RUN_STATUSES)[number];

// One reply-agent run per creator message (MYAH-445): the idempotency key, the
// source of the Inbox "Drafted by agent"/"Needs you" label and the counter for
// the consecutive automatic-reply cap.
@Entity({ name: 'myahAgentRun', schema: 'core' })
@Unique('UQ_MYAH_AGENT_RUN_TRIGGER', ['workspaceId', 'triggerMessageId'])
@Index('IDX_MYAH_AGENT_RUN_CONVERSATION', [
  'workspaceId',
  'conversationRecordId',
  'createdAt',
])
@Check(
  'CHK_MYAH_AGENT_RUN_STATUS',
  `"status" IN ('RUNNING','DRAFTED','HANDED_OFF','SKIPPED','SENT','SEND_UNKNOWN','FAILED')`,
)
@Check('CHK_MYAH_AGENT_RUN_CHANNEL', `"channel" IN ('EMAIL','INSTAGRAM')`)
export class MyahAgentRunEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  workspaceId: string;

  @Column({ type: 'text' })
  channel: 'EMAIL' | 'INSTAGRAM';

  @Column({ type: 'uuid' })
  conversationRecordId: string;

  @Column({ type: 'uuid' })
  triggerMessageId: string;

  @Column({ type: 'uuid' })
  creatorId: string;

  @Column({ type: 'uuid', nullable: true })
  campaignId: string | null;

  @Column({ type: 'text' })
  status: MyahAgentRunStatus;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'boolean', default: false })
  automatic: boolean;

  @Column({ type: 'boolean', default: false })
  channelInvitationMade: boolean;

  @Column({ type: 'text', nullable: true })
  draftId: string | null;

  @Column({ type: 'integer', nullable: true })
  draftRevision: number | null;

  @Column({ type: 'text', nullable: true })
  draftBody: string | null;

  @Column({ type: 'uuid', nullable: true })
  receiptId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
