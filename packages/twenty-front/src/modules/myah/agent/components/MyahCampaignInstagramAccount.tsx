import { useMyahCampaignAgentSetting } from '@/myah/agent/components/MyahCampaignAgentSettings';
import {
  StyledAgentCard,
  StyledAgentField,
  StyledAgentHint,
} from '@/myah/agent/components/MyahAgentFormStyles';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'connected',
  NEEDS_RECONNECT: 'reconnect required',
  ERROR: 'error',
  CONNECTING: 'connecting',
};

export const MyahCampaignInstagramAccount = ({
  campaignId,
}: {
  campaignId: string;
}) => {
  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular: 'campaign',
  });
  const { canUpdateObjectRecords } = useObjectPermissionsForObject(
    objectMetadataItem.id,
  );
  const { setting, loading, saving, update } =
    useMyahCampaignAgentSetting(campaignId);
  const options = setting?.instagramAccountOptions ?? [];
  const selected = options.find(
    (account) => account.id === setting?.instagramAccountId,
  );

  return (
    <StyledAgentCard aria-label="Instagram account">
      <h3>Instagram account</h3>
      {options.length === 0 && !loading ? (
        <StyledAgentHint>
          No Instagram account is connected. Connect one in Settings to send
          Instagram steps.
        </StyledAgentHint>
      ) : (
        <StyledAgentField>
          One account per Campaign
          <select
            value={setting?.instagramAccountId ?? ''}
            disabled={!canUpdateObjectRecords || loading || saving}
            onChange={(event) =>
              update({ instagramAccountId: event.target.value || null })
            }
          >
            {setting?.instagramAccountId ? null : (
              <option value="">Choose an account</option>
            )}
            {options.map((account) => (
              <option key={account.id} value={account.id}>
                @{account.username ?? account.id} ·{' '}
                {STATUS_LABEL[account.status ?? ''] ?? account.status}
              </option>
            ))}
          </select>
        </StyledAgentField>
      )}
      {selected && selected.status !== 'ACTIVE' ? (
        <StyledAgentHint>
          @{selected.username} needs reconnecting. Instagram steps wait until it
          is reconnected.
        </StyledAgentHint>
      ) : null}
      <StyledAgentHint>
        Cold DMs from this account are limited to 10 an hour and 100 a day
        across all Campaigns that use it. Replies to creators who have written
        to you are not limited. The account can be changed while the Campaign is
        Draft or Stopped.
      </StyledAgentHint>
    </StyledAgentCard>
  );
};
