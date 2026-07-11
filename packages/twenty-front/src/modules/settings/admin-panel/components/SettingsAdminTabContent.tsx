import { useIsMyahTeamUser } from '@/auth/hooks/useIsMyahTeamUser';
import { SettingsAdminAI } from '@/settings/admin-panel/ai/components/SettingsAdminAI';
import { SettingsAdminApps } from '@/settings/admin-panel/apps/components/SettingsAdminApps';
import { SettingsAdminGeneral } from '@/settings/admin-panel/components/SettingsAdminGeneral';
import { SettingsAdminConfigVariables } from '@/settings/admin-panel/config-variables/components/SettingsAdminConfigVariables';
import { SETTINGS_ADMIN_TABS } from '@/settings/admin-panel/constants/SettingsAdminTabs';
import { SETTINGS_ADMIN_TABS_ID } from '@/settings/admin-panel/constants/SettingsAdminTabsId';
import { SettingsAdminHealthStatus } from '@/settings/admin-panel/health-status/components/SettingsAdminHealthStatus';
import { SettingsSectionSkeletonLoader } from '@/settings/components/SettingsSectionSkeletonLoader';
import { activeTabIdComponentState } from '@/ui/layout/tab-list/states/activeTabIdComponentState';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { lazy, Suspense } from 'react';

const SettingsEnterprise = lazy(() =>
  import('~/pages/settings/enterprise/SettingsEnterprise').then((module) => ({
    default: module.SettingsEnterprise,
  })),
);
export const SettingsAdminTabContent = () => {
  const isMyahTeamUser = useIsMyahTeamUser();
  const activeTabId = useAtomComponentStateValue(
    activeTabIdComponentState,
    SETTINGS_ADMIN_TABS_ID,
  );

  switch (activeTabId) {
    case SETTINGS_ADMIN_TABS.GENERAL:
      return <SettingsAdminGeneral />;
    case SETTINGS_ADMIN_TABS.APPS:
      if (!isMyahTeamUser) {
        return <SettingsAdminGeneral />;
      }

      return <SettingsAdminApps />;
    case SETTINGS_ADMIN_TABS.AI:
      if (!isMyahTeamUser) {
        return <SettingsAdminGeneral />;
      }

      return <SettingsAdminAI />;
    case SETTINGS_ADMIN_TABS.CONFIG_VARIABLES:
      if (!isMyahTeamUser) {
        return <SettingsAdminGeneral />;
      }

      return <SettingsAdminConfigVariables />;
    case SETTINGS_ADMIN_TABS.HEALTH_STATUS:
      if (!isMyahTeamUser) {
        return <SettingsAdminGeneral />;
      }

      return <SettingsAdminHealthStatus />;
    case SETTINGS_ADMIN_TABS.ENTERPRISE:
      if (!isMyahTeamUser) {
        return <SettingsAdminGeneral />;
      }

      return (
        <Suspense fallback={<SettingsSectionSkeletonLoader />}>
          <SettingsEnterprise isAdminPanelTab />
        </Suspense>
      );
    default:
      return null;
  }
};
