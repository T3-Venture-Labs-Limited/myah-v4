export type CampaignOutreachAudienceExclusionReason =
  | 'INVALID_MEMBERSHIP'
  | 'OPERATOR_EXCLUDED'
  | 'MISSING_CREATOR'
  | 'INVALID_STAGE'
  | 'ACTIVE_IN_OTHER_CAMPAIGN'
  | 'NO_USABLE_CHANNEL'
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
  // Null when the creator has no usable email; their email steps are skipped.
  normalizedEmail: string | null;
  // Null when the creator has no Instagram handle; Instagram steps are skipped.
  instagramHandle: string | null;
}>;

export type CampaignOutreachAudienceExclusion =
  CampaignOutreachAudienceIdentity &
    Readonly<{
      reasons: readonly CampaignOutreachAudienceExclusionReason[];
      // Set with ACTIVE_IN_OTHER_CAMPAIGN.
      activeCampaignName?: string | null;
    }>;

export type CampaignOutreachAudienceReview = Readonly<{
  campaignId: string;
  eligible: readonly EligibleCampaignOutreachAudienceIdentity[];
  excluded: readonly CampaignOutreachAudienceExclusion[];
}>;
