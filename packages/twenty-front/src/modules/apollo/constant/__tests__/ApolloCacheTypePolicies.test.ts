import { ApolloClient, InMemoryCache } from '@apollo/client';
import { MockLink } from '@apollo/client/testing';

import { APOLLO_CACHE_TYPE_POLICIES } from '@/apollo/constant/ApolloCacheTypePolicies';
import {
  GET_MYAH_AGENT,
  GET_MYAH_CAMPAIGN_AGENT_SETTING,
  UPDATE_MYAH_AGENT,
  UPDATE_MYAH_CAMPAIGN_AGENT_SETTING,
} from '@/myah/agent/graphql/myahAgentOperations';

// MYAH-456: after switching the Agent to "Draft for approval" the page kept
// showing "Send automatically" until a refresh.
const agent = (sendingMode: string) => ({
  __typename: 'MyahAgent',
  tone: 'Warm and friendly',
  responseLength: 'Concise',
  language: "Match the creator's language",
  brandInformation: '',
  replyRules: '',
  escalationBoundaries: '',
  sendingMode,
  sendingModeEnabledByName: null,
  sendingModeEnabledAt: null,
});

const setting = (preferredChannel: string) => ({
  __typename: 'MyahCampaignAgentSetting',
  campaignId: 'campaign-1',
  preferredChannel,
  requireReplyApproval: false,
  instagramAccountId: null,
  instagramAccountOptions: [],
});

const clientWith = (mocks: ConstructorParameters<typeof MockLink>[0]) =>
  new ApolloClient({
    cache: new InMemoryCache({ typePolicies: APOLLO_CACHE_TYPE_POLICIES }),
    link: new MockLink(mocks),
  });

describe('APOLLO_CACHE_TYPE_POLICIES', () => {
  it('shows the saved Agent sending mode without a refetch', async () => {
    const client = clientWith([
      {
        request: { query: GET_MYAH_AGENT },
        result: { data: { myahAgent: agent('SEND_AUTOMATICALLY') } },
      },
      {
        request: {
          query: UPDATE_MYAH_AGENT,
          variables: { input: { sendingMode: 'DRAFT_FOR_APPROVAL' } },
        },
        result: {
          data: { updateMyahAgent: agent('DRAFT_FOR_APPROVAL') },
        },
      },
    ]);

    await client.query({ query: GET_MYAH_AGENT });
    await client.mutate({
      mutation: UPDATE_MYAH_AGENT,
      variables: { input: { sendingMode: 'DRAFT_FOR_APPROVAL' } },
    });

    expect(
      client.readQuery<{ myahAgent: { sendingMode: string } }>({
        query: GET_MYAH_AGENT,
      })?.myahAgent.sendingMode,
    ).toBe('DRAFT_FOR_APPROVAL');
  });

  it("shows a Campaign's saved preferred channel without a refetch", async () => {
    const variables = { input: { campaignId: 'campaign-1' } };
    const updateVariables = {
      input: { campaignId: 'campaign-1', preferredChannel: 'INSTAGRAM' },
    };
    const client = clientWith([
      {
        request: { query: GET_MYAH_CAMPAIGN_AGENT_SETTING, variables },
        result: {
          data: { myahCampaignAgentSetting: setting('NO_PREFERENCE') },
        },
      },
      {
        request: {
          query: UPDATE_MYAH_CAMPAIGN_AGENT_SETTING,
          variables: updateVariables,
        },
        result: {
          data: { updateMyahCampaignAgentSetting: setting('INSTAGRAM') },
        },
      },
    ]);

    await client.query({ query: GET_MYAH_CAMPAIGN_AGENT_SETTING, variables });
    await client.mutate({
      mutation: UPDATE_MYAH_CAMPAIGN_AGENT_SETTING,
      variables: updateVariables,
    });

    expect(
      client.readQuery<{
        myahCampaignAgentSetting: { preferredChannel: string };
      }>({ query: GET_MYAH_CAMPAIGN_AGENT_SETTING, variables })
        ?.myahCampaignAgentSetting.preferredChannel,
    ).toBe('INSTAGRAM');
  });
});
