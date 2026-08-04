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
import {
  type ManagedEmailCorrelatedSubscriptionLine,
  type ManagedEmailExpectedLineItem,
  type ManagedEmailResourceSnapshot,
  type ManagedEmailProviderReceipt,
} from '../types/managed-email-persistence.type';
import {
  managedEmailCorrelatedSubscriptionLinesTransformer,
  managedEmailExpectedLineItemsTransformer,
  managedEmailNullableProviderReceiptTransformer,
  managedEmailResourceSnapshotTransformer,
} from '../utils/validate-managed-email-persistence-json.util';

@Check(
  'CHK_MANAGED_EMAIL_ACQUISITION_REQUIRED_TEXT',
  `btrim("idempotencyKey") <> '' AND btrim("proposalHash") <> '' AND btrim("quoteHash") <> '' AND btrim("catalogVersion") <> '' AND btrim("metronomeRateCardAlias") <> '' AND "currency" = 'USD' AND btrim("state") <> ''`,
)
@Check(
  'CHK_MANAGED_EMAIL_ACQUISITION_AMOUNT_ATTEMPTS',
  '"expectedAmountCents" > 0 AND "reconciliationAttemptCount" >= 0',
)
@Check(
  'CHK_MANAGED_EMAIL_ACQUISITION_SERVICE_PERIOD',
  '"servicePeriodEnd" > "servicePeriodStart"',
)
@Index(
  'IDX_MANAGED_EMAIL_ACQUISITION_RECONCILIATION_DUE',
  ['nextReconciliationAt'],
  { where: '"nextReconciliationAt" IS NOT NULL' },
)
@Unique('UQ_MANAGED_EMAIL_ACQUISITION_WORKSPACE_ID', ['workspaceId', 'id'])
@Unique('UQ_MANAGED_EMAIL_ACQUISITION_WORKSPACE_IDEMPOTENCY', [
  'workspaceId',
  'idempotencyKey',
])
@Entity({ name: 'managedEmailAcquisitionOperation', schema: 'core' })
export class ManagedEmailAcquisitionOperationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', update: false })
  workspaceId: string;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: Relation<WorkspaceEntity>;

  @Column({ type: 'text', update: false })
  idempotencyKey: string;

  @Column({ type: 'text', update: false })
  acquisitionMode: ManagedEmailAcquisitionMode;

  @Column({ type: 'text', update: false })
  providerConfigurationKey: string;

  @Column({ type: 'text', update: false })
  readinessPolicyVersion: string;

  @Column({ type: 'uuid', update: false })
  authorizedActorWorkspaceMemberId: string;

  @Column({ type: 'text', update: false })
  proposalHash: string;

  @Column({ type: 'text', update: false })
  quoteHash: string;

  @Column({
    transformer: managedEmailResourceSnapshotTransformer,
    type: 'jsonb',
    update: false,
  })
  resourceSnapshot: ManagedEmailResourceSnapshot;

  @Column({ type: 'text', update: false })
  catalogVersion: string;

  @Column({ type: 'uuid', update: false })
  metronomeRateCardId: string;

  @Column({ type: 'text', update: false })
  metronomeRateCardAlias: string;

  @Column({
    transformer: managedEmailExpectedLineItemsTransformer,
    type: 'jsonb',
    update: false,
  })
  expectedLineItems: readonly ManagedEmailExpectedLineItem[];

  @Column({ type: 'bigint', update: false })
  expectedAmountCents: string;

  @Column({ type: 'text', update: false })
  currency: 'USD';

  @Column({ type: 'timestamptz', update: false })
  servicePeriodStart: Date;

  @Column({ type: 'timestamptz', update: false })
  servicePeriodEnd: Date;

  @Column({ nullable: true, type: 'uuid' })
  metronomeCustomerId: string | null;

  @Column({ nullable: true, type: 'uuid' })
  metronomeContractId: string | null;

  @Column({ array: true, nullable: true, type: 'uuid' })
  metronomeEditIds: string[] | null;

  @Column({ array: true, nullable: true, type: 'uuid' })
  metronomeSubscriptionIds: string[] | null;

  @Column({ nullable: true, type: 'uuid' })
  metronomeInvoiceId: string | null;

  @Column({ nullable: true, type: 'text' })
  externalInvoiceId: string | null;

  @Column({ nullable: true, type: 'text' })
  externalPaymentId: string | null;

  @Column({ nullable: true, type: 'text' })
  paymentStatus: string | null;

  @Column({
    nullable: true,
    transformer: managedEmailCorrelatedSubscriptionLinesTransformer,
    type: 'jsonb',
  })
  correlatedSubscriptionLines:
    | readonly ManagedEmailCorrelatedSubscriptionLine[]
    | null;

  @Column({ nullable: true, type: 'text' })
  providerIntentHash: string | null;

  @Column({
    nullable: true,
    transformer: managedEmailNullableProviderReceiptTransformer,
    type: 'jsonb',
  })
  providerReceipt: ManagedEmailProviderReceipt | null;

  @Column({ nullable: true, type: 'text' })
  providerOutcome: string | null;

  @Column({ type: 'text' })
  state: string;

  @Column({ default: 0, type: 'integer' })
  reconciliationAttemptCount: number;

  @Column({ nullable: true, type: 'timestamptz' })
  nextReconciliationAt: Date | null;

  @Column({ nullable: true, type: 'text' })
  safeFailureCode: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
