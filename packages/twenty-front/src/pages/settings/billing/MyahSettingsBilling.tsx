import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { useRedirect } from '@/domain-manager/hooks/useRedirect';
import { StyledSettingsBillingCard } from '@/settings/billing/components/internal/SettingsBillingCard';
import { useMyahWorkspaceUsage } from '@/settings/billing/hooks/useMyahWorkspaceUsage';
import { SettingsPageContainer } from '@/settings/components/SettingsPageContainer';
import { SettingsSectionSkeletonLoader } from '@/settings/components/SettingsSectionSkeletonLoader';
import { SettingsPageLayout } from '@/settings/components/layout/SettingsPageLayout';
import { useHasPermissionFlag } from '@/settings/roles/hooks/useHasPermissionFlag';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useMutation, useQuery } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { SettingsPath } from 'twenty-shared/types';
import { getSettingsPath } from 'twenty-shared/utils';
import { Tag } from 'twenty-ui/data-display';
import { InlineBanner, ProgressBar } from 'twenty-ui/feedback';
import { Button } from 'twenty-ui/input';
import { Section } from 'twenty-ui/layout';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { H2Title } from 'twenty-ui/typography';
import {
  CreateMyahCustomerPortalSessionDocument,
  MyahSubscriptionDetailsDocument,
  PermissionFlagType,
} from '~/generated-metadata/graphql';

const StyledCard = styled(StyledSettingsBillingCard)`
  box-sizing: border-box;
  gap: ${themeCssVariables.spacing[3]};
  padding: ${themeCssVariables.spacing[4]};
`;
const StyledUsageCard = styled(StyledCard)`
  background-color: ${themeCssVariables.background.primary};
`;
const StyledRow = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
`;
const StyledSpreadRow = styled(StyledRow)`
  justify-content: space-between;
`;
const StyledPlan = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  min-width: 220px;
`;
const StyledPrice = styled.div`
  font-size: ${themeCssVariables.font.size.xl};
  font-weight: ${themeCssVariables.font.weight.semiBold};
`;
const StyledDescription = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  line-height: 1.5;
`;

export const MyahSettingsBilling = () => {
  const { t, i18n } = useLingui();
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const canManage = useHasPermissionFlag(PermissionFlagType.BILLING);
  const usageResult = useMyahWorkspaceUsage();
  const { usage } = usageResult;
  const detailsResult = useQuery(MyahSubscriptionDetailsDocument, {
    skip: !canManage,
    fetchPolicy: 'cache-and-network',
    pollInterval: 5 * 60 * 1000,
  });
  const details = detailsResult.data?.myahSubscriptionDetails;
  const [createPortal, { loading: openingPortal }] = useMutation(
    CreateMyahCustomerPortalSessionDocument,
  );
  const [portalFailed, setPortalFailed] = useState(false);
  const { redirect } = useRedirect();
  const openPortal = async () => {
    setPortalFailed(false);
    try {
      const result = await createPortal();
      if (!result.data?.createMyahCustomerPortalSession)
        throw new Error('Missing Portal URL');
      redirect(result.data.createMyahCustomerPortalSession);
    } catch {
      setPortalFailed(true);
    }
  };
  const formatDate = (value: string | null | undefined) =>
    value
      ? new Intl.DateTimeFormat(i18n.locale, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }).format(new Date(value))
      : t`Not yet available`;
  const complimentary = usage?.state === 'COMPLIMENTARY';
  const percent = Math.min(100, Math.max(0, usage?.percentUsed ?? 0));
  const periodEnd = formatDate(details?.currentPeriodEnd);
  const resetDate = formatDate(usage?.resetAt);
  const workspaceName = currentWorkspace?.displayName ?? t`your workspace`;

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
        {!canManage ? (
          <InlineBanner
            message={t`Only a workspace admin can manage billing.`}
          />
        ) : detailsResult.error || usageResult.error ? (
          <InlineBanner
            color="danger"
            message={t`Billing could not be loaded. Please try again.`}
            button={{
              title: t`Retry`,
              onClick: () => {
                void Promise.allSettled([
                  detailsResult.refetch(),
                  usageResult.refetch(),
                ]);
              },
            }}
          />
        ) : !details || !usage ? (
          <SettingsSectionSkeletonLoader />
        ) : (
          <>
            <Section>
              <H2Title
                title={t`Plan`}
                description={t`Your Myah subscription for ${workspaceName}.`}
              />
              <StyledCard>
                <StyledSpreadRow>
                  <StyledPlan>
                    <StyledRow>
                      <strong>
                        {complimentary
                          ? t`Complimentary access`
                          : t`Early access`}
                      </strong>
                      <Tag
                        color={
                          complimentary
                            ? 'gray'
                            : usage.paymentRetrying
                              ? 'red'
                              : details.cancelAtPeriodEnd
                                ? 'orange'
                                : 'green'
                        }
                        text={
                          complimentary
                            ? t`Complimentary`
                            : usage.paymentRetrying
                              ? t`Payment failed`
                              : details.cancelAtPeriodEnd
                                ? t`Ends ${periodEnd}`
                                : t`Active`
                        }
                      />
                    </StyledRow>
                    {complimentary ? (
                      <StyledDescription>
                        <Trans>
                          Myah gave this workspace free access. There's nothing
                          to pay.
                        </Trans>
                      </StyledDescription>
                    ) : (
                      <>
                        {details.amountCents != null && (
                          <StyledPrice>
                            {new Intl.NumberFormat(i18n.locale, {
                              style: 'currency',
                              currency: 'USD',
                              minimumFractionDigits:
                                details.amountCents % 100 === 0 ? 0 : 2,
                            }).format(details.amountCents / 100)}{' '}
                            <Trans>/ month</Trans>
                          </StyledPrice>
                        )}
                        <StyledDescription>
                          {usage.paymentRetrying
                            ? t`Your renewal payment didn't go through. Stripe will retry it up to 3 times this week. Update your card to keep Myah running.`
                            : details.cancelAtPeriodEnd
                              ? t`Your subscription ends on ${periodEnd}. Myah stays available until then. You can keep it in Manage billing.`
                              : t`Renews on ${periodEnd}`}
                        </StyledDescription>
                      </>
                    )}
                  </StyledPlan>
                  {!complimentary && (
                    <Button
                      title={
                        usage.paymentRetrying
                          ? t`Update card`
                          : t`Manage billing`
                      }
                      variant="secondary"
                      disabled={openingPortal}
                      onClick={() => void openPortal()}
                    />
                  )}
                </StyledSpreadRow>
              </StyledCard>
              {!complimentary && (
                <StyledDescription>
                  <Trans>
                    Change your card, download invoices or cancel in Manage
                    billing.
                  </Trans>
                </StyledDescription>
              )}
              {portalFailed && (
                <InlineBanner
                  color="danger"
                  message={t`Could not open billing. Please try again.`}
                />
              )}
            </Section>
            <Section>
              <H2Title
                title={t`Included AI usage`}
                description={t`Each month of your plan includes AI usage. Unused usage doesn't carry over.`}
              />
              <StyledUsageCard>
                {complimentary ? (
                  <Trans>AI usage isn't limited for this workspace.</Trans>
                ) : (
                  <>
                    <StyledSpreadRow>
                      <strong>
                        <Trans>{percent}% used</Trans>
                      </strong>
                      <StyledDescription>
                        {usage.paymentRetrying
                          ? t`Resets when your renewal payment goes through`
                          : t`Resets on ${resetDate}`}
                      </StyledDescription>
                    </StyledSpreadRow>
                    <ProgressBar
                      value={percent}
                      barColor={
                        percent >= 100
                          ? themeCssVariables.color.red
                          : percent >= 80
                            ? themeCssVariables.color.orange
                            : themeCssVariables.color.blue
                      }
                      ariaLabel={t`Included AI usage used`}
                      backgroundColor={themeCssVariables.background.tertiary}
                      withBorderRadius
                    />
                    <StyledDescription>
                      <Trans>
                        Covers Ask AI, reply drafts and other AI features. One
                        Instagram account is included separately and does not
                        use your AI allowance.
                      </Trans>
                    </StyledDescription>
                    {usage.exhausted ? (
                      <InlineBanner
                        color="danger"
                        message={t`This month's AI usage is used up. AI replies and Ask AI are paused until it resets. Sending messages and connecting Instagram keep working.`}
                      />
                    ) : (
                      percent >= 80 && (
                        <InlineBanner
                          message={t`You've used ${percent}% of this month's included AI usage.`}
                        />
                      )
                    )}
                  </>
                )}
              </StyledUsageCard>
            </Section>
          </>
        )}
      </SettingsPageContainer>
    </SettingsPageLayout>
  );
};
