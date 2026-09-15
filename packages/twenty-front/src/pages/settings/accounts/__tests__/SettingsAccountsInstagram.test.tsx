import { getTokenPair } from '@/apollo/utils/getTokenPair';
import { navigateToHostedAuth } from '~/pages/settings/accounts/utils/navigateToHostedAuth';
import { SettingsAccountsInstagram } from '~/pages/settings/accounts/SettingsAccountsInstagram';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import fetchMock, { enableFetchMocks } from 'jest-fetch-mock';

enableFetchMocks();
i18n.load('en', {});
i18n.activate('en');

jest.mock('@/apollo/utils/getTokenPair', () => ({
  getTokenPair: jest.fn(),
}));

jest.mock('~/pages/settings/accounts/utils/navigateToHostedAuth', () => ({
  navigateToHostedAuth: jest.fn(),
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

const mockEnqueueErrorSnackBar = jest.fn();
const mockEnqueueSuccessSnackBar = jest.fn();
const mockEnqueueWarningSnackBar = jest.fn();

jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: () => ({
    enqueueErrorSnackBar: mockEnqueueErrorSnackBar,
    enqueueSuccessSnackBar: mockEnqueueSuccessSnackBar,
    enqueueWarningSnackBar: mockEnqueueWarningSnackBar,
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
    Button: ({
      title,
      onClick,
      disabled,
      isLoading,
    }: {
      title: string;
      onClick?: () => void;
      disabled?: boolean;
      isLoading?: boolean;
    }) => (
      <button disabled={disabled || isLoading} onClick={onClick}>
        {title}
      </button>
    ),
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
const mockNavigateToHostedAuth = jest.mocked(navigateToHostedAuth);

const mockWindowOpen = jest
  .spyOn(window, 'open')
  .mockImplementation(() => null);
const mockWindowConfirm = jest.spyOn(window, 'confirm');

const renderInstagramSettings = () =>
  render(
    <I18nProvider i18n={i18n}>
      <SettingsAccountsInstagram />
    </I18nProvider>,
  );

describe('SettingsAccountsInstagram', () => {
  beforeEach(() => {
    fetchMock.resetMocks();
    mockNavigateToHostedAuth.mockReset();
    mockEnqueueErrorSnackBar.mockReset();
    mockEnqueueSuccessSnackBar.mockReset();
    mockEnqueueWarningSnackBar.mockReset();
    mockWindowOpen.mockClear();
    mockWindowConfirm.mockReset().mockReturnValue(true);
    mockGetTokenPair.mockReturnValue({
      accessOrWorkspaceAgnosticToken: { token: 'test-token', expiresAt: '' },
      refreshToken: { token: 'refresh-token', expiresAt: '' },
    });
    window.history.replaceState({}, '', '/settings/accounts/instagram');
  });

  afterEach(() => {
    jest.useRealTimers();
    window.history.replaceState({}, '', '/settings/accounts/instagram');
  });

  it('explains the Instagram connection in customer language', async () => {
    fetchMock.mockResponseOnce(
      JSON.stringify({
        id: 'workspace-binding-id',
        username: 'myah_test_account',
        status: 'ACTIVE',
        lastCheckedAt: null,
        lastError: null,
      }),
    );

    renderInstagramSettings();

    expect(
      await screen.findByText(
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
  });

  it('navigates the current tab to hosted authorization when no account is connected', async () => {
    const redirectUrl = 'https://hosted-auth.example/connect';
    fetchMock.mockResponseOnce('');
    fetchMock.mockResponseOnce(
      JSON.stringify({ attemptId: 'connect-attempt-id', redirectUrl }),
    );

    const user = userEvent.setup();
    renderInstagramSettings();
    const connectButton = await screen.findByRole('button', {
      name: 'Connect Instagram',
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost/rest/myah/unipile/instagram/account',
      {
        method: 'GET',
        headers: {
          Authorization: 'Bearer test-token',
          'content-type': 'application/json',
        },
      },
    );

    await user.click(connectButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        'http://localhost/rest/myah/unipile/instagram/hosted-auth/connect',
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer test-token',
            'content-type': 'application/json',
          },
        },
      );
    });
    expect(mockNavigateToHostedAuth).toHaveBeenCalledWith(redirectUrl);
    expect(mockEnqueueSuccessSnackBar).not.toHaveBeenCalled();
    expect(mockWindowOpen).not.toHaveBeenCalled();
  });

  it('shows disconnected success and reloads after a confirmed disconnect', async () => {
    fetchMock.mockResponseOnce(
      JSON.stringify({
        id: 'workspace-binding-id',
        username: 'myah_test_account',
        status: 'ACTIVE',
        lastCheckedAt: null,
        lastError: null,
      }),
    );
    fetchMock.mockResponseOnce(JSON.stringify({ status: 'DISCONNECTED' }));
    fetchMock.mockResponseOnce('');

    const user = userEvent.setup();
    renderInstagramSettings();

    expect(await screen.findByText('Active')).toBeVisible();
    expect(screen.getByText('@myah_test_account')).toBeVisible();

    await user.click(
      screen.getByRole('button', { name: 'Disconnect Instagram' }),
    );

    await waitFor(() => {
      expect(mockWindowConfirm).toHaveBeenCalledTimes(1);
      expect(mockEnqueueSuccessSnackBar).toHaveBeenCalledWith({
        message: 'Instagram account disconnected.',
      });
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        'http://localhost/rest/myah/unipile/instagram/disconnect',
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer test-token',
            'content-type': 'application/json',
          },
        },
      );
      expect(fetchMock).toHaveBeenNthCalledWith(
        3,
        'http://localhost/rest/myah/unipile/instagram/account',
        {
          method: 'GET',
          headers: {
            Authorization: 'Bearer test-token',
            'content-type': 'application/json',
          },
        },
      );
    });
    expect(
      await screen.findByRole('button', { name: 'Connect Instagram' }),
    ).toBeVisible();
  });

  it.each([true, false])(
    'keeps pending nonactionable after disconnect when status refresh succeeds: %s',
    async (refreshSucceeds) => {
      fetchMock.mockResponseOnce(
        JSON.stringify({
          id: 'workspace-binding-id',
          username: 'myah_test_account',
          status: 'ACTIVE',
          lastCheckedAt: null,
          lastError: null,
        }),
      );
      fetchMock.mockResponseOnce(
        JSON.stringify({ status: 'PENDING_RECOVERY' }),
      );
      if (refreshSucceeds) {
        fetchMock.mockResponseOnce(
          JSON.stringify({
            id: 'workspace-binding-id',
            username: 'myah_test_account',
            status: 'DELETE_UNKNOWN',
            lastCheckedAt: null,
            lastError: null,
          }),
        );
      } else {
        fetchMock.mockResponseOnce('', { status: 500 });
      }

      const user = userEvent.setup();
      renderInstagramSettings();

      await user.click(
        await screen.findByRole('button', { name: 'Disconnect Instagram' }),
      );

      await waitFor(() => {
        expect(mockEnqueueWarningSnackBar).toHaveBeenCalledWith({
          message: 'Instagram disconnect is still being confirmed.',
        });
        expect(mockEnqueueSuccessSnackBar).not.toHaveBeenCalled();
        expect(fetchMock).toHaveBeenNthCalledWith(
          3,
          'http://localhost/rest/myah/unipile/instagram/account',
          {
            method: 'GET',
            headers: {
              Authorization: 'Bearer test-token',
              'content-type': 'application/json',
            },
          },
        );
      });
      expect(
        await screen.findByText('Disconnect pending', { exact: true }),
      ).toBeVisible();
      const disconnect = screen.getByRole('button', {
        name: 'Disconnect Instagram',
      });
      expect(disconnect).toBeDisabled();
      expect(
        screen.queryByRole('button', { name: 'Connect Instagram' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Reconnect Instagram' }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Refresh status' }),
      ).toBeEnabled();
      await user.click(disconnect);
      expect(mockWindowConfirm).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    },
  );

  it('keeps a delete-unknown account nonactionable while Refresh status remains available', async () => {
    fetchMock.mockResponseOnce(
      JSON.stringify({
        id: 'workspace-binding-id',
        username: 'myah_test_account',
        status: 'DELETE_UNKNOWN',
        lastCheckedAt: null,
        lastError: null,
      }),
    );

    const user = userEvent.setup();
    renderInstagramSettings();

    expect(
      await screen.findByText('Disconnect pending', { exact: true }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Disconnect Instagram' }),
    ).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Connect Instagram' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Reconnect Instagram' }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Disconnect Instagram' }),
    );
    expect(mockWindowConfirm).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const refresh = screen.getByRole('button', { name: 'Refresh status' });
    expect(refresh).toBeEnabled();
    fetchMock.mockResponseOnce(
      JSON.stringify({
        id: 'workspace-binding-id',
        username: 'myah_test_account',
        status: 'DELETE_UNKNOWN',
        lastCheckedAt: null,
        lastError: null,
      }),
    );
    await user.click(refresh);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(
      fetchMock.mock.calls.every(([, options]) => options?.method === 'GET'),
    ).toBe(true);
    expect(
      screen.getByRole('button', { name: 'Disconnect Instagram' }),
    ).toBeDisabled();
  });

  it('labels an inactive account Inactive and offers only Connect', async () => {
    fetchMock.mockResponseOnce(
      JSON.stringify({
        id: 'workspace-binding-id',
        username: 'myah_test_account',
        status: 'INACTIVE',
        lastCheckedAt: null,
        lastError: null,
      }),
    );

    renderInstagramSettings();

    expect(await screen.findByText('Inactive', { exact: true })).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Connect Instagram' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Disconnect Instagram' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Reconnect Instagram' }),
    ).not.toBeInTheDocument();
  });

  it('offers reconnect and disconnect for an account that needs reconnecting', async () => {
    const redirectUrl = 'https://hosted-auth.example/reconnect';
    fetchMock.mockResponseOnce(
      JSON.stringify({
        id: 'workspace-binding-id',
        username: 'myah_test_account',
        status: 'NEEDS_RECONNECT',
        lastCheckedAt: null,
        lastError: null,
      }),
    );
    fetchMock.mockResponseOnce(
      JSON.stringify({ attemptId: 'reconnect-attempt-id', redirectUrl }),
    );

    const user = userEvent.setup();
    renderInstagramSettings();

    expect(await screen.findByText('Needs reconnect')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Reconnect Instagram' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Disconnect Instagram' }),
    ).toBeVisible();

    await user.click(
      screen.getByRole('button', { name: 'Reconnect Instagram' }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        'http://localhost/rest/myah/unipile/instagram/hosted-auth/reconnect',
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer test-token',
            'content-type': 'application/json',
          },
        },
      );
    });
  });

  it('offers disconnect without another connection action while connecting', async () => {
    fetchMock.mockResponseOnce(
      JSON.stringify({
        id: 'workspace-binding-id',
        username: null,
        status: 'CONNECTING',
        lastCheckedAt: null,
        lastError: null,
      }),
    );

    renderInstagramSettings();

    expect(await screen.findByText('Connecting')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Disconnect Instagram' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Connect Instagram' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Reconnect Instagram' }),
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('labels an errored account Error and offers recovery or disconnect', async () => {
    fetchMock.mockResponseOnce(
      JSON.stringify({
        id: 'workspace-binding-id',
        username: 'myah_test_account',
        status: 'ERROR',
        lastCheckedAt: null,
        lastError: 'provider details must not be shown',
      }),
    );

    renderInstagramSettings();

    expect(await screen.findByText('Error', { exact: true })).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Reconnect Instagram' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Disconnect Instagram' }),
    ).toBeVisible();
  });

  it('treats an empty successful account response as no connected account', async () => {
    fetchMock.mockResponseOnce('');

    renderInstagramSettings();

    const connectButton = await screen.findByRole('button', {
      name: 'Connect Instagram',
    });

    await waitFor(() => expect(connectButton).toBeEnabled());
    expect(mockEnqueueErrorSnackBar).not.toHaveBeenCalled();
  });

  it('does not poll hosted authorization status without an attempt id', async () => {
    fetchMock.mockResponseOnce('');

    renderInstagramSettings();

    const connectButton = await screen.findByRole('button', {
      name: 'Connect Instagram',
    });

    await waitFor(() => expect(connectButton).toBeEnabled());

    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/hosted-auth/'),
      expect.anything(),
    );
  });

  it('loads the actual account immediately without polling after a failed Hosted Auth return', async () => {
    jest.useFakeTimers();
    window.history.replaceState(
      {},
      '',
      '/settings/accounts/instagram?connection=failed&attemptId=failed-attempt-id',
    );
    fetchMock.mockResponseOnce('');

    renderInstagramSettings();

    const connectButton = await screen.findByRole('button', {
      name: 'Connect Instagram',
    });

    await waitFor(() => expect(connectButton).toBeEnabled());
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost/rest/myah/unipile/instagram/account',
      {
        method: 'GET',
        headers: {
          Authorization: 'Bearer test-token',
          'content-type': 'application/json',
        },
      },
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/hosted-auth/failed-attempt-id/status'),
      expect.anything(),
    );

    await act(async () => {
      await jest.advanceTimersByTimeAsync(30_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('polls an attempt before loading the account and reloads it once on completion', async () => {
    jest.useFakeTimers();
    window.history.replaceState(
      {},
      '',
      '/settings/accounts/instagram?attemptId=attempt-id',
    );
    fetchMock.mockResponseOnce(JSON.stringify({ status: 'PROCESSING' }));
    fetchMock.mockResponseOnce(JSON.stringify({ status: 'PENDING' }));
    fetchMock.mockResponseOnce(JSON.stringify({ status: 'COMPLETED' }));
    fetchMock.mockResponseOnce(
      JSON.stringify({
        id: 'workspace-binding-id',
        username: 'myah_test_account',
        status: 'ACTIVE',
        lastCheckedAt: null,
        lastError: null,
      }),
    );

    renderInstagramSettings();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        'http://localhost/rest/myah/unipile/instagram/hosted-auth/attempt-id/status',
        {
          method: 'GET',
          headers: {
            Authorization: 'Bearer test-token',
            'content-type': 'application/json',
          },
        },
      );
    });
    expect(fetchMock).not.toHaveBeenCalledWith(
      'http://localhost/rest/myah/unipile/instagram/account',
      expect.anything(),
    );

    await act(async () => {
      await jest.advanceTimersByTimeAsync(1_000);
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      await jest.advanceTimersByTimeAsync(1_000);
    });
    expect(await screen.findByText('Active')).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'http://localhost/rest/myah/unipile/instagram/account',
      {
        method: 'GET',
        headers: {
          Authorization: 'Bearer test-token',
          'content-type': 'application/json',
        },
      },
    );

    await act(async () => {
      await jest.advanceTimersByTimeAsync(60_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('surfaces a safe error and stops loading or polling when hosted authorization fails', async () => {
    jest.useFakeTimers();
    window.history.replaceState(
      {},
      '',
      '/settings/accounts/instagram?attemptId=failed-attempt-id',
    );
    fetchMock.mockResponseOnce(
      JSON.stringify({ status: 'FAILED', error: 'provider-internal-detail' }),
    );
    fetchMock.mockResponseOnce(
      JSON.stringify({
        id: 'workspace-binding-id',
        username: 'myah_test_account',
        status: 'NEEDS_RECONNECT',
        lastCheckedAt: null,
        lastError: null,
      }),
    );

    renderInstagramSettings();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        'http://localhost/rest/myah/unipile/instagram/hosted-auth/failed-attempt-id/status',
        {
          method: 'GET',
          headers: {
            Authorization: 'Bearer test-token',
            'content-type': 'application/json',
          },
        },
      );
      expect(mockEnqueueErrorSnackBar).toHaveBeenCalledWith({
        message: expect.any(String),
      });
    });
    expect(mockEnqueueErrorSnackBar).not.toHaveBeenCalledWith({
      message: 'provider-internal-detail',
    });
    expect(
      await screen.findByRole('button', { name: 'Reconnect Instagram' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Disconnect Instagram' }),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost/rest/myah/unipile/instagram/account',
      expect.anything(),
    );

    await act(async () => {
      await jest.advanceTimersByTimeAsync(60_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('loads the reconnect state once after pending Hosted Auth polling times out', async () => {
    jest.useFakeTimers();
    window.history.replaceState(
      {},
      '',
      '/settings/accounts/instagram?attemptId=pending-attempt-id',
    );
    for (let read = 0; read < 30; read++) {
      fetchMock.mockResponseOnce(JSON.stringify({ status: 'PENDING' }));
    }
    fetchMock.mockResponseOnce(
      JSON.stringify({
        id: 'workspace-binding-id',
        username: 'myah_test_account',
        status: 'NEEDS_RECONNECT',
        lastCheckedAt: null,
        lastError: null,
      }),
    );

    renderInstagramSettings();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        'http://localhost/rest/myah/unipile/instagram/hosted-auth/pending-attempt-id/status',
        expect.anything(),
      );
    });

    await act(async () => {
      await jest.advanceTimersByTimeAsync(30_000);
    });

    expect(mockEnqueueErrorSnackBar).toHaveBeenCalledWith({
      message: 'Could not confirm Instagram authorization.',
    });
    expect(fetchMock).toHaveBeenCalledTimes(31);
    expect(fetchMock).toHaveBeenNthCalledWith(
      31,
      'http://localhost/rest/myah/unipile/instagram/account',
      expect.anything(),
    );
    expect(
      await screen.findByRole('button', { name: 'Reconnect Instagram' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Disconnect Instagram' }),
    ).toBeVisible();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(60_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(31);
  });

  it('shows a safe error when loading the account status fails', async () => {
    fetchMock.mockResponseOnce('', { status: 500 });

    renderInstagramSettings();

    await waitFor(() => {
      expect(mockEnqueueErrorSnackBar).toHaveBeenCalledWith({
        message: 'Could not load Instagram connection status.',
      });
    });
  });

  it('shows a safe error for a malformed nonempty account response', async () => {
    fetchMock.mockResponseOnce('not-json');

    renderInstagramSettings();

    await waitFor(() => {
      expect(mockEnqueueErrorSnackBar).toHaveBeenCalledWith({
        message: 'Could not load Instagram connection status.',
      });
    });
  });
});
