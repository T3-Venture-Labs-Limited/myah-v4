import { currentUserState } from '@/auth/states/currentUserState';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { InformationBanner } from '@/information-banner/components/InformationBanner';
import { useMyahWorkspaceUsage } from '@/settings/billing/hooks/useMyahWorkspaceUsage';
import { useHasPermissionFlag } from '@/settings/roles/hooks/useHasPermissionFlag';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { SettingsPath } from 'twenty-shared/types';
import { PermissionFlagType } from '~/generated-metadata/graphql';
import { useNavigateSettings } from '~/hooks/useNavigateSettings';

export const InformationBannerMyahUsage = () => {
  const { t, i18n } = useLingui();
  const { isEnabled, hasAccess, usage } = useMyahWorkspaceUsage();
  const currentUser = useAtomStateValue(currentUserState);
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const canManageBilling = useHasPermissionFlag(PermissionFlagType.BILLING);
  const navigateSettings = useNavigateSettings();
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);

  if (
    !isEnabled ||
    !hasAccess ||
    !usage ||
    usage.state === 'COMPLIMENTARY' ||
    !currentUser?.id ||
    !currentWorkspace?.id
  )
    return null;

  const key = `myah-ai-usage-warning:${currentWorkspace.id}:${currentUser.id}:${usage.periodStart ?? 'pending'}`;
  let dismissed = dismissedKey === key;
  try {
    dismissed ||= localStorage.getItem(key) === '1';
  } catch {
    /* Storage is optional. */
  }
  const dismiss = () => {
    setDismissedKey(key);
    try {
      localStorage.setItem(key, '1');
    } catch {
      /* Keep the in-memory dismissal if storage is unavailable. */
    }
  };
  const date = usage.resetAt
    ? new Intl.DateTimeFormat(i18n.locale, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(new Date(usage.resetAt))
    : null;
  const reset = usage.paymentRetrying
    ? t`It resets when your renewal payment goes through.`
    : date
      ? t`It resets on ${date}.`
      : t`It resets with your next paid period.`;
  const goToBilling = () => navigateSettings(SettingsPath.Billing);

  return (
    <>
      {usage.paymentRetrying && (
        <InformationBanner
          componentInstanceId="myah-payment-retrying"
          color="danger"
          variant="primary"
          message={
            canManageBilling
              ? t`Your payment didn't go through. Update your card so Myah keeps running.`
              : t`Your workspace's payment didn't go through. Ask a workspace admin to update the card.`
          }
          buttonTitle={canManageBilling ? t`Update card` : undefined}
          buttonOnClick={goToBilling}
        />
      )}
      {usage.exhausted ? (
        <InformationBanner
          componentInstanceId="myah-ai-usage-exhausted"
          color="danger"
          variant="secondary"
          message={t`This month's AI usage is used up. ${reset} Sending messages keeps working.`}
          buttonTitle={canManageBilling ? t`View billing` : undefined}
          buttonOnClick={goToBilling}
        />
      ) : (
        (usage.percentUsed ?? 0) >= 80 &&
        !dismissed && (
          <InformationBanner
            componentInstanceId="myah-ai-usage-warning"
            color="blue"
            variant="secondary"
            message={t`You've used 80% of this month's included AI usage. ${reset}`}
            buttonTitle={canManageBilling ? t`View usage` : undefined}
            buttonOnClick={goToBilling}
            onClose={dismiss}
          />
        )
      )}
    </>
  );
};
