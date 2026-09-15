export type CampaignOutreachAudienceExclusionReason =
  | 'INVALID_MEMBERSHIP'
  | 'MISSING_CREATOR'
  | 'INVALID_STAGE'
  | 'NON_EMAIL_CONTACT_METHOD'
  | 'INVALID_EMAIL'
  | 'SUPPRESSED_EMAIL'
  | 'DUPLICATE_CREATOR_EMAIL';

export type CampaignOutreachAudienceIdentity = Readonly<{
  campaignCreatorId: string;
  creatorId: string | null;
  creatorName: string | null;
}>;

export type EligibleCampaignOutreachAudienceIdentity = Readonly<{
  campaignCreatorId: string;
  creatorId: string;
  creatorName: string;
  normalizedEmail: string;
}>;

export type CampaignOutreachAudienceExclusion =
  CampaignOutreachAudienceIdentity &
    Readonly<{
      reasons: readonly CampaignOutreachAudienceExclusionReason[];
    }>;

export type CampaignOutreachAudienceReview = Readonly<{
  campaignId: string;
  eligible: readonly EligibleCampaignOutreachAudienceIdentity[];
  excluded: readonly CampaignOutreachAudienceExclusion[];
}>;
