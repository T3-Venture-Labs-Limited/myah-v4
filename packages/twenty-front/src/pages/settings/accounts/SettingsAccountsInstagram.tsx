import { getTokenPair } from '@/apollo/utils/getTokenPair';
import { SettingsPageContainer } from '@/settings/components/SettingsPageContainer';
import { SettingsPageLayout } from '@/settings/components/layout/SettingsPageLayout';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { DateTimeDisplay } from '@/ui/field/display/components/DateTimeDisplay';
import { navigateToHostedAuth } from '~/pages/settings/accounts/utils/navigateToHostedAuth';
import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { useEffect, useState } from 'react';
import { SettingsPath } from 'twenty-shared/types';
import { getSettingsPath } from 'twenty-shared/utils';
import { IconExternalLink, IconMessage, IconRefresh } from 'twenty-ui/icon';
import { Status } from 'twenty-ui/data-display';
import { Button } from 'twenty-ui/input';
import { Section } from 'twenty-ui/layout';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { H2Title } from 'twenty-ui/typography';
import { REACT_APP_SERVER_BASE_URL } from '~/config';

const StyledConnectionCard = styled.div`
  align-items: flex-start;
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.md};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[4]};
  padding: ${themeCssVariables.spacing[4]};
`;

const StyledCardHeader = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[3]};
  justify-content: space-between;
  min-width: 0;
  width: 100%;
`;

const StyledTitleRow = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[3]};
  min-width: 0;
`;

const StyledIconContainer = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  display: flex;
  height: 32px;
  justify-content: center;
  width: 32px;
`;

const StyledTitle = styled.div`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.md};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  overflow-wrap: anywhere;
`;

const StyledDescription = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  line-height: 1.5;
  overflow-wrap: anywhere;
`;

const StyledAccountRow = styled.div`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  padding: ${themeCssVariables.spacing[3]};
`;

const StyledMetadataRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[1]};
  min-width: 0;
`;

type HostedAuthResponse = {
  attemptId: string;
  redirectUrl: string;
};

type HostedAuthAttemptStatusResponse = {
  status: string;
};

type InstagramAccount = {
  id: string;
  username: string | null;
  status: string;
  lastCheckedAt: string | null;
  lastError: string | null;
  lastSyncedAt?: string | null;
  lastMessageReceivedAt?: string | null;
};

const CONNECTING_REFRESH_WINDOW_MS = 6 * 60_000;

const getAccessToken = () =>
  getTokenPair()?.accessOrWorkspaceAgnosticToken?.token;

export const SettingsAccountsInstagram = () => {
  const { t } = useLingui();
  const {
    enqueueErrorSnackBar,
    enqueueSuccessSnackBar,
    enqueueWarningSnackBar,
  } = useSnackBar();
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(true);
  const [loadError, setLoadError] = useState<'forbidden' | 'failed' | null>(
    null,
  );
  const [account, setAccount] = useState<InstagramAccount | null>(null);
  const [connectingRefreshExpired, setConnectingRefreshExpired] =
    useState(false);
  const isDisconnectPending = account?.status === 'DELETE_UNKNOWN';
  const hostedAuthReturn = new URLSearchParams(window.location.search);
  const attemptId = hostedAuthReturn.get('attemptId');
  const didHostedAuthFail = hostedAuthReturn.get('connection') === 'failed';

  const loadAccount = async ({
    silent = false,
    isCurrent = () => true,
  }: { silent?: boolean; isCurrent?: () => boolean } = {}) => {
    const token = getAccessToken();

    if (!silent) {
      setIsLoadingAccounts(true);
    }

    let forbidden = false;
    try {
      if (!token) throw new Error('Missing session');

      const response = await fetch(
        `${REACT_APP_SERVER_BASE_URL}/rest/myah/unipile/instagram/account`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        forbidden = response.status === 403;
        throw new Error('Instagram account status request failed.');
      }

      const body = await response.text();
      const parsed: unknown = body === '' ? null : JSON.parse(body);
      if (
        parsed !== null &&
        (typeof parsed !== 'object' ||
          typeof (parsed as InstagramAccount).id !== 'string' ||
          typeof (parsed as InstagramAccount).status !== 'string')
      ) {
        throw new Error('Invalid Instagram account response');
      }
      if (isCurrent()) {
        setAccount(parsed as InstagramAccount | null);
        if (!silent) setLoadError(null);
      }
    } catch {
      if (!silent) setLoadError(forbidden ? 'forbidden' : 'failed');
    } finally {
      if (!silent) setIsLoadingAccounts(false);
    }
  };

  useEffect(() => {
    if (!attemptId || didHostedAuthFail) {
      void loadAccount();
    }
    // loadAccount is scoped to this page entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId, didHostedAuthFail]);

  useEffect(() => {
    if (!attemptId || didHostedAuthFail) {
      return;
    }

    let isCancelled = false;
    let isPolling = false;
    let attempts = 0;

    const stopPolling = () => clearInterval(interval);
    const showPollingError = () => {
      setIsLoadingAccounts(false);
      enqueueErrorSnackBar({
        message: t`Could not confirm Instagram authorization.`,
      });
    };

    const pollAttempt = async () => {
      if (isCancelled || isPolling) {
        return;
      }

      if (attempts >= 30) {
        stopPolling();
        showPollingError();
        await loadAccount();
        return;
      }

      const token = getAccessToken();

      if (!token) {
        stopPolling();
        showPollingError();
        return;
      }

      isPolling = true;
      attempts += 1;

      try {
        const response = await fetch(
          `${REACT_APP_SERVER_BASE_URL}/rest/myah/unipile/instagram/hosted-auth/${attemptId}/status`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${token}`,
              'content-type': 'application/json',
            },
          },
        );

        if (!response.ok) {
          if (!isCancelled) {
            stopPolling();
            showPollingError();
          }
          return;
        }

        const { status } =
          (await response.json()) as HostedAuthAttemptStatusResponse;

        if (isCancelled) {
          return;
        }

        if (status === 'COMPLETED') {
          stopPolling();
          await loadAccount();
          return;
        }

        if (status === 'FAILED') {
          stopPolling();
          showPollingError();
          await loadAccount();
          return;
        }

        if (status !== 'PENDING' && status !== 'PROCESSING') {
          stopPolling();
          showPollingError();
        }
      } catch {
        if (!isCancelled) {
          stopPolling();
          showPollingError();
        }
      } finally {
        isPolling = false;
      }
    };

    const interval = setInterval(() => void pollAttempt(), 1_000);
    void pollAttempt();

    return () => {
      isCancelled = true;
      stopPolling();
    };
    // loadAccount is scoped to this authorization attempt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId, didHostedAuthFail]);

  useEffect(() => {
    if (account?.status !== 'CONNECTING') return;

    setConnectingRefreshExpired(false);
    const startedAt = Date.now();
    let isPolling = false;
    let isCancelled = false;
    // ponytail: fixed 5-second reads; back off only if this shows up in load.
    const interval = setInterval(async () => {
      if (Date.now() - startedAt >= CONNECTING_REFRESH_WINDOW_MS) {
        clearInterval(interval);
        setConnectingRefreshExpired(true);
        return;
      }
      if (isPolling) return;
      isPolling = true;
      try {
        await loadAccount({ silent: true, isCurrent: () => !isCancelled });
      } finally {
        isPolling = false;
      }
    }, 5_000);

    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
    // Only restart the window if the account enters Connecting again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.status]);

  const handleHostedAuth = async (
    path: 'connect' | 'reconnect',
    errorMessage: string,
  ) => {
    if (isDisconnectPending) {
      return;
    }

    const token = getAccessToken();

    if (!token) {
      enqueueErrorSnackBar({ message: t`You need to sign in again first.` });
      return;
    }

    setIsConnecting(true);

    try {
      const response = await fetch(
        `${REACT_APP_SERVER_BASE_URL}/rest/myah/unipile/instagram/hosted-auth/${path}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        throw new Error('Instagram hosted authorization request failed.');
      }

      const body = (await response.json()) as HostedAuthResponse;

      navigateToHostedAuth(body.redirectUrl);
    } catch {
      enqueueErrorSnackBar({ message: errorMessage });
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnectInstagram = async () => {
    if (isDisconnectPending) {
      return;
    }

    if (!window.confirm(t`Disconnect this Instagram account?`)) {
      return;
    }

    const token = getAccessToken();

    if (!token) {
      enqueueErrorSnackBar({ message: t`You need to sign in again first.` });
      return;
    }

    setIsConnecting(true);

    try {
      const response = await fetch(
        `${REACT_APP_SERVER_BASE_URL}/rest/myah/unipile/instagram/disconnect`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        throw new Error('Instagram disconnect request failed.');
      }

      const { status } = (await response.json()) as { status: string };

      if (status === 'DISCONNECTED') {
        enqueueSuccessSnackBar({
          message: t`Instagram account disconnected.`,
        });
        await loadAccount();
        return;
      }

      if (status === 'PENDING_RECOVERY') {
        setAccount((currentAccount) =>
          currentAccount
            ? { ...currentAccount, status: 'DELETE_UNKNOWN' }
            : currentAccount,
        );
        enqueueWarningSnackBar({
          message: t`Instagram disconnect is still being confirmed.`,
        });
        await loadAccount();
        return;
      }

      enqueueErrorSnackBar({
        message: t`Could not disconnect the Instagram account.`,
      });
    } catch {
      enqueueErrorSnackBar({
        message: t`Could not disconnect the Instagram account.`,
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const statusPresentation = {
    LOADING: {
      label: t`Checking status`,
      color: 'gray',
      explanation: t`Checking your Instagram connection.`,
    },
    NOT_CONNECTED: {
      label: t`Not connected`,
      color: 'gray',
      explanation: t`Connect Instagram to start syncing conversations.`,
    },
    ACTIVE: {
      label: t`Active`,
      color: 'green',
      explanation: t`Instagram is connected and syncing.`,
    },
    CONNECTING: {
      label: t`Connecting`,
      color: 'turquoise',
      explanation: t`Instagram is finishing the connection.`,
      isLoaderVisible: true,
    },
    NEEDS_RECONNECT: {
      label: t`Needs reconnect`,
      color: 'orange',
      explanation: t`Instagram needs you to sign in again. Your login may have expired or access may have been removed.`,
    },
    ERROR: {
      label: t`Error`,
      color: 'red',
      explanation: t`Instagram stopped working for this account. Reconnect to try again.`,
    },
    DELETE_UNKNOWN: {
      label: t`Disconnect pending`,
      color: 'turquoise',
      explanation: t`Instagram is still confirming the disconnect.`,
      isLoaderVisible: true,
    },
    INACTIVE: {
      label: t`Inactive`,
      color: 'gray',
      explanation: t`Connect Instagram to start syncing conversations.`,
    },
    UNKNOWN: {
      label: t`Connection unavailable`,
      color: 'gray',
      explanation: t`Refresh status to check this connection.`,
    },
  } as const;
  const presentation =
    statusPresentation[
      (isLoadingAccounts
        ? 'LOADING'
        : loadError
          ? 'UNKNOWN'
          : (account?.status ??
            'NOT_CONNECTED')) as keyof typeof statusPresentation
    ] ?? statusPresentation.UNKNOWN;
  const statusLabel = presentation.label;

  return (
    <SettingsPageLayout
      title={t`Instagram`}
      links={[
        {
          children: t`User`,
          href: getSettingsPath(SettingsPath.ProfilePage),
        },
        {
          children: t`Accounts`,
          href: getSettingsPath(SettingsPath.Accounts),
        },
        { children: t`Instagram` },
      ]}
    >
      <SettingsPageContainer>
        <Section>
          <H2Title
            title={t`Instagram`}
            description={t`Connect your Instagram Business or Creator account to read conversations and reply with your approval.`}
          />
          <StyledConnectionCard>
            <StyledCardHeader>
              <StyledTitleRow>
                <StyledIconContainer>
                  <IconMessage size={18} />
                </StyledIconContainer>
                <div>
                  <StyledTitle>{t`Instagram messaging`}</StyledTitle>
                  <StyledDescription>
                    {t`Connect the Instagram account you use for your business. You can review conversations and approve each reply before it is sent.`}
                  </StyledDescription>
                </div>
              </StyledTitleRow>
            </StyledCardHeader>
            <div role="status">
              <Status
                color={presentation.color}
                text={statusLabel}
                isLoaderVisible={
                  'isLoaderVisible' in presentation &&
                  presentation.isLoaderVisible
                }
              />
              <StyledDescription>
                {loadError === 'forbidden'
                  ? t`You do not have permission to manage Instagram.`
                  : loadError === 'failed'
                    ? t`Could not load Instagram connection status.`
                    : presentation.explanation}
              </StyledDescription>
              {connectingRefreshExpired &&
                account?.status === 'CONNECTING' &&
                !loadError && (
                  <StyledDescription>
                    {t`Instagram is still finishing the connection. This can take a few minutes. Use Refresh status to check again.`}
                  </StyledDescription>
                )}
            </div>
            <StyledDescription>
              {t`Read your existing Instagram conversations and reply when you're ready. Myah will always ask for your approval before sending a reply.`}
            </StyledDescription>
            {account && !loadError && (
              <StyledAccountRow>
                <StyledTitle>
                  {account.username
                    ? `@${account.username}`
                    : t`Workspace Instagram account`}
                </StyledTitle>
                <StyledDescription>
                  {t`Status`}: {statusLabel}
                </StyledDescription>
                <StyledMetadataRow>
                  <StyledDescription>{t`Last synced`}</StyledDescription>
                  {account.lastSyncedAt ? (
                    <DateTimeDisplay value={account.lastSyncedAt} />
                  ) : (
                    <StyledDescription>{t`Not synced yet`}</StyledDescription>
                  )}
                </StyledMetadataRow>
                <StyledMetadataRow>
                  <StyledDescription>{t`Last message received`}</StyledDescription>
                  {account.lastMessageReceivedAt ? (
                    <DateTimeDisplay value={account.lastMessageReceivedAt} />
                  ) : (
                    <StyledDescription>{t`No messages received yet`}</StyledDescription>
                  )}
                </StyledMetadataRow>
                {account.lastCheckedAt && (
                  <StyledMetadataRow>
                    <StyledDescription>{t`Last checked`}</StyledDescription>
                    <DateTimeDisplay value={account.lastCheckedAt} />
                  </StyledMetadataRow>
                )}
              </StyledAccountRow>
            )}
            {loadError ? (
              <Button
                title={t`Try again`}
                variant="secondary"
                disabled={isLoadingAccounts}
                onClick={() => void loadAccount()}
              />
            ) : account === null || account.status === 'INACTIVE' ? (
              <Button
                Icon={IconExternalLink}
                title={t`Connect Instagram`}
                variant="primary"
                accent="brand"
                disabled={isLoadingAccounts || isConnecting}
                isLoading={isConnecting}
                onClick={() =>
                  void handleHostedAuth(
                    'connect',
                    t`Could not start Instagram authorization.`,
                  )
                }
              />
            ) : account.status === 'NEEDS_RECONNECT' ||
              account.status === 'ERROR' ? (
              <>
                <Button
                  Icon={IconExternalLink}
                  title={t`Reconnect Instagram`}
                  variant="primary"
                  accent="brand"
                  disabled={isConnecting}
                  isLoading={isConnecting}
                  onClick={() =>
                    void handleHostedAuth(
                      'reconnect',
                      t`Could not start Instagram authorization.`,
                    )
                  }
                />
                <Button
                  Icon={IconExternalLink}
                  title={t`Disconnect Instagram`}
                  variant="primary"
                  accent="brand"
                  disabled={isConnecting}
                  isLoading={isConnecting}
                  onClick={handleDisconnectInstagram}
                />
              </>
            ) : (
              <Button
                Icon={IconExternalLink}
                title={t`Disconnect Instagram`}
                variant="primary"
                accent="brand"
                disabled={isDisconnectPending || isConnecting}
                isLoading={isConnecting}
                onClick={handleDisconnectInstagram}
              />
            )}
            {!loadError && (
              <Button
                Icon={IconRefresh}
                title={t`Refresh status`}
                variant="secondary"
                onClick={() => void loadAccount()}
              />
            )}
          </StyledConnectionCard>
        </Section>
      </SettingsPageContainer>
    </SettingsPageLayout>
  );
};
