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

import { ManagedEmailAcquisitionMode } from '../enums/managed-email-acquisition-mode.enum';
import { ManagedEmailInfrastructureState } from '../enums/managed-email-infrastructure-state.enum';
import { type ManagedEmailSafeFacts } from '../types/managed-email-persistence.type';

@Check(
  'CHK_MANAGED_EMAIL_DOMAIN_IDENTITIES_NONEMPTY',
  `btrim("domain") <> '' AND btrim("normalizedDomain") <> '' AND btrim("providerType") <> '' AND btrim("providerConfigurationKey") <> ''`,
)
@Index(
  'IDX_MANAGED_EMAIL_DOMAIN_PROVIDER_ID_UNIQUE',
  ['providerConfigurationKey', 'providerDomainId'],
  { unique: true, where: '"providerDomainId" IS NOT NULL' },
)
@Index(
  'IDX_MANAGED_EMAIL_DOMAIN_RECONCILIATION_DUE',
  ['nextReconciliationAt'],
  { where: '"nextReconciliationAt" IS NOT NULL' },
)
@Index('IDX_MANAGED_EMAIL_DOMAIN_PAID_THROUGH', ['paidThrough'])
@Index('IDX_MANAGED_EMAIL_DOMAIN_EXPIRY', ['expiresAt'])
@Unique('UQ_MANAGED_EMAIL_DOMAIN_WORKSPACE_NORMALIZED', [
  'workspaceId',
  'normalizedDomain',
])
@Unique('UQ_MANAGED_EMAIL_DOMAIN_WORKSPACE_ID', ['workspaceId', 'id'])
@Entity({ name: 'managedEmailDomain', schema: 'core' })
export class ManagedEmailDomainEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', update: false })
  workspaceId: string;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: Relation<WorkspaceEntity>;

  @Column({ type: 'text', update: false })
  domain: string;

  @Column({ type: 'text', update: false })
  normalizedDomain: string;

  @Column({ type: 'text', update: false })
  acquisitionMode: ManagedEmailAcquisitionMode;

  @Column({ type: 'text', update: false })
  providerType: string;

  @Column({ type: 'text', update: false })
  providerConfigurationKey: string;

  @Column({ nullable: true, type: 'text' })
  providerOrderId: string | null;

  @Column({ nullable: true, type: 'text' })
  providerDomainId: string | null;

  @Column({ type: 'text' })
  infrastructureState: ManagedEmailInfrastructureState;

  @Column({ type: 'jsonb' })
  dnsReadinessFacts: ManagedEmailSafeFacts;

  @Column({ nullable: true, type: 'timestamptz' })
  expiresAt: Date | null;

  @Column({ nullable: true, type: 'timestamptz' })
  paidThrough: Date | null;

  @Column({ type: 'boolean' })
  renewalEnabled: boolean;

  @Column({ type: 'boolean' })
  cancelAtPeriodEnd: boolean;

  @Column({ nullable: true, type: 'uuid' })
  metronomeSubscriptionId: string | null;

  @Column({ nullable: true, type: 'timestamptz' })
  lastReconciledAt: Date | null;

  @Column({ nullable: true, type: 'timestamptz' })
  nextReconciliationAt: Date | null;

  @Column({ nullable: true, type: 'text' })
  safeFailureCode: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
