export const MYAH_CAMPAIGN_CREATOR_STAGES = [
  'READY',
  'CONTACTED',
  'NEGOTIATING',
  'ONBOARDED',
  'PRODUCT_SENT',
  'WAITING_FOR_POST',
  'POSTED',
  'DROPPED',
] as const;

export type MyahCampaignCreatorStage =
  (typeof MYAH_CAMPAIGN_CREATOR_STAGES)[number];

// oxlint-disable-next-line twenty/max-consts-per-file
export const MYAH_CAMPAIGN_CREATOR_DEFAULT_STAGE =
  'READY' satisfies MyahCampaignCreatorStage;
