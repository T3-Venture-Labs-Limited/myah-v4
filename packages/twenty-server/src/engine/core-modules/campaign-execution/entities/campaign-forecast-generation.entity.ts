import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  ForeignKey,
  Index,
  PrimaryColumn,
} from 'typeorm';

import { CampaignForecastHeadEntity } from 'src/engine/core-modules/campaign-execution/entities/campaign-forecast-head.entity';

@Entity({ name: 'campaignForecastGeneration', schema: 'core' })
@Index('IDX_CFG_SCOPE_CREATED', [
  'workspaceId',
  'scopeKey',
  'generatedAt',
  'id',
])
@ForeignKey(
  () => CampaignForecastHeadEntity,
  ['workspaceId', 'scopeKey'],
  ['workspaceId', 'scopeKey'],
  { onDelete: 'CASCADE' },
)
@Check('CHK_CFG_HORIZON_ORDER', '"horizonEndsAt" > "generatedAt"')
@Check('CHK_CFG_EVALUATED_NONNEGATIVE', '"evaluatedCount" >= 0')
export class CampaignForecastGenerationEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  workspaceId: string;

  @Column({ type: 'text' })
  scopeKey: string;

  @Column({ type: 'bigint' })
  inputRevision: string;

  @Column({ type: 'timestamptz' })
  generatedAt: Date;

  @Column({ type: 'timestamptz' })
  horizonEndsAt: Date;

  @Column({ type: 'boolean' })
  complete: boolean;

  @Column({ type: 'integer' })
  evaluatedCount: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
