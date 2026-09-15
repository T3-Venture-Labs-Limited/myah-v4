import {
  Check,
  Column,
  Entity,
  ForeignKey,
  PrimaryColumn,
  Unique,
} from 'typeorm';

import { CampaignSequenceAuthorizationEntity } from 'src/engine/core-modules/campaign-sequence-authority/entities/campaign-sequence-authorization.entity';
import { CampaignExecutionEntity } from 'src/engine/core-modules/campaign-execution/entities/campaign-execution.entity';

@Entity({ name: 'campaignActivation', schema: 'core' })
@Unique('UQ_CA_SCOPE_AUTHORIZATION', [
  'workspaceId',
  'campaignId',
  'authorizationId',
])
@Unique('UQ_CA_SCOPE_AUTH_VERSION', [
  'workspaceId',
  'campaignId',
  'authorizationId',
  'workflowVersionId',
])
@ForeignKey(
  () => CampaignExecutionEntity,
  ['workspaceId', 'campaignId', 'campaignExecutionId'],
  ['workspaceId', 'campaignId', 'id'],
  {
    name: 'FK_CA_EXECUTION_SCOPE',
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  },
)
@ForeignKey(
  () => CampaignSequenceAuthorizationEntity,
  ['workspaceId', 'campaignId', 'authorizationId', 'workflowVersionId'],
  ['workspaceId', 'campaignId', 'authorizationId', 'workflowVersionId'],
  {
    name: 'FK_CA_AUTHORIZATION_SCOPE',
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  },
)
@Check(
  'CHK_CA_AUTHORIZATION_GENERATION_POSITIVE',
  '"authorizationGeneration" > 0',
)
@Check(
  'CHK_CA_COUNTS_NONNEGATIVE',
  '"createdEnrollmentCount" >= 0 AND "createdOccurrenceCount" >= 0',
)
export class CampaignActivationEntity {
  @PrimaryColumn({
    type: 'uuid',
    primaryKeyConstraintName: 'PK_CAMPAIGN_ACTIVATION',
    update: false,
  })
  id: string;

  @Column({ type: 'uuid', update: false })
  workspaceId: string;

  @Column({ type: 'uuid', update: false })
  campaignId: string;

  @Column({ type: 'uuid', update: false })
  campaignExecutionId: string;

  @Column({ type: 'uuid', update: false })
  authorizationId: string;

  @Column({ type: 'integer', update: false })
  authorizationGeneration: number;

  @Column({ type: 'uuid', update: false })
  workflowVersionId: string;

  @Column({ type: 'timestamptz', update: false })
  activatedAt: Date;

  @Column({ type: 'integer', update: false })
  createdEnrollmentCount: number;

  @Column({ type: 'integer', update: false })
  createdOccurrenceCount: number;
}
