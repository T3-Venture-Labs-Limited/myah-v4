import { AppPath } from 'twenty-shared/types';
import { getAppPath } from 'twenty-shared/utils';

export type CampaignCreatorInboxReturnTarget = {
  workspaceId: string;
  campaignId: string;
  membershipId: string;
  influencerTabId: string;
  pathname: string;
  search: string;
  scrollTop?: number;
};

export const isCampaignCreatorInboxReturnTarget = (
  value: unknown,
  workspaceId: string,
): value is CampaignCreatorInboxReturnTarget => {
  if (!value || typeof value !== 'object') return false;
  const target = value as Partial<CampaignCreatorInboxReturnTarget>;
  return (
    target.workspaceId === workspaceId &&
    typeof target.campaignId === 'string' &&
    target.campaignId.length > 0 &&
    typeof target.membershipId === 'string' &&
    target.membershipId.length > 0 &&
    typeof target.influencerTabId === 'string' &&
    /^[a-zA-Z0-9-]+$/.test(target.influencerTabId) &&
    target.pathname ===
      getAppPath(AppPath.RecordShowPage, {
        objectNameSingular: 'campaign',
        objectRecordId: target.campaignId,
      }) &&
    typeof target.search === 'string' &&
    (target.search === '' || target.search.startsWith('?')) &&
    (target.scrollTop === undefined ||
      (typeof target.scrollTop === 'number' &&
        Number.isFinite(target.scrollTop) &&
        target.scrollTop >= 0))
  );
};
