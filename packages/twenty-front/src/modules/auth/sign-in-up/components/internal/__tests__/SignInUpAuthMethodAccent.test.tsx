import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';
import { SOURCE_LOCALE } from 'twenty-shared/translations';
import { ThemeProvider } from 'twenty-ui/theme-constants';

import { SignInUpWithGoogle } from '@/auth/sign-in-up/components/internal/SignInUpWithGoogle';
import { SignInUpWithMicrosoft } from '@/auth/sign-in-up/components/internal/SignInUpWithMicrosoft';
import { SignInUpWithSSO } from '@/auth/sign-in-up/components/internal/SignInUpWithSSO';
import {
  SignInUpStep,
  signInUpStepState,
} from '@/auth/states/signInUpStepState';
import {
  jotaiStore,
  resetJotaiStore,
} from '@/ui/utilities/state/jotai/jotaiStore';
import { dynamicActivate } from '~/utils/i18n/dynamicActivate';

jest.mock('@/auth/sign-in-up/hooks/useHasMultipleAuthMethods', () => ({
  useHasMultipleAuthMethods: () => false,
}));

jest.mock('@/auth/sign-in-up/hooks/useSignInWithGoogle', () => ({
  useSignInWithGoogle: () => ({ signInWithGoogle: jest.fn() }),
}));

jest.mock('@/auth/sign-in-up/hooks/useSignInWithMicrosoft', () => ({
  useSignInWithMicrosoft: () => ({ signInWithMicrosoft: jest.fn() }),
}));

jest.mock('@/auth/sign-in-up/hooks/useSSO', () => ({
  useSSO: () => ({ redirectToSSOLoginPage: jest.fn() }),
}));

dynamicActivate(SOURCE_LOCALE);

const renderAuthMethods = (signInUpStep: SignInUpStep) => {
  jotaiStore.set(signInUpStepState.atom, signInUpStep);

  return render(
    <JotaiProvider store={jotaiStore}>
      <ThemeProvider colorScheme="light">
        <I18nProvider i18n={i18n}>
          <SignInUpWithGoogle action="join-workspace" />
          <SignInUpWithMicrosoft action="join-workspace" />
          <SignInUpWithSSO />
        </I18nProvider>
      </ThemeProvider>
    </JotaiProvider>,
  );
};

describe('SignInUp auth method accents', () => {
  beforeEach(() => {
    resetJotaiStore();
  });

  it('uses the dark entry treatment on the initial auth step', () => {
    renderAuthMethods(SignInUpStep.Init);

    expect(
      screen.getByRole('button', { name: 'Continue with Google' }),
    ).toHaveAttribute('data-accent', 'dark');
    expect(
      screen.getByRole('button', { name: 'Continue with Microsoft' }),
    ).toHaveAttribute('data-accent', 'dark');
    expect(
      screen.getByRole('button', { name: 'Single sign-on (SSO)' }),
    ).toHaveAttribute('data-accent', 'dark');
  });

  it('keeps auth alternatives neutral after the initial step', () => {
    renderAuthMethods(SignInUpStep.Email);

    expect(
      screen.getByRole('button', { name: 'Continue with Google' }),
    ).toHaveAttribute('data-variant', 'secondary');
    expect(
      screen.getByRole('button', { name: 'Continue with Google' }),
    ).toHaveAttribute('data-accent', 'brand');
    expect(
      screen.getByRole('button', { name: 'Continue with Microsoft' }),
    ).toHaveAttribute('data-variant', 'secondary');
    expect(
      screen.getByRole('button', { name: 'Continue with Microsoft' }),
    ).toHaveAttribute('data-accent', 'brand');
    expect(
      screen.getByRole('button', { name: 'Single sign-on (SSO)' }),
    ).toHaveAttribute('data-variant', 'secondary');
    expect(
      screen.getByRole('button', { name: 'Single sign-on (SSO)' }),
    ).toHaveAttribute('data-accent', 'brand');
  });
});
