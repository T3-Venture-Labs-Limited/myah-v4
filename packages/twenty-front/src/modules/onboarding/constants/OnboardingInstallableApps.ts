import { msg } from '@lingui/core/macro';
import { type OnboardingInstallableApp } from '@/onboarding/types/OnboardingInstallableApp';

export const ONBOARDING_INSTALLABLE_APPS: OnboardingInstallableApp[] = [
  {
    universalIdentifier: '66a504cc-0a75-410e-a43f-cdeae1db1522',
    label: msg`Last contact`,
    description: msg`Get last contact date with relations`,
  },
];
