import { type CampaignStatus } from 'src/modules/myah-campaign/types/campaign-status.type';

export const MYAH_CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER =
  '9a09d54a-d464-5692-ac74-70527fb00ddd';
export const MYAH_CAMPAIGN_CREATOR_OBJECT_UNIVERSAL_IDENTIFIER =
  'f9f0d7a8-7e05-519b-b158-5f543f7a7e9a';

export const CAMPAIGN_STATUSES = [
  'DRAFT',
  'ACTIVE',
  'PAUSED',
  'COMPLETED',
] as const;

export const CAMPAIGN_ALLOWED_TRANSITIONS: Record<
  CampaignStatus,
  readonly CampaignStatus[]
> = {
  DRAFT: ['ACTIVE'],
  ACTIVE: ['PAUSED', 'COMPLETED'],
  PAUSED: ['ACTIVE', 'COMPLETED'],
  COMPLETED: [],
};
