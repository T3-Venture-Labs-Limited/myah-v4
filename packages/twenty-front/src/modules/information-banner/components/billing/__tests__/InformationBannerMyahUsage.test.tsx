import { InformationBannerMyahUsage } from '@/information-banner/components/billing/InformationBannerMyahUsage';
import { currentUserState } from '@/auth/states/currentUserState';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import {
  jotaiStore,
  resetJotaiStore,
} from '@/ui/utilities/state/jotai/jotaiStore';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'jotai';
import { type ReactNode } from 'react';
import { SettingsPath } from 'twenty-shared/types';
import { ThemeProvider } from 'twenty-ui/theme-constants';
import {
  mockedUserData,
  mockCurrentWorkspace,
} from '~/testing/mock-data/users';

const defaultUsage = () => ({
  state: 'ACTIVE',
  percentUsed: 81,
  exhausted: false,
  paymentRetrying: false,
  periodStart: '2026-10-05T00:00:00.000Z',
  resetAt: '2026-11-05T00:00:00.000Z',
});
let mockUsage = defaultUsage();
let mockEnabled = true;
let mockHasAccess = true;
let mockCanManage = true;
const mockNavigate = jest.fn();
jest.mock('@/settings/billing/hooks/useMyahWorkspaceUsage', () => ({
  useMyahWorkspaceUsage: () => ({
    isEnabled: mockEnabled,
    hasAccess: mockHasAccess,
    usage: mockUsage,
  }),
}));
jest.mock('@/settings/roles/hooks/useHasPermissionFlag', () => ({
  useHasPermissionFlag: () => mockCanManage,
}));
jest.mock('~/hooks/useNavigateSettings', () => ({
  useNavigateSettings: () => mockNavigate,
}));
const Wrapper = ({ children }: { children: ReactNode }) => (
  <Provider store={jotaiStore}>
    <I18nProvider i18n={i18n}>
      <ThemeProvider colorScheme="light">{children}</ThemeProvider>
    </I18nProvider>
  </Provider>
);
const mount = () =>
  render(<InformationBannerMyahUsage />, { wrapper: Wrapper });

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  resetJotaiStore();
  mockUsage = defaultUsage();
  mockEnabled = true;
  mockHasAccess = true;
  mockCanManage = true;
  jotaiStore.set(currentUserState.atom, mockedUserData);
  jotaiStore.set(currentWorkspaceState.atom, mockCurrentWorkspace);
});

it('shows the 80% threshold and date with a Billing link', () => {
  mount();
  expect(screen.getByText(/You've used 80%/)).toHaveTextContent('2026');
  fireEvent.click(screen.getByRole('button', { name: 'View usage' }));
  expect(mockNavigate).toHaveBeenCalledWith(SettingsPath.Billing);
});

it('remembers dismissal across mounts, scoped to user, workspace and period', () => {
  const first = mount();
  fireEvent.click(screen.getByRole('button', { name: 'Close banner' }));
  first.unmount();
  const second = mount();
  expect(screen.queryByText(/You've used 80%/)).not.toBeInTheDocument();
  act(() =>
    jotaiStore.set(currentUserState.atom, {
      ...mockedUserData,
      id: 'other-user',
    }),
  );
  expect(screen.getByText(/You've used 80%/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Close banner' }));
  act(() =>
    jotaiStore.set(currentWorkspaceState.atom, {
      ...mockCurrentWorkspace,
      id: 'other-workspace',
    }),
  );
  expect(screen.getByText(/You've used 80%/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Close banner' }));
  mockUsage = { ...mockUsage, periodStart: '2026-11-05T00:00:00.000Z' };
  second.rerender(<InformationBannerMyahUsage />);
  expect(screen.getByText(/You've used 80%/)).toBeInTheDocument();
});

it('does not let a dismissed warning hide exhaustion, and keeps sending available', () => {
  const view = mount();
  fireEvent.click(screen.getByRole('button', { name: 'Close banner' }));
  mockUsage = { ...mockUsage, percentUsed: 100, exhausted: true };
  view.rerender(<InformationBannerMyahUsage />);
  expect(
    screen.getByText(/This month's AI usage is used up/),
  ).toHaveTextContent('Sending messages keeps working');
  expect(
    screen.queryByRole('button', { name: 'Close banner' }),
  ).not.toBeInTheDocument();
});

it.each([false, true])(
  'shows payment retrying and payment-dependent reset for exhausted=%s',
  (exhausted) => {
    mockUsage = {
      ...mockUsage,
      state: 'PAYMENT_RETRYING',
      paymentRetrying: true,
      exhausted,
      percentUsed: exhausted ? 100 : 85,
    };
    mount();
    expect(
      screen.getByText(/Your payment didn't go through/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/It resets when your renewal payment goes through/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/It resets on/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Update card' }));
    expect(mockNavigate).toHaveBeenCalledWith(SettingsPath.Billing);
  },
);

it('tells ordinary members to ask an admin and offers no Billing controls', () => {
  mockCanManage = false;
  mockUsage = {
    ...mockUsage,
    state: 'PAYMENT_RETRYING',
    paymentRetrying: true,
  };
  mount();
  expect(
    screen.getByText(/Ask a workspace admin to update the card/),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Update card' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'View usage' }),
  ).not.toBeInTheDocument();
});

it('removes payment and usage banners after a paid reset', () => {
  mockUsage = {
    ...mockUsage,
    state: 'PAYMENT_RETRYING',
    paymentRetrying: true,
    exhausted: true,
    percentUsed: 100,
  };
  const view = mount();
  mockUsage = {
    ...defaultUsage(),
    percentUsed: 0,
    periodStart: '2026-11-05T00:00:00.000Z',
  };
  view.rerender(<InformationBannerMyahUsage />);
  expect(
    screen.queryByText(/payment didn't go through/),
  ).not.toBeInTheDocument();
  expect(screen.queryByText(/AI usage is used up/)).not.toBeInTheDocument();
});

it.each(['off', 'complimentary', 'lapsed', 'below-threshold'])(
  'does not show usage banners for %s',
  (scenario) => {
    if (scenario === 'off') mockEnabled = false;
    if (scenario === 'complimentary') mockUsage.state = 'COMPLIMENTARY';
    if (scenario === 'lapsed') mockHasAccess = false;
    if (scenario === 'below-threshold') mockUsage.percentUsed = 79;
    mount();
    expect(screen.queryByText(/You've used 80%/)).not.toBeInTheDocument();
  },
);

it('still dismisses in memory if browser storage writes are unavailable', () => {
  const setItem = jest
    .spyOn(Storage.prototype, 'setItem')
    .mockImplementation(() => {
      throw new Error('Storage blocked');
    });
  try {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Close banner' }));
    expect(screen.queryByText(/You've used 80%/)).not.toBeInTheDocument();
  } finally {
    setItem.mockRestore();
  }
});
