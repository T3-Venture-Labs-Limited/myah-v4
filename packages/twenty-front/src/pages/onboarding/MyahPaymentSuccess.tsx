import { Logo } from '@/auth/components/Logo';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { StyledOnboardingStepPage } from '@/onboarding/components/StyledOnboardingStepPage';
import { useHasPermissionFlag } from '@/settings/roles/hooks/useHasPermissionFlag';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useLoadCurrentUser } from '@/users/hooks/useLoadCurrentUser';
import { useApolloClient, useMutation } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AppPath } from 'twenty-shared/types';
import { Loader } from 'twenty-ui/feedback';
import { IconCheck } from 'twenty-ui/icon';
import { MainButton } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import {
  MyahWorkspaceUsageDocument,
  PermissionFlagType,
  SyncMyahCheckoutSessionDocument,
} from '~/generated-metadata/graphql';

const StyledPage = styled(StyledOnboardingStepPage)`
  gap: ${themeCssVariables.spacing[5]};
  justify-content: safe center;
  text-align: center;
`;
const StyledTitle = styled.h1`
  font-size: ${themeCssVariables.font.size.xl};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  margin: 0;
`;
const StyledDescription = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.md};
  line-height: 1.5;
  max-width: 440px;
`;
const StyledSuccessIcon = styled.div`
  align-items: center;
  background: ${themeCssVariables.color.green3};
  border-radius: 50%;
  color: ${themeCssVariables.color.green};
  display: flex;
  height: 40px;
  justify-content: center;
  width: 40px;
`;
const StyledActions = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  margin-top: ${themeCssVariables.spacing[2]};
  max-width: 100%;
  width: 360px;
`;

export const MyahPaymentSuccess = () => {
  const { t } = useLingui();
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const hasBillingPermission = useHasPermissionFlag(PermissionFlagType.BILLING);
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const client = useApolloClient();
  const [syncCheckout] = useMutation(SyncMyahCheckoutSessionDocument);
  const { loadCurrentUser } = useLoadCurrentUser();
  const [confirmation, setConfirmation] = useState<
    'waiting' | 'confirmed' | 'failed'
  >('waiting');
  const [confirmationRun, setConfirmationRun] = useState(0);
  const [isContinuing, setIsContinuing] = useState(false);
  const [continueFailed, setContinueFailed] = useState(false);

  useEffect(() => {
    if (!sessionId || !currentWorkspace?.id) return;
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const confirm = async () => {
      try {
        // Sync is idempotent and re-reads Stripe. Never create another Checkout here.
        if (hasBillingPermission)
          await syncCheckout({ variables: { sessionId } });
        if (cancelled) return;
        const result = await client.query({
          query: MyahWorkspaceUsageDocument,
          fetchPolicy: 'network-only',
        });
        if (cancelled) return;
        if (
          ['ACTIVE', 'PAYMENT_RETRYING', 'COMPLIMENTARY'].includes(
            result.data?.myahWorkspaceUsage.state ?? '',
          )
        ) {
          setConfirmation('confirmed');
        } else if (++attempts < 30) {
          timer = setTimeout(() => void confirm(), 2000);
        } else setConfirmation('failed');
      } catch {
        if (!cancelled) setConfirmation('failed');
      }
    };
    void confirm();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [
    sessionId,
    currentWorkspace?.id,
    client,
    syncCheckout,
    hasBillingPermission,
    confirmationRun,
  ]);

  const continueOnboarding = async () => {
    if (confirmation !== 'confirmed' || isContinuing) return;
    setIsContinuing(true);
    setContinueFailed(false);
    try {
      await loadCurrentUser();
    } catch {
      setContinueFailed(true);
    } finally {
      setIsContinuing(false);
    }
  };
  const missingSession = !sessionId;
  const hasFailed = missingSession || confirmation === 'failed';

  return (
    <StyledPage>
      <Logo
        secondaryLogo={currentWorkspace?.logo}
        placeholder={currentWorkspace?.displayName}
      />
      {confirmation === 'confirmed' ? (
        <StyledSuccessIcon>
          <IconCheck size={20} />
        </StyledSuccessIcon>
      ) : (
        !hasFailed && <Loader />
      )}
      <StyledTitle>
        {confirmation === 'confirmed'
          ? t`You're subscribed`
          : hasFailed
            ? t`We couldn't confirm your payment yet`
            : t`Confirming your payment`}
      </StyledTitle>
      <StyledDescription role={hasFailed ? 'alert' : 'status'}>
        {confirmation === 'confirmed'
          ? t`${currentWorkspace?.displayName ?? 'Your workspace'} is ready. Stripe will email your receipt.`
          : missingSession
            ? t`This payment return link is missing its Checkout session. Return to the subscription page to check your access.`
            : hasFailed
              ? t`Your payment may still be processing. Retry confirmation—this won't start another payment.`
              : t`This updates automatically. You don't need to refresh the page.`}
      </StyledDescription>
      {!hasBillingPermission && confirmation !== 'confirmed' && (
        <StyledDescription>{t`If confirmation is delayed, ask a workspace admin to check the payment.`}</StyledDescription>
      )}
      <StyledActions>
        {confirmation === 'confirmed' && (
          <MainButton
            title={isContinuing ? t`Continuing…` : t`Continue`}
            accent="dark"
            fullWidth
            disabled={isContinuing}
            onClick={() => void continueOnboarding()}
          />
        )}
        {continueFailed && (
          <StyledDescription role="alert">{t`Unable to load your workspace. Please try Continue again.`}</StyledDescription>
        )}
        {hasFailed && !missingSession && (
          <MainButton
            title={t`Retry confirmation`}
            accent="dark"
            fullWidth
            onClick={() => {
              setConfirmation('waiting');
              setConfirmationRun((run) => run + 1);
            }}
          />
        )}
        {hasFailed && (
          <Link to={AppPath.PlanRequired}>{t`Back to subscription`}</Link>
        )}
      </StyledActions>
    </StyledPage>
  );
};
