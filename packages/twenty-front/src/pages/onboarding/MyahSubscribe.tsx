import { Logo } from '@/auth/components/Logo';
import { useAuth } from '@/auth/hooks/useAuth';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { useRedirect } from '@/domain-manager/hooks/useRedirect';
import { OnboardingPageLoader } from '@/onboarding/components/OnboardingPageLoader';
import { StyledOnboardingStepPage } from '@/onboarding/components/StyledOnboardingStepPage';
import { useMyahWorkspaceUsage } from '@/settings/billing/hooks/useMyahWorkspaceUsage';
import { myahSubscriptionRefreshRequestedState } from '@/settings/billing/states/myahSubscriptionRefreshRequestedState';
import { useHasPermissionFlag } from '@/settings/roles/hooks/useHasPermissionFlag';
import { Dropdown } from '@/ui/layout/dropdown/components/Dropdown';
import { DropdownContent } from '@/ui/layout/dropdown/components/DropdownContent';
import { WorkspacesForSignIn } from '@/ui/navigation/navigation-drawer/components/MultiWorkspaceDropdown/internal/components/WorkspacesForSignIn';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';
import { useMutation, useQuery } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { useEffect, useState } from 'react';
import { isGraphqlErrorOfType } from '~/utils/is-graphql-error-of-type.util';
import { IconCheck } from 'twenty-ui/icon';
import { Button, MainButton } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import {
  CreateMyahCheckoutSessionDocument,
  CreateMyahCustomerPortalSessionDocument,
  MyahCheckoutPriceDocument,
  PermissionFlagType,
} from '~/generated-metadata/graphql';

const StyledPage = styled(StyledOnboardingStepPage)`
  gap: ${themeCssVariables.spacing[6]};
  justify-content: safe center;
`;
const StyledHeading = styled.div`
  align-items: center;
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  max-width: 440px;
  text-align: center;
`;
const StyledTitle = styled.h1`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.xl};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  margin: 0;
`;
const StyledDescription = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  line-height: 1.5;
`;
const StyledContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  max-width: 100%;
  width: 360px;
`;
const StyledCard = styled.div`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.md};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  padding: ${themeCssVariables.spacing[4]};
`;
const StyledRow = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
`;
const StyledCardHeader = styled(StyledRow)`
  justify-content: space-between;
`;
const StyledPrice = styled.strong`
  font-size: 28px;
  font-weight: ${themeCssVariables.font.weight.semiBold};
`;
const StyledTag = styled.span`
  background: ${themeCssVariables.color.pink3};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.color.pink};
  font-size: ${themeCssVariables.font.size.xs};
  padding: ${themeCssVariables.spacing[1]};
`;
const StyledFeatures = styled.ul`
  border-top: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-direction: column;
  font-size: ${themeCssVariables.font.size.sm};
  gap: ${themeCssVariables.spacing[2]};
  line-height: 1.5;
  list-style: none;
  margin: 0;
  padding: ${themeCssVariables.spacing[3]} 0 0;
  li {
    display: flex;
    gap: ${themeCssVariables.spacing[2]};
  }
  svg {
    color: ${themeCssVariables.color.green};
    flex-shrink: 0;
    margin-top: 3px;
  }
`;
const StyledLink = styled.button`
  background: none;
  border: none;
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  font: inherit;
  font-size: ${themeCssVariables.font.size.sm};
  padding: 0;
  text-align: left;
  text-decoration: underline;
`;
const StyledInput = styled.input`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  flex: 1;
  font: inherit;
  min-width: 0;
  padding: ${themeCssVariables.spacing[2]};
`;
const StyledFooter = styled(StyledDescription)`
  align-items: center;
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[4]};
  text-align: center;
`;
const StyledError = styled(StyledDescription)`
  color: ${themeCssVariables.color.red};
`;

export const MyahSubscribe = () => {
  const { t, i18n } = useLingui();
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const hasBillingPermission = useHasPermissionFlag(PermissionFlagType.BILLING);
  const { signOut } = useAuth();
  const { redirect } = useRedirect();
  const {
    usage,
    error: usageError,
    refetch: refetchUsage,
  } = useMyahWorkspaceUsage();
  const hasAccess =
    usage !== undefined &&
    ['ACTIVE', 'PAYMENT_RETRYING', 'COMPLIMENTARY'].includes(usage.state);
  const isLapsed = usage?.state === 'LAPSED';
  const setMyahSubscriptionRefreshRequested = useSetAtomState(
    myahSubscriptionRefreshRequestedState,
  );
  const [isCodeVisible, setIsCodeVisible] = useState(false);
  const [draftCode, setDraftCode] = useState('');
  const [code, setCode] = useState('');
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const { data, previousData, loading, error, refetch } = useQuery(
    MyahCheckoutPriceDocument,
    {
      variables: { code: code || null },
      skip: !usage || hasAccess,
      fetchPolicy: 'network-only',
    },
  );
  const [createCheckout, { loading: creatingCheckout }] = useMutation(
    CreateMyahCheckoutSessionDocument,
  );
  const [createPortal, { loading: openingPortal }] = useMutation(
    CreateMyahCustomerPortalSessionDocument,
  );
  const price = data?.myahCheckoutPrice ?? previousData?.myahCheckoutPrice;
  const checkoutDisabled =
    !price ||
    loading ||
    !!error ||
    creatingCheckout ||
    isRedirecting ||
    draftCode.trim() !== code;
  const formatPrice = (amountCents: number) =>
    i18n.number(amountCents / 100, {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: amountCents % 100 === 0 ? 0 : 2,
    });

  useEffect(() => {
    if (hasAccess) setMyahSubscriptionRefreshRequested(true);
  }, [hasAccess, setMyahSubscriptionRefreshRequested]);

  const subscribe = async () => {
    if (!hasBillingPermission || checkoutDisabled) return;
    setCheckoutError(null);
    try {
      const result = await createCheckout({
        variables: {
          code: code || null,
          expectedAmountCents: price.amountCents,
        },
      });
      if (!result.data?.createMyahCheckoutSession)
        throw new Error('Missing Checkout URL');
      setIsRedirecting(true);
      redirect(result.data.createMyahCheckoutSession);
    } catch (error) {
      setCheckoutError(
        isGraphqlErrorOfType(error, 'MYAH_PRICE_CHANGED')
          ? t`The price has changed. Please review the updated price and try again.`
          : t`Checkout could not open. Please try again.`,
      );
      // Refresh the quote and access (the workspace may already be paid), never
      // retry a mutation with an unknown outcome.
      await Promise.all([
        refetch().catch(() => undefined),
        refetchUsage().catch(() => undefined),
      ]);
    }
  };

  const openPortal = async () => {
    if (!hasBillingPermission || openingPortal) return;
    setCheckoutError(null);
    try {
      const result = await createPortal();
      if (!result.data?.createMyahCustomerPortalSession)
        throw new Error('Missing Portal URL');
      redirect(result.data.createMyahCustomerPortalSession);
    } catch {
      setCheckoutError(t`Unable to open billing. Please try again.`);
    }
  };

  if (hasAccess || (!usage && !usageError)) return <OnboardingPageLoader />;

  return (
    <StyledPage>
      <StyledHeading>
        <Logo
          secondaryLogo={currentWorkspace?.logo}
          placeholder={currentWorkspace?.displayName}
        />
        <StyledTitle>
          {isLapsed ? t`Your subscription has ended` : t`Subscribe to Myah`}
        </StyledTitle>
        <StyledDescription>
          {isLapsed
            ? t`Your campaigns, creators and conversations are saved. Resubscribe to pick up where you left off.`
            : t`${currentWorkspace?.displayName ?? 'Your workspace'} needs a subscription before you can start.`}
        </StyledDescription>
      </StyledHeading>
      <StyledContent>
        {usageError ? (
          <StyledError role="alert">
            {t`Unable to load subscription access.`}{' '}
            <StyledLink
              onClick={() => void refetchUsage().catch(() => undefined)}
            >{t`Retry`}</StyledLink>
          </StyledError>
        ) : (
          <StyledCard>
            <StyledCardHeader>
              <strong>{t`Early access`}</strong>
              {price?.earlyAccess && (
                <StyledTag>{t`Early-access price`}</StyledTag>
              )}
            </StyledCardHeader>
            <StyledRow>
              <StyledPrice>
                {price ? formatPrice(price.amountCents) : t`Loading price…`}
              </StyledPrice>
              {price && (
                <StyledDescription>
                  {t`/ month`}{' '}
                  {price.earlyAccess && (
                    <s>{formatPrice(price.regularAmountCents)}</s>
                  )}
                </StyledDescription>
              )}
            </StyledRow>
            {price?.earlyAccess && (
              <StyledDescription>{t`Early-access price. It stays $99 for as long as you stay subscribed.`}</StyledDescription>
            )}
            {isLapsed && (
              <StyledDescription>{t`When you resubscribe`}</StyledDescription>
            )}
            <StyledFeatures>
              {(isLapsed
                ? [
                    t`Campaign messages that were waiting send again within each Campaign's sending hours.`,
                    t`Reconnect Instagram after subscribing`,
                    t`A new period of included AI usage`,
                  ]
                : [
                    t`Unlimited campaigns and creators`,
                    t`Instagram DM outreach from one account`,
                    t`Email outreach from Gmail or Outlook`,
                    t`AI reply agent and Ask AI`,
                    t`Monthly included AI usage`,
                    t`Hands-on onboarding with the founder`,
                  ]
              ).map((feature) => (
                <li key={feature}>
                  <IconCheck size={12} />
                  <span>
                    {feature}
                    {!isLapsed && feature === t`Monthly included AI usage` && (
                      <StyledDescription>{t`Instagram is included separately and does not use your AI allowance.`}</StyledDescription>
                    )}
                  </span>
                </li>
              ))}
            </StyledFeatures>
          </StyledCard>
        )}
        {error && !code && (
          <StyledError role="alert">
            {t`Unable to load the price. Please try again.`}{' '}
            <StyledLink
              onClick={() => void refetch().catch(() => undefined)}
            >{t`Retry`}</StyledLink>
          </StyledError>
        )}
        {hasBillingPermission && !usageError ? (
          <>
            <StyledLink
              aria-expanded={isCodeVisible}
              onClick={() => setIsCodeVisible(!isCodeVisible)}
            >{t`Have a promotion code?`}</StyledLink>
            {isCodeVisible && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  setCheckoutError(null);
                  if (draftCode.trim() === code)
                    void refetch().catch(() => undefined);
                  else setCode(draftCode.trim());
                }}
              >
                <StyledRow>
                  <StyledInput
                    aria-label={t`Promotion code`}
                    aria-invalid={!!error && !!code}
                    value={draftCode}
                    onChange={(event) => setDraftCode(event.target.value)}
                    disabled={creatingCheckout || isRedirecting}
                  />
                  <Button
                    title={t`Apply`}
                    type="submit"
                    variant="secondary"
                    disabled={loading || creatingCheckout || isRedirecting}
                  />
                </StyledRow>
              </form>
            )}
            {error && code && (
              <StyledError role="alert">
                {t`This code isn't valid or has expired. Try another code or clear it and apply again.`}
              </StyledError>
            )}
            {code && !loading && !error && (
              <StyledDescription role="status">{t`Code applied.`}</StyledDescription>
            )}
            {checkoutError && (
              <StyledError role="alert">{checkoutError}</StyledError>
            )}
            <MainButton
              title={
                creatingCheckout || isRedirecting
                  ? t`Opening Checkout…`
                  : isLapsed
                    ? t`Resubscribe`
                    : t`Subscribe`
              }
              onClick={() => void subscribe()}
              accent="dark"
              fullWidth
              disabled={checkoutDisabled}
            />
          </>
        ) : (
          !usageError && (
            <StyledDescription>
              {isLapsed
                ? t`Only a workspace admin can resubscribe. Ask an admin to restore access.`
                : t`Only a workspace admin can subscribe. Ask an admin to subscribe for this workspace.`}
            </StyledDescription>
          )
        )}
        <StyledFooter>
          {hasBillingPermission &&
            (isLapsed ? (
              <StyledLink
                onClick={() => void openPortal()}
                disabled={openingPortal || creatingCheckout || isRedirecting}
              >{t`View past invoices`}</StyledLink>
            ) : (
              <span>{t`You'll pay securely with Stripe. Cancel anytime.`}</span>
            ))}
          <StyledRow>
            <Dropdown
              dropdownId="myah-subscribe-workspaces"
              renderClickableComponentAsChild
              clickableComponent={
                <StyledLink>{t`Switch workspace`}</StyledLink>
              }
              dropdownComponents={
                <DropdownContent>
                  <WorkspacesForSignIn searchValue="" />
                </DropdownContent>
              }
            />
            <span>·</span>
            <StyledLink onClick={signOut}>{t`Log out`}</StyledLink>
          </StyledRow>
        </StyledFooter>
      </StyledContent>
    </StyledPage>
  );
};
