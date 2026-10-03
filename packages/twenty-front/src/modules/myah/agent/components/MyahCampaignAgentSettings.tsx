import { useMutation, useQuery } from '@apollo/client/react';
import { Link } from 'react-router-dom';

import {
  StyledAgentBody,
  StyledAgentCard,
  StyledAgentChoice,
  StyledAgentField,
  StyledAgentGrid,
  StyledAgentHint,
  StyledAgentIntro,
  StyledAgentList,
} from '@/myah/agent/components/MyahAgentFormStyles';
import {
  GET_MYAH_AGENT,
  GET_MYAH_CAMPAIGN_AGENT_SETTING,
  UPDATE_MYAH_CAMPAIGN_AGENT_SETTING,
  type MyahAgent,
  type MyahCampaignAgentSetting,
  type MyahCampaignPreferredChannel,
} from '@/myah/agent/graphql/myahAgentOperations';
import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';

type MyahCampaignAgentSettingsProps = { campaignId: string };

export const useMyahCampaignAgentSetting = (campaignId: string) => {
  const { enqueueErrorSnackBar } = useSnackBar();
  const query = useQuery<{
    myahCampaignAgentSetting: MyahCampaignAgentSetting;
  }>(GET_MYAH_CAMPAIGN_AGENT_SETTING, { variables: { input: { campaignId } } });
  const [mutate, { loading: saving }] = useMutation(
    UPDATE_MYAH_CAMPAIGN_AGENT_SETTING,
  );
  const update = async (input: Record<string, unknown>) => {
    try {
      await mutate({ variables: { input: { campaignId, ...input } } });
      return true;
    } catch (error) {
      enqueueErrorSnackBar({
        message:
          error instanceof Error
            ? error.message
            : 'Campaign agent settings could not be saved.',
      });
      return false;
    }
  };
  return {
    setting: query.data?.myahCampaignAgentSetting,
    loading: query.loading,
    saving,
    update,
  };
};

const CHANNELS: Array<{
  value: MyahCampaignPreferredChannel;
  label: string;
  describe: (handle: string | null) => string;
}> = [
  {
    value: 'INSTAGRAM',
    label: 'Instagram',
    describe: (handle) =>
      `When a creator replies by email, the agent answers and invites them once to DM ${handle ? `@${handle}` : 'your Instagram account'}.`,
  },
  {
    value: 'EMAIL',
    label: 'Email',
    describe: () =>
      'When a creator replies on Instagram, the agent answers and invites them once to continue by email.',
  },
  {
    value: 'NO_PREFERENCE',
    label: 'No preference',
    describe: () => 'The agent replies on whichever channel the creator used.',
  },
];

export const MyahCampaignAgentSettings = ({
  campaignId,
}: MyahCampaignAgentSettingsProps) => {
  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular: 'campaign',
  });
  const { canUpdateObjectRecords } = useObjectPermissionsForObject(
    objectMetadataItem.id,
  );
  const { setting, loading, saving, update } =
    useMyahCampaignAgentSetting(campaignId);
  const { data: agentData } = useQuery<{ myahAgent: MyahAgent }>(
    GET_MYAH_AGENT,
  );
  const automatic = agentData?.myahAgent?.sendingMode === 'SEND_AUTOMATICALLY';
  const disabled = !canUpdateObjectRecords || loading || saving;
  const handle =
    setting?.instagramAccountOptions.find(
      (account) => account.id === setting.instagramAccountId,
    )?.username ?? null;
  const thisCampaign = setting?.requireReplyApproval
    ? 'Always require approval'
    : automatic
      ? 'Sends automatically'
      : 'Drafts for approval';

  return (
    <StyledAgentBody aria-label="Campaign agent">
      <StyledAgentIntro>
        <h2>How the agent works on this Campaign</h2>
        <p>
          Voice, brand information and hand-off rules are shared by every
          Campaign on the <Link to="/myah/agent">Agent page</Link>. The brief
          lives in the Campaign tab.
        </p>
      </StyledAgentIntro>
      <StyledAgentGrid>
        <div>
          <StyledAgentCard aria-label="Preferred conversation channel">
            <h3>Preferred conversation channel</h3>
            <StyledAgentHint>
              Where you want negotiations with this Campaign&apos;s creators to
              happen.
            </StyledAgentHint>
            {CHANNELS.map((channel) => (
              <StyledAgentChoice
                key={channel.value}
                data-selected={setting?.preferredChannel === channel.value}
              >
                <input
                  type="radio"
                  name="preferred-channel"
                  checked={setting?.preferredChannel === channel.value}
                  disabled={disabled}
                  onChange={() => update({ preferredChannel: channel.value })}
                />
                <div>
                  <strong>{channel.label}</strong>
                  <span>{channel.describe(handle)}</span>
                </div>
              </StyledAgentChoice>
            ))}
          </StyledAgentCard>
          <StyledAgentCard aria-label="Approval">
            <h3>Approval</h3>
            <StyledAgentField>
              <span>
                <input
                  type="checkbox"
                  checked={setting?.requireReplyApproval ?? false}
                  disabled={disabled}
                  onChange={(event) =>
                    update({ requireReplyApproval: event.target.checked })
                  }
                />{' '}
                Always require approval
              </span>
            </StyledAgentField>
            <StyledAgentHint>
              Drafts only for this Campaign, even when the agent sends
              automatically.
            </StyledAgentHint>
          </StyledAgentCard>
        </div>
        <div>
          <StyledAgentCard aria-label="Workspace agent">
            <h3>Workspace agent</h3>
            <StyledAgentHint>
              Sending:{' '}
              <strong>
                {automatic ? 'Send automatically' : 'Draft for approval'}
              </strong>
            </StyledAgentHint>
            <StyledAgentHint>
              This Campaign: <strong>{thisCampaign}</strong>
            </StyledAgentHint>
            <StyledAgentHint>
              <Link to="/myah/agent">Edit voice, brand info and rules →</Link>
            </StyledAgentHint>
          </StyledAgentCard>
          <StyledAgentCard aria-label="Campaign facts">
            <h3>Campaign facts the agent uses</h3>
            <StyledAgentList>
              <li>Objective</li>
              <li>Campaign brief (offer and deliverables)</li>
              <li>Additional notes</li>
            </StyledAgentList>
            <StyledAgentHint>Edit them in the Campaign tab.</StyledAgentHint>
          </StyledAgentCard>
        </div>
      </StyledAgentGrid>
    </StyledAgentBody>
  );
};
