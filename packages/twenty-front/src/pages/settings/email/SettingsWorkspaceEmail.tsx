import { useLingui } from '@lingui/react/macro';

import { SettingsPageContainer } from '@/settings/components/SettingsPageContainer';
import { SettingsWorkspaceUnsubscribeTopicSection } from '@/settings/unsubscribe-topics/components/SettingsWorkspaceUnsubscribeTopicSection';
import { SettingsWorkspaceEmailGroupSection } from '@/settings/workspace/components/SettingsWorkspaceEmailGroupSection';
import { ManagedEmailOverview } from '@/settings/workspace/components/managed-email/ManagedEmailOverview';
import { SettingsPageLayout } from '@/settings/components/layout/SettingsPageLayout';
import { useIsFeatureEnabled } from '@/workspace/hooks/useIsFeatureEnabled';
import { isManagedEmailEnabledState } from '@/client-config/states/isManagedEmailEnabledState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { FeatureFlagKey, SettingsPath } from 'twenty-shared/types';
import { getSettingsPath } from 'twenty-shared/utils';

export const SettingsWorkspaceEmail = () => {
  const { t } = useLingui();

  const isEmailGroupFeatureEnabled = useIsFeatureEnabled(
    FeatureFlagKey.IS_EMAIL_GROUP_ENABLED,
  );
  const isManagedEmailEnabled = useAtomStateValue(isManagedEmailEnabledState);

  if (!isEmailGroupFeatureEnabled && !isManagedEmailEnabled) {
    return null;
  }

  return (
    <SettingsPageLayout
      title={t`Email`}
      links={[
        {
          children: t`Workspace`,
          href: getSettingsPath(SettingsPath.General),
        },
        { children: t`Email` },
      ]}
    >
      <SettingsPageContainer>
        {isManagedEmailEnabled && <ManagedEmailOverview />}
        {isEmailGroupFeatureEnabled && (
          <>
            <SettingsWorkspaceEmailGroupSection />
            <SettingsWorkspaceUnsubscribeTopicSection />
          </>
        )}
      </SettingsPageContainer>
    </SettingsPageLayout>
  );
};
