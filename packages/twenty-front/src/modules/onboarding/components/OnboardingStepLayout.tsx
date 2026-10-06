import { OnboardingLayout } from '@/onboarding/components/OnboardingLayout';
import { OnboardingTransitionOutlet } from '@/onboarding/components/OnboardingTransitionOutlet';

export const OnboardingStepLayout = () => (
  <OnboardingLayout>
    <OnboardingTransitionOutlet />
  </OnboardingLayout>
);
