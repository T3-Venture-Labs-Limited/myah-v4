import { isMyahSubscriptionRequiredState } from '@/client-config/states/isMyahSubscriptionRequiredState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useLocation } from 'react-router-dom';
import { AppPath } from 'twenty-shared/types';
import { OnboardingLayout } from '@/onboarding/components/OnboardingLayout';
import { OnboardingTransitionOutlet } from '@/onboarding/components/OnboardingTransitionOutlet';
import { useOnboardingFreeCreditsTotal } from '@/onboarding/hooks/useOnboardingFreeCreditsTotal';

export const OnboardingStepLayout = () => {
  const freeCredits = useOnboardingFreeCreditsTotal();
  const isMyahSubscriptionRequired = useAtomStateValue(
    isMyahSubscriptionRequiredState,
  );
  const { pathname } = useLocation();
  const isMyahPaywall =
    isMyahSubscriptionRequired &&
    (pathname === AppPath.PlanRequired ||
      pathname === AppPath.PlanRequiredSuccess);

  return (
    <OnboardingLayout
      freeCredits={isMyahSubscriptionRequired ? undefined : freeCredits}
      hideHeader={isMyahPaywall}
    >
      <OnboardingTransitionOutlet />
    </OnboardingLayout>
  );
};
