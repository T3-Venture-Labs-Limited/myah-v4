import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

import { type CampaignSequenceAuthorizationBinding } from 'src/engine/core-modules/campaign-sequence-authority/types/campaign-sequence-authorization.type';

export enum CampaignSequenceAuthorizationState {
  ACTIVE = 'ACTIVE',
  REVOKED = 'REVOKED',
}

export enum CampaignSequenceAuthorizationRevocationReason {
  CAMPAIGN_PAUSED = 'CAMPAIGN_PAUSED',
  CAMPAIGN_COMPLETED = 'CAMPAIGN_COMPLETED',
}

@Entity({ name: 'campaignSequenceAuthorization', schema: 'core' })
@Unique('UQ_CSA_SCOPE_AUTHORIZATION', [
  'workspaceId',
  'campaignId',
  'authorizationId',
])
@Unique('UQ_CSA_SCOPE_AUTH_VERSION', [
  'workspaceId',
  'campaignId',
  'authorizationId',
  'workflowVersionId',
])
@Unique('UQ_CSA_SCOPE_START_KEY', [
  'workspaceId',
  'campaignId',
  'startIdempotencyKey',
])
@Unique('UQ_CSA_SCOPE_GENERATION', ['workspaceId', 'campaignId', 'generation'])
@Index('UQ_CSA_ONE_ACTIVE_SCOPE', ['workspaceId', 'campaignId'], {
  unique: true,
  where: `"state" = 'ACTIVE'`,
})
@Check('CHK_CSA_GENERATION_POSITIVE', '"generation" > 0')
@Check(
  'CHK_CSA_PREPARED_FINGERPRINT',
  `"preparedFingerprint" ~ '^[0-9a-f]{64}$'`,
)
@Check('CHK_CSA_STATE', `"state" IN ('ACTIVE', 'REVOKED')`)
@Check(
  'CHK_CSA_REVOCATION_SHAPE',
  `("state" = 'ACTIVE' AND "revokedAt" IS NULL AND "revocationReason" IS NULL) OR ("state" = 'REVOKED' AND "revokedAt" IS NOT NULL AND "revocationReason" IS NOT NULL)`,
)
export class CampaignSequenceAuthorizationEntity {
  @PrimaryColumn({
    type: 'uuid',
    primaryKeyConstraintName: 'PK_CAMPAIGN_SEQUENCE_AUTHORIZATION',
  })
  authorizationId: string;

  @Column({ type: 'uuid' })
  workspaceId: string;

  @Column({ type: 'uuid' })
  campaignId: string;

  @Column({ type: 'uuid' })
  campaignExecutionId: string;

  @Column({ type: 'integer' })
  generation: number;

  @Column({ type: 'uuid' })
  startIdempotencyKey: string;

  @Column({ type: 'varchar', length: 64 })
  preparedFingerprint: string;

  @Column({ type: 'uuid' })
  workflowId: string;

  @Column({ type: 'uuid' })
  workflowVersionId: string;

  @Column({ type: 'uuid' })
  initiatingUserWorkspaceId: string;

  @Column({
    type: 'enum',
    enum: CampaignSequenceAuthorizationState,
    enumName: 'campaignSequenceAuthorization_state_enum',
  })
  state: CampaignSequenceAuthorizationState;

  @Column({ type: 'timestamptz' })
  authorizedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({
    type: 'enum',
    enum: CampaignSequenceAuthorizationRevocationReason,
    enumName: 'campaignSequenceAuthorization_revocationReason_enum',
    nullable: true,
  })
  revocationReason: CampaignSequenceAuthorizationRevocationReason | null;

  @Column({ type: 'jsonb' })
  binding: CampaignSequenceAuthorizationBinding;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
