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

// Canonical source UUIDs only: imported Email/Instagram messages, persisted due-check
// intents, and participation events (including explicit reassessment). Never provider IDs.
@Check(
  'CHK_CAMPAIGN_PARTNERSHIP_WORK_ITEM_TRIGGER',
  `"triggerKey" ~ '^(email-message|instagram-message|due-check|participation-event):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'`,
)
@Check(
  'CHK_CAMPAIGN_PARTNERSHIP_WORK_ITEM_PURPOSE',
  `length(btrim("purpose")) > 0`,
)
@Check('CHK_CAMPAIGN_PARTNERSHIP_WORK_ITEM_ATTEMPTS', `"attempts" >= 0`)
@Check(
  'CHK_CAMPAIGN_PARTNERSHIP_WORK_ITEM_GENERATION',
  `"contextGeneration" >= 0`,
)
@Check(
  'CHK_CAMPAIGN_PARTNERSHIP_WORK_ITEM_ATTRIBUTION',
  `"participationId" IS NOT NULL OR "state" = 'HELD'`,
)
@Check(
  'CHK_CAMPAIGN_PARTNERSHIP_REPLY_AMBIGUITY',
  `"purpose" <> 'REPLY_AMBIGUITY' OR (
    "triggerKey" ~ '^email-message:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND "messageChannelId" IS NOT NULL AND "connectedAccountId" IS NOT NULL
    AND "resolvedThreadExternalId" IS NOT NULL AND length("resolvedThreadExternalId") > 0
    AND "resolvedThreadExternalId" = btrim("resolvedThreadExternalId")
    AND "normalizedRecipient" IS NOT NULL AND length("normalizedRecipient") > 0
    AND "normalizedRecipient" = lower(btrim("normalizedRecipient"))
    AND (("participationId" IS NULL AND "state" = 'HELD'
      AND "resolvedByWorkspaceMemberId" IS NULL AND "resolvedAt" IS NULL)
      OR ("participationId" IS NOT NULL AND "resolvedByWorkspaceMemberId" IS NOT NULL
        AND "resolvedAt" IS NOT NULL))
  )`,
)
@Check(
  'CHK_CAMPAIGN_EMAIL_WORK_IDENTITY',
  `"providerMessageId" IS NULL OR (
    "canonicalMessageId" IS NOT NULL AND "messageThreadId" IS NOT NULL
    AND "messageChannelId" IS NOT NULL AND "connectedAccountId" IS NOT NULL
    AND "accountIncarnationId" IS NOT NULL AND "baselineGenerationId" IS NOT NULL
    AND "providerOccurredAt" IS NOT NULL
    AND "providerThreadId" IS NOT NULL AND length("providerThreadId") > 0
    AND "creatorSender" IS NOT NULL AND length("creatorSender") > 0
    AND "accountRecipient" IS NOT NULL AND length("accountRecipient") > 0
    AND "resolvedThreadExternalId" = "providerThreadId"
    AND "normalizedRecipient" = "accountRecipient"
    AND "purpose" = 'REPLY_AMBIGUITY'
    AND length(btrim("providerMessageId")) > 0
    AND (("participationId" IS NULL AND "resolvedCampaignId" IS NULL AND "resolvedCreatorId" IS NULL)
      OR ("participationId" IS NOT NULL AND "resolvedCampaignId" IS NOT NULL AND "resolvedCreatorId" IS NOT NULL))
  )`,
)
@Check(
  'CHK_CAMPAIGN_PARTNERSHIP_WORK_ITEM_STATE',
  `"state" IN ('PENDING', 'PROCESSING', 'AWAITING_REVIEW', 'READY_ACTION', 'COMPLETED', 'SUPERSEDED', 'HELD', 'FAILED')`,
)
@Index(
  'UQ_CAMPAIGN_PARTNERSHIP_WORK_ITEM_TRIGGER',
  ['workspaceId', 'triggerKey', 'purpose'],
  { unique: true },
)
@Index('IDX_CAMPAIGN_PARTNERSHIP_WORK_ITEM_DUE', ['state', 'nextDueAt'])
@Index(
  'UQ_CAMPAIGN_EMAIL_WORK_PROVIDER_ITEM',
  [
    'workspaceId',
    'messageChannelId',
    'accountIncarnationId',
    'providerMessageId',
  ],
  {
    unique: true,
    where: '"providerMessageId" IS NOT NULL',
  },
)
@Entity({ name: 'campaignPartnershipWorkItem', schema: 'core' })
export class CampaignPartnershipWorkItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', update: false })
  workspaceId: string;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: Relation<WorkspaceEntity>;

  @Column({ type: 'varchar', length: 64, update: false })
  triggerKey: string;

  @Column({ type: 'varchar', length: 64, update: false })
  purpose: string;

  // Nullable only while held; binding an attributed participation is one-way.
  // Authorization of the initial resolution belongs to a future domain service.
  @Column({ type: 'uuid', nullable: true })
  participationId: string | null;

  // Immutable Email provider route snapshot for REPLY_AMBIGUITY only. The
  // canonical Message UUID can collide across channels under the existing key;
  // future writers must detect that collision, never overwrite or silently release.
  @Column({ type: 'uuid', nullable: true, update: false })
  messageChannelId: string | null;

  @Column({ type: 'uuid', nullable: true, update: false })
  connectedAccountId: string | null;

  @Column({ type: 'text', nullable: true, update: false })
  resolvedThreadExternalId: string | null;

  @Column({ type: 'text', nullable: true, update: false })
  normalizedRecipient: string | null;

  // Additive 0006 provider-qualified identity; legacy F/G work has null columns.
  // Source columns are insert-only. Database trigger also protects raw SQL updates.
  @Column({ type: 'uuid', nullable: true, update: false })
  canonicalMessageId: string | null;

  @Column({ type: 'uuid', nullable: true, update: false })
  messageThreadId: string | null;

  @Column({ type: 'text', nullable: true, update: false })
  providerMessageId: string | null;

  @Column({ type: 'uuid', nullable: true, update: false })
  accountIncarnationId: string | null;

  @Column({ type: 'text', nullable: true, update: false })
  providerThreadId: string | null;

  @Column({ type: 'text', nullable: true, update: false })
  creatorSender: string | null;

  @Column({ type: 'text', nullable: true, update: false })
  accountRecipient: string | null;

  @Column({ type: 'uuid', nullable: true, update: false })
  baselineGenerationId: string | null;

  @Column({ type: 'timestamptz', nullable: true, update: false })
  providerOccurredAt: Date | null;

  // Set together with participationId on authenticated HELD resolution only.
  @Column({ type: 'uuid', nullable: true })
  resolvedCampaignId: string | null;

  @Column({ type: 'uuid', nullable: true })
  resolvedCreatorId: string | null;

  @Column({ type: 'uuid', nullable: true })
  resolvedByWorkspaceMemberId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @Column({ type: 'varchar', length: 32, default: 'PENDING' })
  state: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  reason: string | null;

  @Column({ type: 'integer', default: 0 })
  contextGeneration: number;

  @Column({ type: 'integer', default: 0 })
  attempts: number;

  @Column({ type: 'uuid', nullable: true })
  leaseToken: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  leaseExpiresAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  nextDueAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  candidateId: string | null;

  @Column({ type: 'uuid', nullable: true })
  draftId: string | null;

  @Column({ type: 'uuid', nullable: true })
  actionId: string | null;

  @Column({ type: 'uuid', nullable: true })
  receiptId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
