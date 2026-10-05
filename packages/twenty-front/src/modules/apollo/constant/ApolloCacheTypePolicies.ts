import { type TypePolicies } from '@apollo/client';

// Types without an `id` need key fields so a mutation result replaces the
// cached query result; otherwise the screen keeps the old value until a
// refresh (MYAH-456).
export const APOLLO_CACHE_TYPE_POLICIES: TypePolicies = {
  RemoteTable: {
    keyFields: ['name'],
  },
  // One agent per workspace.
  MyahAgent: {
    keyFields: [],
  },
  MyahCampaignAgentSetting: {
    keyFields: ['campaignId'],
  },
};
