import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

export type ManagedProviderFundingActionType =
  | 'SPONSORED_CREDIT'
  | 'PREPAID_COMMIT'
  | 'CORRECTION';
export type ManagedProviderFundingActionState =
  | 'PENDING'
  | 'SUCCEEDED'
  | 'RECONCILIATION_REQUIRED'
  | 'FAILED_DEFINITIVE';

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
export class ManagedProviderFundingActionEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid', update: false }) workspaceId: string;
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
  @Column({ type: 'timestamptz', nullable: true, update: false })
  expiresAt: Date | null;
  @Column({ type: 'jsonb', nullable: true, update: false })
  applicability: Record<string, unknown> | null;
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
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
