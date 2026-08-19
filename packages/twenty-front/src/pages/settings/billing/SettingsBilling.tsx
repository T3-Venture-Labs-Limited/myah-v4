import { SettingsPageContainer } from '@/settings/components/SettingsPageContainer';
import { SettingsPageLayout } from '@/settings/components/layout/SettingsPageLayout';
import { GET_MANAGED_EMAIL_SUBSCRIPTIONS } from '@/settings/workspace/graphql/managed-email/managedEmailQueries';
import {
  SettingsWorkspaceBillingContent,
  type WorkspaceBillingAutomaticTopUpSettings,
  type WorkspaceBillingViewModel,
  type WorkspaceManagedEmailSubscription,
  type WorkspaceManagedEmailSubscriptionsViewModel,
} from '@/settings/billing/components/SettingsWorkspaceBillingContent';
import { useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { SettingsPath } from 'twenty-shared/types';
import { getSettingsPath } from 'twenty-shared/utils';
import { useNavigateSettings } from '~/hooks/useNavigateSettings';

export type SettingsBillingProps = {
  viewModel?: WorkspaceBillingViewModel;
  onManagePaymentMethod?: () => void;
  onSaveAutomaticTopUp?: (
    settings: WorkspaceBillingAutomaticTopUpSettings,
  ) => void;
};
type ManagedEmailSubscriptionsQueryData = {
  managedEmailSubscriptions: WorkspaceManagedEmailSubscription[];
};

const NOT_CONNECTED_BILLING_VIEW_MODEL: WorkspaceBillingViewModel = {
  state: 'unavailable',
  reason: 'notConnected',
};

export const SettingsBilling = ({
  viewModel = NOT_CONNECTED_BILLING_VIEW_MODEL,
  onManagePaymentMethod,
  onSaveAutomaticTopUp,
}: SettingsBillingProps) => {
  const { t } = useLingui();
  const navigateSettings = useNavigateSettings();
  const {
    data: managedEmailSubscriptionsData,
    error: managedEmailSubscriptionsError,
    loading: managedEmailSubscriptionsLoading,
  } = useQuery<ManagedEmailSubscriptionsQueryData>(
    GET_MANAGED_EMAIL_SUBSCRIPTIONS,
  );
  const managedEmailSubscriptions: WorkspaceManagedEmailSubscriptionsViewModel =
    managedEmailSubscriptionsLoading
      ? { state: 'loading' }
      : managedEmailSubscriptionsError !== undefined
        ? { state: 'unavailable' }
        : {
            state: 'ready',
            subscriptions:
              managedEmailSubscriptionsData?.managedEmailSubscriptions ?? [],
          };

  return (
    <SettingsPageLayout
      title={t`Billing`}
      links={[
        {
          children: <Trans>Workspace</Trans>,
          href: getSettingsPath(SettingsPath.General),
        },
        {
          children: <Trans>Billing</Trans>,
          href: getSettingsPath(SettingsPath.Billing),
        },
      ]}
    >
      <SettingsPageContainer>
        <SettingsWorkspaceBillingContent
          viewModel={viewModel}
          managedEmailSubscriptions={managedEmailSubscriptions}
          onManageManagedEmail={() =>
            navigateSettings(SettingsPath.WorkspaceEmail)
          }
          onManagePaymentMethod={onManagePaymentMethod}
          onSaveAutomaticTopUp={onSaveAutomaticTopUp}
        />
      </SettingsPageContainer>
    </SettingsPageLayout>
  );
};
