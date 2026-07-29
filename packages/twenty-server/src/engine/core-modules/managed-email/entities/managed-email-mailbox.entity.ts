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

import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { MessageChannelEntity } from 'src/engine/metadata-modules/message-channel/entities/message-channel.entity';

import { ManagedEmailCampaignEligibility } from '../enums/managed-email-campaign-eligibility.enum';
import { ManagedEmailInfrastructureState } from '../enums/managed-email-infrastructure-state.enum';
import { ManagedEmailWarmupMode } from '../enums/managed-email-warmup-mode.enum';
import { ManagedEmailWarmupState } from '../enums/managed-email-warmup-state.enum';
import { type ManagedEmailSafeFacts } from '../types/managed-email-persistence.type';

import { ManagedEmailDomainEntity } from './managed-email-domain.entity';

@Check('CHK_MANAGED_EMAIL_MAILBOX_PERSONA_VERSION', '"personaVersion" >= 1')
@Check(
  'CHK_MANAGED_EMAIL_MAILBOX_CAPACITIES',
  '"policySafeDailyCapacity" >= 0 AND ("adminDailyCap" IS NULL OR ("adminDailyCap" >= 0 AND "adminDailyCap" <= "policySafeDailyCapacity"))',
)
@Index(
  'IDX_MANAGED_EMAIL_MAILBOX_PROVIDER_ID_UNIQUE',
  ['providerConfigurationKey', 'providerMailboxId'],
  { unique: true, where: '"providerMailboxId" IS NOT NULL' },
)
@Index('IDX_MANAGED_EMAIL_MAILBOX_DOMAIN', ['managedEmailDomainId'])
@Index(
  'IDX_MANAGED_EMAIL_MAILBOX_RECONCILIATION_DUE',
  ['nextReconciliationAt'],
  { where: '"nextReconciliationAt" IS NOT NULL' },
)
@Index('IDX_MANAGED_EMAIL_MAILBOX_INFRASTRUCTURE_PAID_THROUGH', [
  'infrastructurePaidThrough',
])
@Index('IDX_MANAGED_EMAIL_MAILBOX_WARMUP_PAID_THROUGH', [
  'warmupPaidThrough',
])
@Index('IDX_MANAGED_EMAIL_MAILBOX_LAST_HEALTH_EVALUATED', [
  'lastHealthEvaluatedAt',
])
@Unique('UQ_MANAGED_EMAIL_MAILBOX_WORKSPACE_NORMALIZED', [
  'workspaceId',
  'normalizedAddress',
])
@Entity({ name: 'managedEmailMailbox', schema: 'core' })
export class ManagedEmailMailboxEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', update: false })
  workspaceId: string;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: Relation<WorkspaceEntity>;

  @Column({ type: 'uuid', update: false })
  managedEmailDomainId: string;

  @ManyToOne(() => ManagedEmailDomainEntity, { onDelete: 'CASCADE' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'managedEmailDomainId', referencedColumnName: 'id' },
  ])
  domain: Relation<ManagedEmailDomainEntity>;

  @Column({ type: 'text', update: false })
  address: string;

  @Column({ type: 'text', update: false })
  normalizedAddress: string;

  @Column({ type: 'text' })
  personaDisplayName: string;

  @Column({ type: 'text' })
  personaRole: string;

  @Column({ type: 'text' })
  personaSignature: string;

  @Column({ type: 'uuid', update: false })
  personaCreatedByWorkspaceMemberId: string;

  @Column({ default: 1, type: 'integer' })
  personaVersion: number;

  @Column({ nullable: true, type: 'uuid' })
  personaUpdatedByWorkspaceMemberId: string | null;

  @Column({ nullable: true, type: 'uuid' })
  personaAuditEventId: string | null;

  @Column({ type: 'text', update: false })
  providerType: string;

  @Column({ type: 'text', update: false })
  providerConfigurationKey: string;

  @Column({ nullable: true, type: 'text' })
  providerOrderId: string | null;

  @Column({ nullable: true, type: 'text' })
  providerMailboxId: string | null;

  @Column({ type: 'text' })
  infrastructureState: ManagedEmailInfrastructureState;

  @Column({ nullable: true, type: 'timestamptz' })
  infrastructurePaidThrough: Date | null;

  @Column({ nullable: true, type: 'uuid' })
  metronomeMailboxSubscriptionId: string | null;

  @Column({ nullable: true, type: 'uuid' })
  connectedAccountId: string | null;

  @ManyToOne(() => ConnectedAccountEntity, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'connectedAccountId' })
  connectedAccount: Relation<ConnectedAccountEntity> | null;

  @Column({ nullable: true, type: 'uuid' })
  messageChannelId: string | null;

  @ManyToOne(() => MessageChannelEntity, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'messageChannelId' })
  messageChannel: Relation<MessageChannelEntity> | null;

  @Column({ type: 'text', update: false })
  warmupMode: ManagedEmailWarmupMode;

  @Column({ nullable: true, type: 'text' })
  warmupProviderKey: string | null;

  @Column({ nullable: true, type: 'text' })
  warmupProviderConfigurationKey: string | null;

  @Column({ nullable: true, type: 'text' })
  warmupEnrollmentId: string | null;

  @Column({ type: 'text' })
  warmupState: ManagedEmailWarmupState;

  @Column({ nullable: true, type: 'timestamptz' })
  warmupPaidThrough: Date | null;

  @Column({ type: 'boolean' })
  warmupCancelAtPeriodEnd: boolean;

  @Column({ nullable: true, type: 'uuid' })
  metronomeWarmupSubscriptionId: string | null;

  @Column({ type: 'text', update: false })
  readinessPolicyVersion: string;

  @Column({ type: 'text' })
  campaignEligibility: ManagedEmailCampaignEligibility;

  @Column({ type: 'integer' })
  policySafeDailyCapacity: number;

  @Column({ nullable: true, type: 'integer' })
  adminDailyCap: number | null;

  @Column({ type: 'jsonb' })
  healthFacts: ManagedEmailSafeFacts;

  @Column({ nullable: true, type: 'timestamptz' })
  lastHealthEvaluatedAt: Date | null;

  @Column({ nullable: true, type: 'timestamptz' })
  nextReconciliationAt: Date | null;

  @Column({ nullable: true, type: 'text' })
  safeFailureCode: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
