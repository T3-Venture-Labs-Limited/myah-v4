import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

export const MANAGED_PROVIDER_FUNDING_ACTION_STATES = [
  'PENDING',
  'METRONOME_EDIT_RECORDED',
  'PAYMENT_PENDING',
  'PAYMENT_ACTION_REQUIRED',
  'RECONCILIATION_REQUIRED',
  'SUCCEEDED',
  'FAILED_DEFINITIVE',
  'REFUND_INTENT_RECORDED',
  'REFUND_RECONCILIATION_REQUIRED',
  'REFUNDED',
] as const;

export type ManagedProviderFundingActionType =
  | 'SPONSORED_CREDIT'
  | 'PREPAID_COMMIT'
  | 'CORRECTION';
export type ManagedProviderFundingActionState =
  (typeof MANAGED_PROVIDER_FUNDING_ACTION_STATES)[number];

@Entity({ name: 'managedProviderFundingAction', schema: 'core' })
@Unique('UQ_MANAGED_PROVIDER_FUNDING_ACTION_IDEMPOTENCY', [
  'workspaceId',
  'idempotencyKey',
])
@Unique('UQ_MANAGED_PROVIDER_FUNDING_ACTION_EXTERNAL_REFERENCE', [
  'externalReference',
])
@Unique('UQ_MANAGED_PROVIDER_FUNDING_ACTION_METRONOME_KEY', [
  'metronomeUniquenessKey',
])
@Index('IDX_MANAGED_PROVIDER_FUNDING_ACTION_PENDING', ['state', 'createdAt'])
@Index('IDX_MANAGED_PROVIDER_FUNDING_ACTION_RECONCILIATION_DUE', [
  'state',
  'nextReconciliationAt',
])
export class ManagedProviderFundingActionEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid', nullable: true, update: false }) workspaceId:
    | string
    | null;
  @Column({ type: 'text', update: false }) fundingType: string;
  @Column({ type: 'text', update: false })
  actionType: ManagedProviderFundingActionType;
  @Column({ type: 'text', update: false }) operatorIdentity: string;
  @Column({ type: 'text', update: false }) permissionUsed: string;
  @Column({ type: 'text', update: false }) idempotencyKey: string;
  @Column({ type: 'text', update: false }) externalReference: string;
  @Column({ type: 'text', update: false }) metronomeUniquenessKey: string;
  @Column({ type: 'bigint', update: false }) amountCents: string;
  @Column({ type: 'text', default: 'USD', update: false }) currency: string;
  @Column({ type: 'text', update: false }) reason: string;
  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null;
  @Column({ type: 'jsonb', nullable: true, update: false })
  applicability: Record<string, unknown> | null;
  @Column({ type: 'jsonb', nullable: true, update: false })
  applicableProductIds: string[] | null;
  @Column({ type: 'text', nullable: true, update: false })
  creditProductId: string | null;
  @Column({ type: 'jsonb', nullable: true, update: false })
  paymentEvidence: Record<string, unknown> | null;
  @Column({ type: 'uuid', nullable: true, update: false })
  correctedOperationId: string | null;
  @Column({ type: 'text', default: 'PENDING' })
  state: ManagedProviderFundingActionState;
  @Column({ type: 'text', nullable: true }) metronomeEditId: string | null;
  @Column({ type: 'text', nullable: true }) creditId: string | null;
  @Column({ type: 'text', nullable: true }) commitmentId: string | null;
  @Column({ type: 'text', nullable: true }) externalResourceId: string | null;
  @Column({ type: 'text', nullable: true }) safeErrorCode: string | null;
  @Column({ type: 'text', nullable: true }) failureCode: string | null;
  @Column({ type: 'text', nullable: true }) metronomeCustomerId: string | null;
  @Column({ type: 'text', nullable: true }) metronomeContractId: string | null;
  @Column({ type: 'text', nullable: true }) metronomeInvoiceId: string | null;
  @Column({ type: 'text', nullable: true })
  stripeBillingConfigurationId: string | null;
  @Column({ type: 'text', nullable: true }) stripeDeliveryMethodId:
    | string
    | null;
  @Column({ type: 'text', nullable: true }) stripeCustomerId: string | null;
  @Column({ type: 'text', nullable: true }) stripeInvoiceId: string | null;
  @Column({ type: 'text', nullable: true }) stripePaymentIntentId:
    | string
    | null;
  @Column({ type: 'text', nullable: true }) stripeCreditNoteId: string | null;
  @Column({ type: 'text', nullable: true }) stripeRefundId: string | null;
  @Column({ type: 'bigint', nullable: true })
  prepaidPrincipalCents: string | null;
  @Column({ type: 'bigint', nullable: true }) taxCents: string | null;
  @Column({ type: 'bigint', nullable: true })
  collectedTotalCents: string | null;
  @Column({ type: 'jsonb', nullable: true }) paymentReceipt: Record<
    string,
    unknown
  > | null;
  @Column({ type: 'jsonb', nullable: true }) refundReceipt: Record<
    string,
    unknown
  > | null;
  @Column({ type: 'timestamptz', nullable: true })
  nextReconciliationAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true })
  reconciliationClaimedAt: Date | null;
  @Column({ type: 'integer', default: 0 })
  reconciliationAttemptCount: number;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
