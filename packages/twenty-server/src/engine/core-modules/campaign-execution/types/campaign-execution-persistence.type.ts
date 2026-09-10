export const CAMPAIGN_ENROLLMENT_STATES = [
  'ACTIVE',
  'REPLIED',
  'EXCLUDED',
  'FINISHED',
] as const;

export type CampaignEnrollmentState =
  (typeof CAMPAIGN_ENROLLMENT_STATES)[number];

export const CAMPAIGN_OCCURRENCE_STATES = [
  'PENDING',
  'IN_FLIGHT',
  'SUCCEEDED',
  'SKIPPED',
  'HELD',
  'UNKNOWN',
  'CANCELLED',
] as const;

export type CampaignOccurrenceState =
  (typeof CAMPAIGN_OCCURRENCE_STATES)[number];

// Reasons remain opaque persisted evidence until progression freezes vocabulary.
export type CampaignEnrollmentHoldReason = string;
export type CampaignEnrollmentTerminalReason = string;
export type CampaignOccurrenceHoldReason = string;
export type CampaignOccurrenceTerminalReason = string;
