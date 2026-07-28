export type CampaignWorkspaceRecord = {
  id: string;
  name: string | null;
  objective: string | null;
  status: string | null;
  ownerId: string | null;
};

export type CampaignMutationData = Partial<CampaignWorkspaceRecord> & {
  status?: unknown;
};

export type CampaignUpdateFilter = {
  id?: {
    eq?: string;
    in?: string[];
  };
  [key: string]: unknown;
};
