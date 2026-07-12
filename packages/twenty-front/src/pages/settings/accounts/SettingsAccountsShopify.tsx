import { getTokenPair } from '@/apollo/utils/getTokenPair';
import { SettingsPageContainer } from '@/settings/components/SettingsPageContainer';
import { SettingsPageLayout } from '@/settings/components/layout/SettingsPageLayout';
import { SettingsTextInput } from '@/ui/input/components/SettingsTextInput';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { useEffect, useState } from 'react';
import { SettingsPath } from 'twenty-shared/types';
import { getSettingsPath } from 'twenty-shared/utils';
import {
  IconExternalLink,
  IconRefresh,
  IconTags,
  IconTrash,
} from 'twenty-ui/icon';
import { Button } from 'twenty-ui/input';
import { Section } from 'twenty-ui/layout';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { H2Title } from 'twenty-ui/typography';
import { REACT_APP_SERVER_BASE_URL } from '~/config';

type ShopifyOAuthStartResponse = {
  authorizationUrl: string;
};

type ShopifyConnectionStatus = {
  connected: boolean;
  shopDomain?: string;
  shopName?: string;
  scopes?: string[];
};

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

const StyledStatusPill = styled.div<{ isConnected: boolean }>`
  background: ${({ isConnected }) =>
    isConnected
      ? themeCssVariables.color.green3
      : themeCssVariables.background.transparent.light};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.pill};
  color: ${({ isConnected }) =>
    isConnected
      ? themeCssVariables.color.green9
      : themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
`;

const StyledScopes = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledScope = styled.div`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.pill};
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
`;

const StyledActions = styled.div`
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
`;

const getAccessToken = () =>
  getTokenPair()?.accessOrWorkspaceAgnosticToken?.token;

export const SettingsAccountsShopify = () => {
  const { t } = useLingui();
  const { enqueueErrorSnackBar } = useSnackBar();
  const [shop, setShop] = useState('');
  const [status, setStatus] = useState<ShopifyConnectionStatus>({
    connected: false,
  });
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadStatus = async () => {
    const token = getAccessToken();

    if (!token) {
      return;
    }

    setIsRefreshing(true);

    try {
      const response = await fetch(
        `${REACT_APP_SERVER_BASE_URL}/rest/myah/shopify/status`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (!response.ok) {
        throw new Error('Shopify status request failed.');
      }

      setStatus((await response.json()) as ShopifyConnectionStatus);
    } catch {
      enqueueErrorSnackBar({
        message: t`Could not load Shopify connection status.`,
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnectShopify = async () => {
    const token = getAccessToken();

    if (!token) {
      enqueueErrorSnackBar({ message: t`You need to sign in again first.` });
      return;
    }

    const shopToConnect = shop || status.shopDomain;

    if (!shopToConnect) {
      enqueueErrorSnackBar({ message: t`Enter a Shopify store domain first.` });
      return;
    }

    setIsConnecting(true);

    try {
      const response = await fetch(
        `${REACT_APP_SERVER_BASE_URL}/rest/myah/shopify/oauth/start`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ shop: shopToConnect }),
        },
      );

      if (!response.ok) {
        throw new Error('Shopify OAuth start request failed.');
      }

      const body = (await response.json()) as ShopifyOAuthStartResponse;

      window.location.assign(body.authorizationUrl);
    } catch {
      enqueueErrorSnackBar({
        message: t`Could not start Shopify OAuth. Check the shop domain and server configuration.`,
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnectShopify = async () => {
    const token = getAccessToken();

    if (!token) {
      enqueueErrorSnackBar({ message: t`You need to sign in again first.` });
      return;
    }

    setIsDisconnecting(true);

    try {
      const response = await fetch(
        `${REACT_APP_SERVER_BASE_URL}/rest/myah/shopify/disconnect`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (!response.ok) {
        throw new Error('Shopify disconnect request failed.');
      }

      setStatus((await response.json()) as ShopifyConnectionStatus);
    } catch {
      enqueueErrorSnackBar({
        message: t`Could not disconnect Shopify.`,
      });
    } finally {
      setIsDisconnecting(false);
    }
  };

  return (
    <SettingsPageLayout
      title={t`Shopify`}
      links={[
        {
          children: t`User`,
          href: getSettingsPath(SettingsPath.ProfilePage),
        },
        {
          children: t`Accounts`,
          href: getSettingsPath(SettingsPath.Accounts),
        },
        { children: t`Shopify` },
      ]}
    >
      <SettingsPageContainer>
        <Section>
          <H2Title
            title={t`Shopify`}
            description={t`Connect a Shopify store so Myah can read brand and product context.`}
          />
          <StyledConnectionCard>
            <StyledCardHeader>
              <StyledIconContainer>
                <IconTags size={18} />
              </StyledIconContainer>
              <div>
                <StyledTitle>{t`First-party Shopify app`}</StyledTitle>
                <StyledDescription>
                  {t`Use our own Shopify app for OAuth first. We can fall back to Composio if the first-party flow blocks the spike.`}
                </StyledDescription>
              </div>
              <StyledStatusPill isConnected={status.connected}>
                {status.connected ? t`Connected` : t`Not connected`}
              </StyledStatusPill>
            </StyledCardHeader>

            {status.connected ? (
              <StyledDescription>
                {status.shopName ?? t`Shopify store`} · {status.shopDomain}
              </StyledDescription>
            ) : (
              <SettingsTextInput
                instanceId="shopify-shop-domain"
                autoComplete="off"
                value={shop}
                onChange={setShop}
                fullWidth
                placeholder="my-store or my-store.myshopify.com"
              />
            )}

            {status.scopes && status.scopes.length > 0 && (
              <StyledScopes>
                {status.scopes.map((scope) => (
                  <StyledScope key={scope}>{scope}</StyledScope>
                ))}
              </StyledScopes>
            )}

            <StyledActions>
              <Button
                Icon={IconExternalLink}
                title={
                  status.connected ? t`Reconnect Shopify` : t`Connect Shopify`
                }
                variant={status.connected ? 'secondary' : 'primary'}
                accent="blue"
                isLoading={isConnecting}
                onClick={handleConnectShopify}
              />
              {status.connected && (
                <Button
                  Icon={IconTrash}
                  title={t`Disconnect Shopify`}
                  variant="secondary"
                  isLoading={isDisconnecting}
                  onClick={handleDisconnectShopify}
                />
              )}
              <Button
                Icon={IconRefresh}
                title={t`Check connection`}
                variant="secondary"
                isLoading={isRefreshing}
                onClick={loadStatus}
              />
            </StyledActions>
          </StyledConnectionCard>
        </Section>
      </SettingsPageContainer>
    </SettingsPageLayout>
  );
};
