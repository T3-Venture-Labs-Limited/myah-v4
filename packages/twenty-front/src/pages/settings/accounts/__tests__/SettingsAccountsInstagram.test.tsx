import { getTokenPair } from '@/apollo/utils/getTokenPair';
import { SettingsAccountsInstagram } from '~/pages/settings/accounts/SettingsAccountsInstagram';
import { render, screen } from '@testing-library/react';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import fetchMock, { enableFetchMocks } from 'jest-fetch-mock';

enableFetchMocks();
i18n.load('en', {});
i18n.activate('en');

jest.mock('@/apollo/utils/getTokenPair', () => ({
  getTokenPair: jest.fn(),
}));

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

jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: () => ({
    enqueueErrorSnackBar: jest.fn(),
    enqueueSuccessSnackBar: jest.fn(),
  }),
}));

jest.mock(
  'twenty-shared/types',
  () => ({
    SettingsPath: {
      Accounts: 'accounts',
      ProfilePage: 'profile',
    },
  }),
  { virtual: true },
);

jest.mock(
  'twenty-shared/utils',
  () => ({
    getSettingsPath: jest.fn(),
  }),
  { virtual: true },
);

jest.mock(
  'twenty-ui/icon',
  () => ({
    IconExternalLink: () => null,
    IconMessage: () => null,
    IconRefresh: () => null,
  }),
  { virtual: true },
);

jest.mock(
  'twenty-ui/input',
  () => ({
    Button: ({ title }: { title: string }) => <button>{title}</button>,
  }),
  { virtual: true },
);

jest.mock(
  'twenty-ui/layout',
  () => ({
    Section: ({ children }: { children: React.ReactNode }) => (
      <section>{children}</section>
    ),
  }),
  { virtual: true },
);

jest.mock(
  'twenty-ui/theme-constants',
  () => ({
    themeCssVariables: {
      background: {
        primary: 'var(--mock-background-primary)',
        secondary: 'var(--mock-background-secondary)',
        tertiary: 'var(--mock-background-tertiary)',
      },
      border: {
        color: { light: 'var(--mock-border-light)' },
        radius: { md: '8px', pill: '999px', sm: '4px' },
      },
      color: { green10: 'var(--mock-green-10)' },
      font: {
        color: {
          primary: 'var(--mock-font-primary)',
          secondary: 'var(--mock-font-secondary)',
        },
        size: { md: '16px', sm: '14px' },
        weight: { medium: '500', semiBold: '600' },
      },
      spacing: { 1: '4px', 2: '8px', 3: '12px', 4: '16px' },
    },
  }),
  { virtual: true },
);

jest.mock(
  'twenty-ui/typography',
  () => ({
    H2Title: ({
      title,
      description,
    }: {
      title: string;
      description: string;
    }) => (
      <>
        <h2>{title}</h2>
        <p>{description}</p>
      </>
    ),
  }),
  { virtual: true },
);

jest.mock('~/config', () => ({
  REACT_APP_SERVER_BASE_URL: 'http://localhost',
}));

const mockGetTokenPair = jest.mocked(getTokenPair);

const renderInstagramSettings = () =>
  render(
    <I18nProvider i18n={i18n}>
      <SettingsAccountsInstagram />
    </I18nProvider>,
  );

describe('SettingsAccountsInstagram', () => {
  beforeEach(() => {
    fetchMock.resetMocks();
    mockGetTokenPair.mockReturnValue({
      accessOrWorkspaceAgnosticToken: { token: 'test-token', expiresAt: '' },
      refreshToken: { token: 'refresh-token', expiresAt: '' },
    });
  });

  it('explains the connected account in customer language', async () => {
    fetchMock.mockResponseOnce(
      JSON.stringify({
        accounts: [
          {
            connectedAccountId: 'instagram-account-id',
            status: 'ACTIVE',
            username: 'myah_test_account',
            toolkitSlug: 'instagram',
          },
        ],
      }),
    );

    renderInstagramSettings();

    expect(await screen.findByText('Connected')).toBeVisible();

    expect(
      screen.getByText(
        'Connect your Instagram Business or Creator account to read conversations and reply with your approval.',
      ),
    ).toBeVisible();
    expect(
      screen.getByText(
        'Connect the Instagram account you use for your business. You can review conversations and approve each reply before it is sent.',
      ),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Read your existing Instagram conversations and reply when you're ready. Myah will always ask for your approval before sending a reply.",
      ),
    ).toBeVisible();
    expect(screen.getByText('Connected')).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost/rest/myah/instagram/accounts',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      }),
    );
    expect(screen.getByText('@myah_test_account')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Reconnect Instagram' }),
    ).toBeVisible();
    expect(
      screen.queryByText(
        'Team members and future agents will use this workspace connection without authorizing their own Instagram account.',
      ),
    ).not.toBeInTheDocument();
  });
});
