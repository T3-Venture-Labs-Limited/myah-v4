import { gql } from '@apollo/client';

export const FIND_CAMPAIGN_OUTREACH_WORKFLOW = gql`
  query FindCampaignOutreachWorkflow($campaignId: UUID!) {
    findCampaignOutreachWorkflow(campaignId: $campaignId) {
      campaignId
      currentVersionId
      name
      workflowId
    }
  }
`;

export const CREATE_CAMPAIGN_OUTREACH_WORKFLOW = gql`
  mutation CreateCampaignOutreachWorkflow($campaignId: UUID!) {
    createCampaignOutreachWorkflow(campaignId: $campaignId) {
      campaignId
      currentVersionId
      name
      workflowId
    }
  }
`;
