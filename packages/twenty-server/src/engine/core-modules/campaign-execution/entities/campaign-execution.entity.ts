import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'campaignExecution', schema: 'core' })
@Unique('UQ_CE_WORKSPACE_CAMPAIGN', ['workspaceId', 'campaignId'])
@Unique('UQ_CE_SCOPE_ID', ['workspaceId', 'campaignId', 'id'])
@Check('CHK_CE_WINDOW_ORDER', '"startLocalTime" < "endLocalTime"')
@Check('CHK_CE_TIME_ZONE_NONEMPTY', 'btrim("timeZone") <> \'\'')
@Check(
  'CHK_CE_CAPACITY_TIME_ZONE_NONEMPTY',
  'btrim("campaignCapacityTimeZone") <> \'\'',
)
export class CampaignExecutionEntity {
  @PrimaryColumn({
    type: 'uuid',
    primaryKeyConstraintName: 'PK_CAMPAIGN_EXECUTION',
  })
  id: string;

  @Column({ type: 'uuid' })
  workspaceId: string;

  @Column({ type: 'uuid' })
  campaignId: string;

  @Column({ type: 'text' })
  timeZone: string;

  @Column({ type: 'time without time zone' })
  startLocalTime: string;

  @Column({ type: 'time without time zone' })
  endLocalTime: string;

  @Column({ type: 'text' })
  campaignCapacityTimeZone: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
