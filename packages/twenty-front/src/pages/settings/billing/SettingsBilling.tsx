import { SettingsPageContainer } from '@/settings/components/SettingsPageContainer';
import { SettingsPageLayout } from '@/settings/components/layout/SettingsPageLayout';
import {
  SettingsWorkspaceBillingContent,
  type WorkspaceBillingAutomaticTopUpSettings,
  type WorkspaceBillingViewModel,
} from '@/settings/billing/components/SettingsWorkspaceBillingContent';
import { Trans, useLingui } from '@lingui/react/macro';
import { SettingsPath } from 'twenty-shared/types';
import { getSettingsPath } from 'twenty-shared/utils';

export type SettingsBillingProps = {
  viewModel?: WorkspaceBillingViewModel;
  onManagePaymentMethod?: () => void;
  onSaveAutomaticTopUp?: (
    settings: WorkspaceBillingAutomaticTopUpSettings,
  ) => void;
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
          onManagePaymentMethod={onManagePaymentMethod}
          onSaveAutomaticTopUp={onSaveAutomaticTopUp}
        />
      </SettingsPageContainer>
    </SettingsPageLayout>
  );
};
