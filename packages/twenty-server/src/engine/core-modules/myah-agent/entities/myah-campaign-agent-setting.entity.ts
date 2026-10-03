import {
  Check,
  Column,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

export const MYAH_CAMPAIGN_PREFERRED_CHANNELS = [
  'INSTAGRAM',
  'EMAIL',
  'NO_PREFERENCE',
] as const;

export type MyahCampaignPreferredChannel =
  (typeof MYAH_CAMPAIGN_PREFERRED_CHANNELS)[number];

// Campaign-level reply-agent controls and the Campaign's Instagram sender.
// Kept in core (not workspace metadata) so background jobs read it directly.
@Entity({ name: 'myahCampaignAgentSetting', schema: 'core' })
@Check(
  'CHK_MYAH_CAMPAIGN_AGENT_SETTING_CHANNEL',
  `"preferredChannel" IN ('INSTAGRAM','EMAIL','NO_PREFERENCE')`,
)
export class MyahCampaignAgentSettingEntity {
  @PrimaryColumn({ type: 'uuid' })
  workspaceId: string;

  @PrimaryColumn({ type: 'uuid' })
  campaignId: string;

  @Column({ type: 'uuid', nullable: true })
  instagramAccountId: string | null;

  @Column({ type: 'text', default: 'NO_PREFERENCE' })
  preferredChannel: MyahCampaignPreferredChannel;

  @Column({ type: 'boolean', default: false })
  requireReplyApproval: boolean;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
