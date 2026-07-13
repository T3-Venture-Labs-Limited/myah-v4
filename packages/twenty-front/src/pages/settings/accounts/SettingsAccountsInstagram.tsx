import { getTokenPair } from '@/apollo/utils/getTokenPair';
import { SettingsPageContainer } from '@/settings/components/SettingsPageContainer';
import { SettingsPageLayout } from '@/settings/components/layout/SettingsPageLayout';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
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
    connected
      ? themeCssVariables.color.green
      : themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
`;

const StyledAccountList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  width: 100%;
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

type OAuthLinkResponse = {
  redirectUrl: string;
};

type InstagramAccount = {
  connectedAccountId: string;
  status: string;
  composioUserId?: string;
  authConfigId?: string;
  toolkitSlug: string;
  createdAt?: string;
  updatedAt?: string;
};

type InstagramAccountsResponse = {
  accounts: InstagramAccount[];
};

const getAccessToken = () =>
  getTokenPair()?.accessOrWorkspaceAgnosticToken?.token;

export const SettingsAccountsInstagram = () => {
  const { t } = useLingui();
  const { enqueueErrorSnackBar, enqueueSuccessSnackBar } = useSnackBar();
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(true);
  const [accounts, setAccounts] = useState<InstagramAccount[]>([]);

  const loadAccounts = async () => {
    const token = getAccessToken();

    if (!token) {
      setIsLoadingAccounts(false);
      return;
    }

    setIsLoadingAccounts(true);

    try {
      const response = await fetch(
        `${REACT_APP_SERVER_BASE_URL}/rest/myah/instagram/accounts`,
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

      const body = (await response.json()) as InstagramAccountsResponse;

      setAccounts(body.accounts ?? []);
    } catch {
      enqueueErrorSnackBar({
        message: t`Could not load Instagram connection status.`,
      });
    } finally {
      setIsLoadingAccounts(false);
    }
  };

  useEffect(() => {
    void loadAccounts();
    // loadAccounts depends on snackbar callbacks; run once on page entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnectInstagram = async () => {
    const token = getAccessToken();

    if (!token) {
      enqueueErrorSnackBar({ message: t`You need to sign in again first.` });
      return;
    }

    setIsConnecting(true);

    try {
      const response = await fetch(
        `${REACT_APP_SERVER_BASE_URL}/rest/myah/instagram/oauth-link`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        throw new Error('Instagram OAuth link request failed.');
      }

      const body = (await response.json()) as OAuthLinkResponse;

      window.open(body.redirectUrl, '_blank', 'noopener,noreferrer');
      enqueueSuccessSnackBar({
        message: t`Instagram authorization opened in a new tab.`,
      });
    } catch {
      enqueueErrorSnackBar({
        message: t`Could not start Instagram authorization. Check the server Instagram configuration.`,
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const isConnected = accounts.some((account) => account.status === 'ACTIVE');

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
            description={t`Connect a workspace Instagram Business or Creator account for approved message reads and replies.`}
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
                    {t`Team members and future agents will use this workspace connection without authorizing their own Instagram account.`}
                  </StyledDescription>
                </div>
              </StyledTitleRow>
              <StyledStatusPill connected={isConnected}>
                {isLoadingAccounts
                  ? t`Checking status`
                  : isConnected
                    ? t`Connected`
                    : t`Not connected`}
              </StyledStatusPill>
            </StyledCardHeader>
            <StyledDescription>
              {t`This connection supports manual reads of existing Instagram conversations. Reply delivery requires a server-owned, user-approved action and the Send Instagram Reply role permission. It does not enable polling, cold first-contact DMs, bulk messaging, or auto-replies.`}
            </StyledDescription>
            {accounts.length > 0 && (
              <StyledAccountList>
                {accounts.map((account) => (
                  <StyledAccountRow key={account.connectedAccountId}>
                    <StyledTitle>{t`Workspace Instagram account`}</StyledTitle>
                    <StyledDescription>
                      {t`Status`}: {account.status}
                    </StyledDescription>
                    {account.updatedAt && (
                      <StyledDescription>
                        {t`Last checked`}: {account.updatedAt}
                      </StyledDescription>
                    )}
                  </StyledAccountRow>
                ))}
              </StyledAccountList>
            )}
            <Button
              Icon={IconExternalLink}
              title={
                isConnected ? t`Reconnect Instagram` : t`Connect Instagram`
              }
              variant="primary"
              accent="brand"
              isLoading={isConnecting}
              onClick={handleConnectInstagram}
            />
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
