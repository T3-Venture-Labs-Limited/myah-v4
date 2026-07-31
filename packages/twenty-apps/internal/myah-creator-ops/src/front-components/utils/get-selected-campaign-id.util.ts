export const getSelectedCampaignId = (ids: string[]): string | null =>
  ids.length === 1 ? ids[0] : null;
