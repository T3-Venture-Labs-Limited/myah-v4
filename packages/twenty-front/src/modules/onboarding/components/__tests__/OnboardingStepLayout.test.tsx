import { render, screen } from '@testing-library/react';
import { Provider } from 'jotai';
import { MemoryRouter } from 'react-router-dom';
import { AppPath } from 'twenty-shared/types';
import { isMyahSubscriptionRequiredState } from '@/client-config/states/isMyahSubscriptionRequiredState';
import { OnboardingStepLayout } from '@/onboarding/components/OnboardingStepLayout';
import {
  jotaiStore,
  resetJotaiStore,
} from '@/ui/utilities/state/jotai/jotaiStore';

jest.mock('@/onboarding/hooks/useOnboardingFreeCreditsTotal', () => ({
  useOnboardingFreeCreditsTotal: () => 12,
}));
jest.mock('@/onboarding/components/OnboardingTransitionOutlet', () => ({
  OnboardingTransitionOutlet: () => <div>Page content</div>,
}));
jest.mock('@/onboarding/components/OnboardingHeader', () => ({
  OnboardingHeader: ({ freeCredits }: { freeCredits?: number }) => (
    <header>
      Onboarding header
      {freeCredits !== undefined && <span>{freeCredits} free credits</span>}
    </header>
  ),
}));

beforeEach(() => {
  resetJotaiStore();
});
const mount = (path: AppPath, enabled: boolean) => {
  jotaiStore.set(isMyahSubscriptionRequiredState.atom, enabled);
  return render(
    <Provider store={jotaiStore}>
      <MemoryRouter initialEntries={[path]}>
        <OnboardingStepLayout />
      </MemoryRouter>
    </Provider>,
  );
};
it.each([AppPath.PlanRequired, AppPath.PlanRequiredSuccess])(
  'omits the legacy header and free credits on Myah %s',
  (path) => {
    mount(path, true);
    expect(screen.getByText('Page content')).toBeVisible();
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    expect(screen.queryByText(/free credits/)).not.toBeInTheDocument();
  },
);
it('keeps the old onboarding layout when the Myah flag is off', () => {
  mount(AppPath.PlanRequired, false);
  expect(screen.getByRole('banner')).toBeVisible();
  expect(screen.getByText('12 free credits')).toBeVisible();
});
it('keeps the header but not obsolete credit rewards on other Myah onboarding steps', () => {
  mount(AppPath.SyncEmails, true);
  expect(screen.getByRole('banner')).toBeVisible();
  expect(screen.queryByText(/free credits/)).not.toBeInTheDocument();
});
