import { useIsMyahTeamUser } from '@/auth/hooks/useIsMyahTeamUser';
import { billingState } from '@/client-config/states/billingState';
import { SettingsAdminTabContent } from '@/settings/admin-panel/components/SettingsAdminTabContent';
import { SETTINGS_ADMIN_TABS } from '@/settings/admin-panel/constants/SettingsAdminTabs';
import { SETTINGS_ADMIN_TABS_ID } from '@/settings/admin-panel/constants/SettingsAdminTabsId';
import { TabList } from '@/ui/layout/tab-list/components/TabList';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { t } from '@lingui/core/macro';
import { Navigate } from 'react-router-dom';
import { SettingsPath } from 'twenty-shared/types';
import { getSettingsPath } from 'twenty-shared/utils';
import {
  IconApps,
  IconHeart,
  IconKey,
  IconSettings2,
  IconSparkles,
  IconVariable,
} from 'twenty-ui/icon';

export const SettingsAdminContent = () => {
  const billing = useAtomStateValue(billingState);
  const isMyahTeamUser = useIsMyahTeamUser();

  const isBillingEnabled = billing?.isBillingEnabled;

  if (!isMyahTeamUser) {
    return <Navigate to={getSettingsPath(SettingsPath.General)} replace />;
  }

  const tabs = [
    {
      id: SETTINGS_ADMIN_TABS.GENERAL,
      title: t`General`,
      Icon: IconSettings2,
      disabled: false,
    },
    ...(isMyahTeamUser
      ? [
          {
            id: SETTINGS_ADMIN_TABS.APPS,
            title: t`Apps`,
            Icon: IconApps,
            disabled: false,
          },
          {
            id: SETTINGS_ADMIN_TABS.AI,
            title: t`AI`,
            Icon: IconSparkles,
            disabled: false,
          },
          {
            id: SETTINGS_ADMIN_TABS.CONFIG_VARIABLES,
            title: t`Config`,
            Icon: IconVariable,
            disabled: false,
          },
          {
            id: SETTINGS_ADMIN_TABS.HEALTH_STATUS,
            title: t`Health`,
            Icon: IconHeart,
            disabled: false,
          },
        ]
      : []),
    ...(isMyahTeamUser && !isBillingEnabled
      ? [
          {
            id: SETTINGS_ADMIN_TABS.ENTERPRISE,
            title: t`Enterprise`,
            Icon: IconKey,
            disabled: false,
          },
        ]
      : []),
  ];

  return (
    <>
      <TabList
        tabs={tabs}
        behaveAsLinks={true}
        componentInstanceId={SETTINGS_ADMIN_TABS_ID}
      />
      <SettingsAdminTabContent />
    </>
  );
};
