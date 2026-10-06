import { useMyahWorkspaceUsage } from '@/settings/billing/hooks/useMyahWorkspaceUsage';
import { useHasPermissionFlag } from '@/settings/roles/hooks/useHasPermissionFlag';
import { SettingsPath } from 'twenty-shared/types';
import { Button } from 'twenty-ui/input';
import { InlineBanner } from 'twenty-ui/feedback';
import { PermissionFlagType } from '~/generated-metadata/graphql';
import { useNavigateSettings } from '~/hooks/useNavigateSettings';
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
  INACTIVE: 'disconnected',
  DELETE_UNKNOWN: 'disconnect pending',
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
  const { isEnabled, hasAccess, usage } = useMyahWorkspaceUsage();
  const canManageAccounts = useHasPermissionFlag(
    PermissionFlagType.CONNECTED_ACCOUNTS,
  );
  const navigateSettings = useNavigateSettings();
  const options = setting?.instagramAccountOptions ?? [];
  const needsLapseReconnect =
    isEnabled &&
    hasAccess &&
    usage?.instagramReconnectRequired === true &&
    !loading &&
    !options.some((account) => account.status === 'ACTIVE');
  const selected = options.find(
    (account) => account.id === setting?.instagramAccountId,
  );

  return (
    <StyledAgentCard aria-label="Instagram account">
      <h3>Instagram account</h3>
      {options.length === 0 && !loading ? (
        <StyledAgentHint>
          {needsLapseReconnect
            ? 'Disconnected'
            : 'No Instagram account is connected. Connect one in Settings to send Instagram steps.'}
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
      {needsLapseReconnect && (
        <>
          <InlineBanner
            color="blue"
            message="Your Instagram connection needs to be restored after your subscription ended. Reconnect the same account to resume Instagram steps. Your conversations and Campaign selection are saved."
          />
          {canManageAccounts ? (
            <Button
              title="Reconnect Instagram"
              variant="secondary"
              onClick={() => navigateSettings(SettingsPath.AccountsInstagram)}
            />
          ) : (
            <StyledAgentHint>
              Ask a workspace admin to reconnect Instagram.
            </StyledAgentHint>
          )}
        </>
      )}
      {selected && selected.status !== 'ACTIVE' && !needsLapseReconnect ? (
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
