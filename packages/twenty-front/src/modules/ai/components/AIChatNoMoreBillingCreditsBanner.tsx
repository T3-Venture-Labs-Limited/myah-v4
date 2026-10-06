import { AiChatBanner } from '@/ai/components/AiChatBanner';
import { usePermissionFlagMap } from '@/settings/roles/hooks/usePermissionFlagMap';
import { useLingui } from '@lingui/react/macro';
import { SettingsPath } from 'twenty-shared/types';
import { PermissionFlagType } from '~/generated-metadata/graphql';
import { useNavigateSettings } from '~/hooks/useNavigateSettings';

export const AIChatNoMoreBillingCreditsBanner = () => {
  const { t } = useLingui();
  const navigateSettings = useNavigateSettings();
  const { [PermissionFlagType.BILLING]: canManageBilling } =
    usePermissionFlagMap();

  return (
    <AiChatBanner
      message={
        canManageBilling
          ? t`Your AI usage is used up.`
          : t`Your AI usage is used up. Ask a workspace admin to review Billing.`
      }
      variant="warning"
      buttonTitle={canManageBilling ? t`Billing` : undefined}
      buttonOnClick={
        canManageBilling
          ? () => navigateSettings(SettingsPath.Billing)
          : undefined
      }
    />
  );
};
