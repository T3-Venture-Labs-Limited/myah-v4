import { AiChatBanner } from '@/ai/components/AiChatBanner';
import { useMyahWorkspaceUsage } from '@/settings/billing/hooks/useMyahWorkspaceUsage';
import { myahSubscriptionRefreshRequestedState } from '@/settings/billing/states/myahSubscriptionRefreshRequestedState';
import { useHasPermissionFlag } from '@/settings/roles/hooks/useHasPermissionFlag';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';
import { useLingui } from '@lingui/react/macro';
import { useEffect, useState } from 'react';
import { AppPath, SettingsPath } from 'twenty-shared/types';
import { PermissionFlagType } from '~/generated-metadata/graphql';
import { useNavigateApp } from '~/hooks/useNavigateApp';
import { useNavigateSettings } from '~/hooks/useNavigateSettings';

type MyahAiUsageBannerProps = {
  code: 'INCLUDED_USAGE_EXHAUSTED' | 'SUBSCRIPTION_REQUIRED';
  onRetry?: () => void;
};

export const MyahAiUsageBanner = ({
  code,
  onRetry,
}: MyahAiUsageBannerProps) => {
  const { t, i18n } = useLingui();
  const { usage, hasAccess, refetch } = useMyahWorkspaceUsage();
  const [refreshed, setRefreshed] = useState(false);
  const setMyahSubscriptionRefreshRequested = useSetAtomState(
    myahSubscriptionRefreshRequestedState,
  );
  const canManageBilling = useHasPermissionFlag(PermissionFlagType.BILLING);
  const navigateApp = useNavigateApp();
  const navigateSettings = useNavigateSettings();

  useEffect(() => {
    let cancelled = false;
    setRefreshed(false);
    void refetch()
      .then(() => {
        if (!cancelled) setRefreshed(true);
      })
      .catch(() => {
        /* Keep the refusal visible if refresh fails. */
      });
    if (code === 'SUBSCRIPTION_REQUIRED')
      setMyahSubscriptionRefreshRequested(true);
    return () => {
      cancelled = true;
    };
  }, [code, refetch, setMyahSubscriptionRefreshRequested]);

  const availableAgain =
    code === 'INCLUDED_USAGE_EXHAUSTED' &&
    refreshed &&
    hasAccess &&
    !!usage &&
    !usage.exhausted;
  const date = usage?.resetAt
    ? new Intl.DateTimeFormat(i18n.locale, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(new Date(usage.resetAt))
    : null;
  const message =
    code === 'SUBSCRIPTION_REQUIRED'
      ? canManageBilling
        ? t`This workspace has no active subscription. Subscribe to keep using Myah.`
        : t`This workspace has no active subscription. Ask a workspace admin to subscribe.`
      : availableAgain
        ? t`AI usage is available again. You can try your message again.`
        : usage?.paymentRetrying
          ? t`This month's AI usage is used up. It resets when your renewal payment goes through.`
          : date
            ? t`This month's AI usage is used up. It resets on ${date}.`
            : t`This month's AI usage is used up. It resets with your next paid period.`;

  return (
    <AiChatBanner
      variant="warning"
      message={message}
      buttonTitle={
        availableAgain && onRetry
          ? t`Try again`
          : canManageBilling
            ? code === 'SUBSCRIPTION_REQUIRED'
              ? t`Subscribe`
              : t`Go to Billing`
            : undefined
      }
      buttonOnClick={
        availableAgain && onRetry
          ? onRetry
          : () =>
              code === 'SUBSCRIPTION_REQUIRED'
                ? navigateApp(AppPath.PlanRequired)
                : navigateSettings(SettingsPath.Billing)
      }
    />
  );
};
