import { getTokenPair } from '@/apollo/utils/getTokenPair';
import { SettingsPageContainer } from '@/settings/components/SettingsPageContainer';
import { SettingsPageLayout } from '@/settings/components/layout/SettingsPageLayout';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { navigateToHostedAuth } from '~/pages/settings/accounts/utils/navigateToHostedAuth';
import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { useEffect, useState } from 'react';
import { SettingsPath } from 'twenty-shared/types';
import { getSettingsPath } from 'twenty-shared/utils';
import { IconExternalLink, IconMessage, IconRefresh } from 'twenty-ui/icon';
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
  width: 100%;
`;

const StyledTitleRow = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[3]};
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
`;

const StyledDescription = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  line-height: 1.5;
`;

const StyledStatusPill = styled.div<{ connected: boolean }>`
  background: ${({ connected }) =>
    connected
      ? themeCssVariables.color.green10
      : themeCssVariables.background.tertiary};
  border-radius: ${themeCssVariables.border.radius.pill};
  color: ${({ connected }) =>
    connected ? 'white' : themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
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
};

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
  const [account, setAccount] = useState<InstagramAccount | null>(null);
  const isDisconnectPending = account?.status === 'DELETE_UNKNOWN';
  const hostedAuthReturn = new URLSearchParams(window.location.search);
  const attemptId = hostedAuthReturn.get('attemptId');
  const didHostedAuthFail = hostedAuthReturn.get('connection') === 'failed';

  const loadAccounts = async () => {
    const token = getAccessToken();

    if (!token) {
      setIsLoadingAccounts(false);
      return;
    }

    setIsLoadingAccounts(true);

    try {
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
        throw new Error('Instagram account status request failed.');
      }

      const body = await response.text();
      setAccount(
        body === '' ? null : (JSON.parse(body) as InstagramAccount | null),
      );
    } catch {
      enqueueErrorSnackBar({
        message: t`Could not load Instagram connection status.`,
      });
    } finally {
      setIsLoadingAccounts(false);
    }
  };

  useEffect(() => {
    if (!attemptId || didHostedAuthFail) {
      void loadAccounts();
    }
    // loadAccounts depends on snackbar callbacks; run once on page entry.
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
        await loadAccounts();
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
          await loadAccounts();
          return;
        }

        if (status === 'FAILED') {
          stopPolling();
          showPollingError();
          await loadAccounts();
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
    // loadAccounts depends on snackbar callbacks; run once per authorization attempt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId, didHostedAuthFail]);

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
        await loadAccounts();
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
        await loadAccounts();
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

  const isActive = account?.status === 'ACTIVE';
  const statusLabel = isLoadingAccounts
    ? t`Checking status`
    : account === null
      ? t`Not connected`
      : account.status === 'ACTIVE'
        ? t`Active`
        : account.status === 'INACTIVE'
          ? t`Inactive`
          : account.status === 'DELETE_UNKNOWN'
            ? t`Disconnect pending`
            : account.status === 'NEEDS_RECONNECT'
              ? t`Needs reconnect`
              : account.status === 'CONNECTING'
                ? t`Connecting`
                : account.status === 'ERROR'
                  ? t`Error`
                  : t`Connection unavailable`;

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
              <StyledStatusPill connected={isActive}>
                {statusLabel}
              </StyledStatusPill>
            </StyledCardHeader>
            <StyledDescription>
              {t`Read your existing Instagram conversations and reply when you're ready. Myah will always ask for your approval before sending a reply.`}
            </StyledDescription>
            {account && (
              <StyledAccountRow>
                <StyledTitle>
                  {account.username
                    ? `@${account.username}`
                    : t`Workspace Instagram account`}
                </StyledTitle>
                <StyledDescription>
                  {t`Status`}: {statusLabel}
                </StyledDescription>
                {account.lastCheckedAt && (
                  <StyledDescription>
                    {t`Last checked`}: {account.lastCheckedAt}
                  </StyledDescription>
                )}
              </StyledAccountRow>
            )}
            {account === null || account.status === 'INACTIVE' ? (
              <Button
                Icon={IconExternalLink}
                title={t`Connect Instagram`}
                variant="primary"
                accent="brand"
                disabled={isLoadingAccounts}
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
                disabled={isDisconnectPending}
                isLoading={isConnecting}
                onClick={handleDisconnectInstagram}
              />
            )}
            <Button
              Icon={IconRefresh}
              title={t`Refresh status`}
              variant="secondary"
              onClick={loadAccounts}
            />
          </StyledConnectionCard>
        </Section>
      </SettingsPageContainer>
    </SettingsPageLayout>
  );
};
