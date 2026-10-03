import { gql } from '@apollo/client';

const MYAH_AGENT_FIELDS = gql`
  fragment MyahAgentFields on MyahAgent {
    tone
    responseLength
    language
    brandInformation
    replyRules
    escalationBoundaries
    sendingMode
    sendingModeEnabledByName
    sendingModeEnabledAt
  }
`;

export const GET_MYAH_AGENT = gql`
  ${MYAH_AGENT_FIELDS}
  query MyahAgent {
    myahAgent {
      ...MyahAgentFields
    }
  }
`;

export const UPDATE_MYAH_AGENT = gql`
  ${MYAH_AGENT_FIELDS}
  mutation UpdateMyahAgent($input: UpdateMyahAgentInput!) {
    updateMyahAgent(input: $input) {
      ...MyahAgentFields
    }
  }
`;

const MYAH_CAMPAIGN_AGENT_SETTING_FIELDS = gql`
  fragment MyahCampaignAgentSettingFields on MyahCampaignAgentSetting {
    campaignId
    preferredChannel
    requireReplyApproval
    instagramAccountId
    instagramAccountOptions {
      id
      username
      status
    }
  }
`;

export const GET_MYAH_CAMPAIGN_AGENT_SETTING = gql`
  ${MYAH_CAMPAIGN_AGENT_SETTING_FIELDS}
  query MyahCampaignAgentSetting($input: MyahCampaignAgentSettingInput!) {
    myahCampaignAgentSetting(input: $input) {
      ...MyahCampaignAgentSettingFields
    }
  }
`;

export const UPDATE_MYAH_CAMPAIGN_AGENT_SETTING = gql`
  ${MYAH_CAMPAIGN_AGENT_SETTING_FIELDS}
  mutation UpdateMyahCampaignAgentSetting(
    $input: UpdateMyahCampaignAgentSettingInput!
  ) {
    updateMyahCampaignAgentSetting(input: $input) {
      ...MyahCampaignAgentSettingFields
    }
  }
`;

export type MyahAgentSendingMode = 'DRAFT_FOR_APPROVAL' | 'SEND_AUTOMATICALLY';
export type MyahCampaignPreferredChannel =
  | 'INSTAGRAM'
  | 'EMAIL'
  | 'NO_PREFERENCE';

export type MyahAgent = {
  tone: string | null;
  responseLength: string | null;
  language: string | null;
  brandInformation: string | null;
  replyRules: string | null;
  escalationBoundaries: string | null;
  sendingMode: MyahAgentSendingMode;
  sendingModeEnabledByName: string | null;
  sendingModeEnabledAt: string | null;
};

export type MyahCampaignAgentSetting = {
  campaignId: string;
  preferredChannel: MyahCampaignPreferredChannel;
  requireReplyApproval: boolean;
  instagramAccountId: string | null;
  instagramAccountOptions: Array<{
    id: string;
    username: string | null;
    status: string | null;
  }>;
};
