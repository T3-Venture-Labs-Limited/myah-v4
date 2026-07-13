import { useLingui } from '@lingui/react/macro';

import { SettingsPageContainer } from '@/settings/components/SettingsPageContainer';
import { SettingsWorkspaceUnsubscribeTopicSection } from '@/settings/unsubscribe-topics/components/SettingsWorkspaceUnsubscribeTopicSection';
import { SettingsWorkspaceEmailGroupSection } from '@/settings/workspace/components/SettingsWorkspaceEmailGroupSection';
import { SettingsPageLayout } from '@/settings/components/layout/SettingsPageLayout';
import { useIsFeatureEnabled } from '@/workspace/hooks/useIsFeatureEnabled';
import { FeatureFlagKey, SettingsPath } from 'twenty-shared/types';
import { getSettingsPath } from 'twenty-shared/utils';

export const SettingsWorkspaceEmail = () => {
  const { t } = useLingui();

  const isEmailGroupFeatureEnabled = useIsFeatureEnabled(
    FeatureFlagKey.IS_EMAIL_GROUP_ENABLED,
  );

  if (!isEmailGroupFeatureEnabled) {
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
        <SettingsWorkspaceEmailGroupSection />
        <SettingsWorkspaceUnsubscribeTopicSection />
      </SettingsPageContainer>
    </SettingsPageLayout>
  );
};
