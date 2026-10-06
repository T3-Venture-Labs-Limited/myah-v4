import { isMyahSubscriptionRequiredState } from '@/client-config/states/isMyahSubscriptionRequiredState';
import { useHasPermissionFlag } from '@/settings/roles/hooks/useHasPermissionFlag';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useLingui } from '@lingui/react/macro';
import { SettingsPath } from 'twenty-shared/types';
import { Button } from 'twenty-ui/input';
import { PermissionFlagType } from '~/generated-metadata/graphql';
import { useNavigateSettings } from '~/hooks/useNavigateSettings';

type MyahReplyAgentBillingLinkProps = { reason: string | null };

export const MyahReplyAgentBillingLink = ({
  reason,
}: MyahReplyAgentBillingLinkProps) => {
  const { t } = useLingui();
  const isMyahSubscriptionRequired = useAtomStateValue(
    isMyahSubscriptionRequiredState,
  );
  const canManageBilling = useHasPermissionFlag(PermissionFlagType.BILLING);
  const navigateSettings = useNavigateSettings();

  // The existing run stores only a reason, not a code. Match the system-written
  // MyahUsageService refusal without changing the persistence contract for a link.
  if (
    !isMyahSubscriptionRequired ||
    !canManageBilling ||
    !reason?.startsWith("This month's AI usage is used up.")
  )
    return null;

  return (
    <Button
      title={t`View billing`}
      size="small"
      variant="tertiary"
      onClick={() => navigateSettings(SettingsPath.Billing)}
    />
  );
};
