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

jest.mock('@/ui/field/display/components/DateTimeDisplay', () => ({
  DateTimeDisplay: ({ value }: { value: string }) => (
    <time data-testid="instagram-date" dateTime={value}>
      Formatted date
    </time>
  ),
}));

jest.mock('twenty-ui/data-display', () => ({
  Status: ({ text }: { text: string }) => <span>{text}</span>,
}));

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
      <button disabled={disabled} aria-busy={isLoading} onClick={onClick}>
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
      if (refreshSucceeds) {
        expect(
          await screen.findByText('Disconnect pending', { exact: true }),
        ).toBeVisible();
        const disconnect = screen.getByRole('button', {
          name: 'Disconnect Instagram',
        });
        expect(disconnect).toBeDisabled();
        expect(
          screen.getByRole('button', { name: 'Refresh status' }),
        ).toBeEnabled();
        await user.click(disconnect);
      } else {
        expect(
          await screen.findByText(
            'Could not load Instagram connection status.',
          ),
        ).toBeVisible();
        expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
        expect(
          screen.queryByRole('button', { name: 'Disconnect Instagram' }),
        ).not.toBeInTheDocument();
      }
      expect(
        screen.queryByRole('button', { name: 'Connect Instagram' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Reconnect Instagram' }),
      ).not.toBeInTheDocument();
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

  it('tabs through recovery actions, refreshes read-only, and disables changes during reconnect', async () => {
    fetchMock.mockResponseOnce(
      JSON.stringify({
        id: 'binding-id',
        username: null,
        status: 'NEEDS_RECONNECT',
        lastCheckedAt: null,
        lastError: null,
      }),
    );
    fetchMock.mockResponseOnce(
      JSON.stringify({
        id: 'binding-id',
        username: null,
        status: 'NEEDS_RECONNECT',
        lastCheckedAt: null,
        lastError: null,
      }),
    );
    const user = userEvent.setup();
    renderInstagramSettings();
    const reconnect = await screen.findByRole('button', {
      name: 'Reconnect Instagram',
    });
    const disconnect = screen.getByRole('button', {
      name: 'Disconnect Instagram',
    });
    const refresh = screen.getByRole('button', { name: 'Refresh status' });

    await user.tab();
    expect(reconnect).toHaveFocus();
    await user.tab();
    expect(disconnect).toHaveFocus();
    await user.tab();
    expect(refresh).toHaveFocus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(
      fetchMock.mock.calls.every(([, options]) => options?.method === 'GET'),
    ).toBe(true);

    let resolvePost: (value: string) => void = () => undefined;
    fetchMock.mockResponseOnce(
      () =>
        new Promise<string>((resolve) => {
          resolvePost = resolve;
        }),
    );
    await user.click(reconnect);
    expect(disconnect).toBeDisabled();
    expect(reconnect).toBeDisabled();
    expect(mockWindowConfirm).not.toHaveBeenCalled();
    await act(async () => {
      resolvePost(
        JSON.stringify({
          attemptId: 'a',
          redirectUrl: 'https://hosted-auth.example/reconnect',
        }),
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

  it('settles a completed Hosted Auth connection without refreshing or flashing loading', async () => {
    jest.useFakeTimers();
    window.history.replaceState(
      {},
      '',
      '/settings/accounts/instagram?attemptId=attempt-id',
    );
    fetchMock.mockResponseOnce(JSON.stringify({ status: 'COMPLETED' }));
    fetchMock.mockResponseOnce(
      JSON.stringify({
        id: 'binding-id',
        username: null,
        status: 'CONNECTING',
        lastCheckedAt: null,
        lastError: null,
      }),
    );
    fetchMock.mockResponseOnce(
      JSON.stringify({
        id: 'binding-id',
        username: null,
        status: 'ACTIVE',
        lastCheckedAt: null,
        lastError: null,
      }),
    );
    renderInstagramSettings();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(100);
    });
    expect(screen.getByText('Connecting')).toBeVisible();
    expect(screen.queryByText('Checking status')).not.toBeInTheDocument();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(5_000);
    });
    expect(screen.getByText('Active')).toBeVisible();
    expect(screen.queryByText('Checking status')).not.toBeInTheDocument();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(30_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('keeps Connecting on a failed silent read and settles on the next read', async () => {
    jest.useFakeTimers();
    fetchMock.mockResponseOnce(
      JSON.stringify({
        id: 'binding-id',
        username: null,
        status: 'CONNECTING',
        lastCheckedAt: null,
        lastError: null,
      }),
    );
    fetchMock.mockResponseOnce('', { status: 500 });
    fetchMock.mockResponseOnce(
      JSON.stringify({
        id: 'binding-id',
        username: null,
        status: 'ACTIVE',
        lastCheckedAt: null,
        lastError: null,
      }),
    );
    renderInstagramSettings();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(100);
    });
    expect(screen.getByText('Connecting')).toBeVisible();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(5_000);
    });
    expect(screen.getByText('Connecting')).toBeVisible();
    expect(mockEnqueueErrorSnackBar).not.toHaveBeenCalled();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(5_000);
    });
    expect(screen.getByText('Active')).toBeVisible();
    expect(
      fetchMock.mock.calls.every(([, options]) => options?.method === 'GET'),
    ).toBe(true);
  });

  it('ignores an old automatic response after a newer manual status read settles', async () => {
    jest.useFakeTimers();
    const connecting = JSON.stringify({
      id: 'binding-id',
      username: null,
      status: 'CONNECTING',
      lastCheckedAt: null,
      lastError: null,
    });
    fetchMock.mockResponseOnce(connecting);
    let resolveOldRead: (value: string) => void = () => undefined;
    fetchMock.mockResponseOnce(
      () =>
        new Promise<string>((resolve) => {
          resolveOldRead = resolve;
        }),
    );
    fetchMock.mockResponseOnce(
      JSON.stringify({
        id: 'binding-id',
        username: null,
        status: 'ACTIVE',
        lastCheckedAt: null,
        lastError: null,
      }),
    );
    renderInstagramSettings();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(100);
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(5_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => {
      screen.getByRole('button', { name: 'Refresh status' }).click();
    });
    expect(screen.getByText('Active')).toBeVisible();
    await act(async () => {
      resolveOldRead(connecting);
    });
    expect(screen.getByText('Active')).toBeVisible();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(5_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('stops auto-refresh after six minutes or unmount and leaves manual Refresh available', async () => {
    jest.useFakeTimers();
    const connecting = JSON.stringify({
      id: 'binding-id',
      username: null,
      status: 'CONNECTING',
      lastCheckedAt: null,
      lastError: null,
    });
    fetchMock.mockResponse(connecting);
    const view = renderInstagramSettings();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(100);
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(360_000);
    });
    expect(
      screen.getByText(/Instagram is still finishing the connection/),
    ).toBeVisible();
    const atExpiry = fetchMock.mock.calls.length;
    await act(async () => {
      await jest.advanceTimersByTimeAsync(30_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(atExpiry);
    await act(async () => {
      screen.getByRole('button', { name: 'Refresh status' }).click();
    });
    expect(fetchMock).toHaveBeenCalledTimes(atExpiry + 1);
    view.unmount();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(30_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(atExpiry + 1);
  });

  it('stops polling when a Connecting page unmounts', async () => {
    jest.useFakeTimers();
    fetchMock.mockResponse(
      JSON.stringify({
        id: 'binding-id',
        username: null,
        status: 'CONNECTING',
        lastCheckedAt: null,
        lastError: null,
      }),
    );
    const view = renderInstagramSettings();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(100);
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(5_000);
    });
    const reads = fetchMock.mock.calls.length;
    expect(reads).toBe(2);
    view.unmount();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(30_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(reads);
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

  it.each([
    ['ACTIVE', 'Instagram is connected and syncing.', 'Disconnect Instagram'],
    [
      'CONNECTING',
      'Instagram is finishing the connection.',
      'Disconnect Instagram',
    ],
    [
      'NEEDS_RECONNECT',
      'Instagram needs you to sign in again. Your login may have expired or access may have been removed.',
      'Reconnect Instagram',
    ],
    [
      'ERROR',
      'Instagram stopped working for this account. Reconnect to try again.',
      'Reconnect Instagram',
    ],
    [
      'DELETE_UNKNOWN',
      'Instagram is still confirming the disconnect.',
      'Refresh status',
    ],
    [
      'INACTIVE',
      'Connect Instagram to start syncing conversations.',
      'Connect Instagram',
    ],
  ])(
    'explains %s with a safe next step',
    async (status, explanation, action) => {
      fetchMock.mockResponseOnce(
        JSON.stringify({
          id: 'binding-id',
          username: null,
          status,
          lastCheckedAt: null,
          lastError: 'Unable to verify Instagram account connection',
        }),
      );
      renderInstagramSettings();

      expect(await screen.findByText(explanation)).toBeVisible();
      expect(screen.getByRole('status')).toHaveTextContent(explanation);
      expect(screen.getByRole('button', { name: action })).toBeInTheDocument();
      expect(
        screen.queryByText('Unable to verify Instagram account connection'),
      ).not.toBeInTheDocument();
    },
  );

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

  it('ignores the provider account_id query and loads the authenticated workspace account on completion', async () => {
    jest.useFakeTimers();
    window.history.replaceState(
      {},
      '',
      '/settings/accounts/instagram?connection=success&attemptId=attempt-id&account_id=untrusted-provider-id',
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
    expect(await screen.findByText('@myah_test_account')).toBeVisible();
    expect(screen.queryByText('untrusted-provider-id')).not.toBeInTheDocument();
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

  it('formats the three activity times and shows explicit empty states', async () => {
    const lastSyncedAt = '2026-09-29T04:00:46.000Z';
    const lastMessageReceivedAt = '2026-09-29T04:09:27.000Z';
    const lastCheckedAt = '2026-09-29T04:10:00.000Z';
    fetchMock.mockResponseOnce(
      JSON.stringify({
        id: 'binding-id',
        username: null,
        status: 'ACTIVE',
        lastError: null,
        lastSyncedAt,
        lastMessageReceivedAt,
        lastCheckedAt,
      }),
    );
    renderInstagramSettings();

    expect(await screen.findByText('Last synced')).toBeVisible();
    expect(screen.getByText('Last message received')).toBeVisible();
    expect(screen.getByText('Last checked')).toBeVisible();
    expect(
      screen
        .getAllByTestId('instagram-date')
        .map((element) => element.getAttribute('datetime')),
    ).toEqual([lastSyncedAt, lastMessageReceivedAt, lastCheckedAt]);
    expect(screen.queryByText(lastSyncedAt)).not.toBeInTheDocument();

    fetchMock.mockResponseOnce(
      JSON.stringify({
        id: 'binding-id',
        username: null,
        status: 'ACTIVE',
        lastError: null,
        lastSyncedAt: null,
        lastMessageReceivedAt: null,
        lastCheckedAt: null,
      }),
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Refresh status' }));
    expect(await screen.findByText('Not synced yet')).toBeVisible();
    expect(screen.getByText('No messages received yet')).toBeVisible();
    expect(screen.queryByText('Last checked')).not.toBeInTheDocument();
  });

  it('shows an announced error without stale actions when Refresh fails for a loaded account', async () => {
    fetchMock.mockResponseOnce(
      JSON.stringify({
        id: 'binding-id',
        username: 'myah_test_account',
        status: 'ACTIVE',
        lastCheckedAt: null,
        lastError: null,
      }),
    );
    fetchMock.mockResponseOnce('', { status: 500 });
    const user = userEvent.setup();
    renderInstagramSettings();

    await screen.findByRole('button', { name: 'Disconnect Instagram' });
    await user.click(screen.getByRole('button', { name: 'Refresh status' }));

    expect(
      await screen.findByText('Could not load Instagram connection status.'),
    ).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Could not load Instagram connection status.',
    );
    expect(
      screen.queryByRole('button', { name: 'Disconnect Instagram' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
  });

  it('does not offer Connect on a failed load and recovers through Try again', async () => {
    fetchMock.mockResponseOnce('', { status: 500 });
    let resolveRetry: (value: string) => void = () => undefined;
    fetchMock.mockResponseOnce(
      () =>
        new Promise<string>((resolve) => {
          resolveRetry = resolve;
        }),
    );
    const user = userEvent.setup();
    renderInstagramSettings();

    expect(
      await screen.findByText('Could not load Instagram connection status.'),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Connect Instagram' }),
    ).not.toBeInTheDocument();
    expect(mockEnqueueErrorSnackBar).not.toHaveBeenCalled();
    const retry = screen.getByRole('button', { name: 'Try again' });
    await user.click(retry);
    expect(retry).toBeInTheDocument();
    expect(retry).toBeDisabled();
    await act(async () => {
      resolveRetry(
        JSON.stringify({
          id: 'binding-id',
          username: 'myah_test_account',
          status: 'ACTIVE',
          lastCheckedAt: null,
          lastError: null,
        }),
      );
    });
    expect(await screen.findByText('@myah_test_account')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Disconnect Instagram' }),
    ).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('explains forbidden access without offering any connection action', async () => {
    fetchMock.mockResponseOnce('', { status: 403 });
    renderInstagramSettings();

    expect(
      await screen.findByText(
        'You do not have permission to manage Instagram.',
      ),
    ).toBeVisible();
    for (const name of [
      'Connect Instagram',
      'Reconnect Instagram',
      'Disconnect Instagram',
    ]) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
    expect(screen.getByRole('status')).toHaveTextContent(
      'You do not have permission to manage Instagram.',
    );
  });

  it('updates the error explanation when a permission retry fails for another reason', async () => {
    fetchMock.mockResponseOnce('', { status: 403 });
    fetchMock.mockResponseOnce('', { status: 500 });
    const user = userEvent.setup();
    renderInstagramSettings();

    expect(
      await screen.findByText(
        'You do not have permission to manage Instagram.',
      ),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByText('Could not load Instagram connection status.'),
    ).toBeVisible();
    expect(screen.getByRole('status')).not.toHaveTextContent(
      'You do not have permission to manage Instagram.',
    );
  });

  it.each(['not-json', '{}'])(
    'shows an inline error for a malformed account response: %s',
    async (body) => {
      fetchMock.mockResponseOnce(body);
      renderInstagramSettings();

      expect(
        await screen.findByText('Could not load Instagram connection status.'),
      ).toBeVisible();
      expect(
        screen.queryByRole('button', { name: 'Connect Instagram' }),
      ).not.toBeInTheDocument();
      expect(mockEnqueueErrorSnackBar).not.toHaveBeenCalled();
    },
  );
});
