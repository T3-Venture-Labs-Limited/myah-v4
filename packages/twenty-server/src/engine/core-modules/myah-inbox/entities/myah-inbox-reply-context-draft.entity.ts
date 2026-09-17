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
  UpdateDateColumn,
} from 'typeorm';

import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';

@Check(
  'CHK_MYAH_INBOX_REPLY_CONTEXT_DRAFT_CONTEXT',
  `("contextKind" = 'GENERAL' AND "campaignId" IS NULL) OR ("contextKind" = 'CAMPAIGN' AND "campaignId" IS NOT NULL)`,
)
@Check(
  'CHK_MYAH_INBOX_REPLY_CONTEXT_DRAFT_ANCHOR',
  `"contactAnchorKind" IN ('CREATOR', 'EMAIL_THREAD', 'INSTAGRAM_CONVERSATION')`,
)
@Check(
  'CHK_MYAH_INBOX_REPLY_CONTEXT_DRAFT_CHANNEL_ANCHOR',
  `("channel" = 'EMAIL' AND "contactAnchorKind" IN ('CREATOR', 'EMAIL_THREAD')) OR ("channel" = 'INSTAGRAM' AND "contactAnchorKind" IN ('CREATOR', 'INSTAGRAM_CONVERSATION'))`,
)
@Check(
  'CHK_MYAH_INBOX_REPLY_CONTEXT_DRAFT_BODY',
  `("bodyMarkdown" IS NULL AND "bodyBlocknote" IS NULL) OR "bodyMarkdown" IS NOT NULL`,
)
@Check('CHK_MYAH_INBOX_REPLY_CONTEXT_DRAFT_REVISION', '"revision" >= 0')
@Index(
  'UQ_MYAH_REPLY_CONTEXT_DRAFT_CAMPAIGN_IDENTITY',
  [
    'workspaceId',
    'contactAnchorKind',
    'contactAnchorId',
    'channel',
    'deliveryTargetId',
    'campaignId',
  ],
  { unique: true, where: '"contextKind" = \'CAMPAIGN\'' },
)
@Index(
  'UQ_MYAH_REPLY_CONTEXT_DRAFT_GENERAL_IDENTITY',
  [
    'workspaceId',
    'contactAnchorKind',
    'contactAnchorId',
    'channel',
    'deliveryTargetId',
  ],
  { unique: true, where: '"contextKind" = \'GENERAL\'' },
)
@Index('IDX_MYAH_REPLY_CONTEXT_DRAFT_TARGET', [
  'workspaceId',
  'contactAnchorKind',
  'contactAnchorId',
  'channel',
  'deliveryTargetId',
  'updatedAt',
])
@Entity({ name: 'myahInboxReplyContextDraft', schema: 'core' })
export class MyahInboxReplyContextDraftEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', update: false })
  workspaceId: string;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: Relation<WorkspaceEntity>;

  @Column({ type: 'varchar', length: 32, update: false })
  contactAnchorKind: string;

  @Column({ type: 'uuid', update: false })
  contactAnchorId: string;

  @Column({
    type: 'enum',
    enum: ['EMAIL', 'INSTAGRAM'],
    enumName: 'myahInboxReplyContextDraft_channel_enum',
    update: false,
  })
  channel: 'EMAIL' | 'INSTAGRAM';

  @Column({ type: 'uuid', update: false })
  deliveryTargetId: string;

  @Column({
    type: 'enum',
    enum: ['CAMPAIGN', 'GENERAL'],
    enumName: 'myahInboxReplyContextDraft_contextKind_enum',
    update: false,
  })
  contextKind: 'CAMPAIGN' | 'GENERAL';

  @Column({ type: 'uuid', nullable: true, update: false })
  campaignId: string | null;

  @Column({ type: 'text', nullable: true })
  bodyMarkdown: string | null;

  @Column({ type: 'text', nullable: true })
  bodyBlocknote: string | null;

  @Column({ type: 'integer', default: 0 })
  revision: number;

  @Column({ type: 'varchar', length: 64, nullable: true })
  proposalContextFingerprint: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  reviewedContextFingerprint: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
