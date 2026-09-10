import { type CampaignSequenceAuthorizationCurrentProjection } from 'src/engine/core-modules/campaign-sequence-authority/types/campaign-sequence-authorization.type';

export type CampaignWorkspaceRecord = {
  id: string;
  name: string | null;
  objective: string | null;
  lifecycleStatus: string | null;
  ownerId: string | null;
  sequenceAuthorization: CampaignSequenceAuthorizationCurrentProjection | null;
};

export type CampaignMutationData = Partial<
  Omit<CampaignWorkspaceRecord, 'sequenceAuthorization'>
> & {
  lifecycleStatus?: unknown;
};

export type CampaignUpdateFilter = {
  id?: {
    eq?: string;
    in?: string[];
  };
  [key: string]: unknown;
};
