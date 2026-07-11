import { SettingsWorkspaceEmail } from '~/pages/settings/email/SettingsWorkspaceEmail';
import { useIsFeatureEnabled } from '@/workspace/hooks/useIsFeatureEnabled';
import { render, screen } from '@testing-library/react';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { SOURCE_LOCALE } from 'twenty-shared/translations';
import { messages } from '~/locales/generated/en';

jest.mock('@/workspace/hooks/useIsFeatureEnabled');

i18n.load({
  [SOURCE_LOCALE]: messages,
});
i18n.activate(SOURCE_LOCALE);

const renderWithI18n = (children: React.ReactNode) =>
  render(<I18nProvider i18n={i18n}>{children}</I18nProvider>);

jest.mock('@/settings/components/layout/SettingsPageLayout', () => ({
  SettingsPageLayout: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}));
jest.mock('@/settings/components/SettingsPageContainer', () => ({
  SettingsPageContainer: ({ children }: { children: React.ReactNode }) => (
    <section>{children}</section>
  ),
}));
jest.mock(
  '@/settings/workspace/components/SettingsWorkspaceEmailGroupSection',
  () => ({
    SettingsWorkspaceEmailGroupSection: () => <div>Email group section</div>,
  }),
);
jest.mock(
  '@/settings/unsubscribe-topics/components/SettingsWorkspaceUnsubscribeTopicSection',
  () => ({
    SettingsWorkspaceUnsubscribeTopicSection: () => (
      <div>Unsubscribe topics</div>
    ),
  }),
);
jest.mock('~/hooks/useNavigateSettings', () => ({
  useNavigateSettings: () => jest.fn(),
}));

const mockUseIsFeatureEnabled = jest.mocked(useIsFeatureEnabled);

describe('SettingsWorkspaceEmail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseIsFeatureEnabled.mockReturnValue(true);
  });

  it('does not render the Twenty Enterprise demo-mode upgrade card', () => {
    renderWithI18n(<SettingsWorkspaceEmail />);

    expect(
      screen.queryByText('Emailing is in demo mode'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Enterprise license/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Upgrade' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Email group section')).toBeVisible();
    expect(screen.getByText('Unsubscribe topics')).toBeVisible();
  });
});
