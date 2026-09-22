import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'campaignForecastHead', schema: 'core' })
export class CampaignForecastHeadEntity {
  @PrimaryColumn({ type: 'uuid' })
  workspaceId: string;

  @PrimaryColumn({ type: 'text' })
  scopeKey: string;

  @Column({ type: 'bigint', default: 1 })
  inputRevision: string;

  @Column({ type: 'uuid', nullable: true })
  currentGenerationId: string | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
