import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider } from 'twenty-ui/theme-constants';

import { OnboardingHeader } from '@/onboarding/components/OnboardingHeader';
import { OnboardingStepLayout } from '@/onboarding/components/OnboardingStepLayout';

jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: () => ({
    importContacts: 0,
    inviteTeam: 0,
    installApps: 0,
  }),
}));
jest.mock('@/onboarding/hooks/useOnboardingContentWidth', () => ({
  useOnboardingContentWidth: () => 400,
}));
jest.mock('@/onboarding/hooks/useOnboardingMotionTransition', () => ({
  useOnboardingMotionTransition: () => ({ duration: 0 }),
}));
jest.mock('@/onboarding/components/OnboardingTransitionOutlet', () => ({
  OnboardingTransitionOutlet: () => <div>Onboarding content</div>,
}));

it('keeps the onboarding content without the misleading free-credits header', () => {
  render(
    <I18nProvider i18n={i18n}>
      <ThemeProvider colorScheme="light">
        <OnboardingStepLayout />
      </ThemeProvider>
    </I18nProvider>,
  );
  expect(screen.getByText('Onboarding content')).toBeVisible();
  expect(screen.queryByText(/free credits/i)).not.toBeInTheDocument();
});

it('keeps Back working', () => {
  const onBack = jest.fn();
  render(
    <I18nProvider i18n={i18n}>
      <ThemeProvider colorScheme="light">
        <OnboardingHeader onBack={onBack} />
      </ThemeProvider>
    </I18nProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
  expect(onBack).toHaveBeenCalledTimes(1);
});
