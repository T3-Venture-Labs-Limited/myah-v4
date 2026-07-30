import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

import { ManagedProviderOperationState } from '../enums/managed-provider-operation-state.enum';
import { type SafeMetronomeEventProperties } from '../types/safe-metronome-event-properties.type';

@Index(
  'IDX_MANAGED_PROVIDER_OPERATION_PROVIDER_EXECUTION_UNIQUE',
  ['providerKey', 'providerConfigurationKey', 'providerExecutionId'],
  {
    unique: true,
    where: '"providerExecutionId" IS NOT NULL',
  },
)
@Index(
  'IDX_MANAGED_PROVIDER_OPERATION_DELIVERY_DUE',
  ['nextDeliveryAttemptAt'],
  { where: '"state" = \'USAGE_PENDING\'' },
)
@Index('IDX_MANAGED_PROVIDER_OPERATION_STALE_RESERVATION', ['createdAt'], {
  where: "\"state\" IN ('RESERVED', 'RECONCILIATION_REQUIRED')",
})
@Unique('UQ_MANAGED_PROVIDER_OPERATION_WORKSPACE_REQUEST', [
  'workspaceId',
  'requestId',
])
@Entity({ name: 'managedProviderOperation', schema: 'core' })
export class ManagedProviderOperationEntity {
  @Column({ type: 'uuid' })
  workspaceId: string;

  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true, type: 'uuid' })
  actorUserWorkspaceId: string | null;

  @Column({ type: 'text' })
  requestId: string;

  @Column({ type: 'text' })
  providerKey: string;

  @Column({ type: 'text' })
  providerConfigurationKey: string;

  @Column({ type: 'text' })
  operationKey: string;

  @Column({ type: 'text' })
  metronomeEventType: string;

  @Column({ type: 'jsonb' })
  maximumUsageProperties: SafeMetronomeEventProperties;

  @Column({ type: 'jsonb' })
  expectedProductIds: string[];

  @Column({ type: 'jsonb' })
  expectedBillableMetricIds: string[];

  @Column({ nullable: true, type: 'jsonb' })
  actualUsageProperties: SafeMetronomeEventProperties | null;
  @Column({ type: 'jsonb' })
  maximumMetronomeProperties: SafeMetronomeEventProperties;

  @Column({ nullable: true, type: 'jsonb' })
  actualMetronomeProperties: SafeMetronomeEventProperties | null;

  @Column({ nullable: true, type: 'text' })
  completionOutcome: 'BILLABLE' | 'NON_BILLABLE_FAILURE' | 'UNKNOWN' | null;

  @Column({ type: 'bigint' })
  reservedAmountCents: string;

  @Column({ nullable: true, type: 'bigint' })
  quotedActualAmountCents: string | null;

  @Column({ nullable: true, type: 'text' })
  providerExecutionId: string | null;

  @Column({ nullable: true, type: 'bigint' })
  providerCostMicrousd: string | null;

  @Column({ default: ManagedProviderOperationState.RESERVED, type: 'text' })
  state: ManagedProviderOperationState;

  @Column({ default: 0, type: 'integer' })
  deliveryAttemptCount: number;

  @Column({ default: 0, type: 'integer' })
  settlementAttemptCount: number;

  @Column({ nullable: true, type: 'timestamptz' })
  nextDeliveryAttemptAt: Date | null;

  @Column({ nullable: true, type: 'timestamptz' })
  settleAfter: Date | null;

  @Column({ nullable: true, type: 'timestamptz' })
  deliveryEventAt: Date | null;

  @Column({ nullable: true, type: 'text' })
  lastDeliveryErrorCode: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @Column({ nullable: true, type: 'timestamptz' })
  completedAt: Date | null;

  @Column({ nullable: true, type: 'timestamptz' })
  metronomeAcceptedAt: Date | null;

  @Column({ nullable: true, type: 'timestamptz' })
  settledAt: Date | null;

  @Column({ nullable: true, type: 'timestamptz' })
  releasedAt: Date | null;
}
