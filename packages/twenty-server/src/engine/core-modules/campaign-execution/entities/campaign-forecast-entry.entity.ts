import { Column, Entity, ForeignKey, Index, PrimaryColumn } from 'typeorm';

import { CampaignForecastGenerationEntity } from 'src/engine/core-modules/campaign-execution/entities/campaign-forecast-generation.entity';

@Entity({ name: 'campaignForecastEntry', schema: 'core' })
@Index('IDX_CFE_WORKSPACE_CAMPAIGN', [
  'workspaceId',
  'campaignId',
  'generationId',
  'occurrenceId',
])
@ForeignKey(() => CampaignForecastGenerationEntity, ['generationId'], ['id'], {
  onDelete: 'CASCADE',
})
export class CampaignForecastEntryEntity {
  @PrimaryColumn({ type: 'uuid' })
  generationId: string;

  @PrimaryColumn({ type: 'uuid' })
  occurrenceId: string;

  @Column({ type: 'uuid' })
  workspaceId: string;

  @Column({ type: 'uuid' })
  campaignId: string;

  @Column({ type: 'uuid', nullable: true })
  connectedAccountId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  estimatedSendAt: Date | null;
}
