import { isMyahSubscriptionRequiredState } from '@/client-config/states/isMyahSubscriptionRequiredState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useLocation } from 'react-router-dom';
import { AppPath } from 'twenty-shared/types';
import { OnboardingLayout } from '@/onboarding/components/OnboardingLayout';
import { OnboardingTransitionOutlet } from '@/onboarding/components/OnboardingTransitionOutlet';

export const OnboardingStepLayout = () => {
  const isMyahSubscriptionRequired = useAtomStateValue(
    isMyahSubscriptionRequiredState,
  );
  const { pathname } = useLocation();
  const isMyahPaywall =
    isMyahSubscriptionRequired &&
    (pathname === AppPath.PlanRequired ||
      pathname === AppPath.PlanRequiredSuccess);

  return (
    <OnboardingLayout hideHeader={isMyahPaywall}>
      <OnboardingTransitionOutlet />
    </OnboardingLayout>
  );
};
