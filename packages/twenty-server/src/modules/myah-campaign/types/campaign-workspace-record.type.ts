export type CampaignWorkspaceRecord = {
  id: string;
  name: string | null;
  objective: string | null;
  lifecycleStatus: string | null;
  ownerId: string | null;
};

export type CampaignMutationData = Partial<CampaignWorkspaceRecord> & {
  lifecycleStatus?: unknown;
};

export type CampaignUpdateFilter = {
  id?: {
    eq?: string;
    in?: string[];
  };
  [key: string]: unknown;
};
