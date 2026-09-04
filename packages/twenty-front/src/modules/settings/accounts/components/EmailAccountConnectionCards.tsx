import { isGoogleCalendarEnabledState } from '@/client-config/states/isGoogleCalendarEnabledState';
import { isGoogleMessagingEnabledState } from '@/client-config/states/isGoogleMessagingEnabledState';
import { isImapSmtpCaldavEnabledState } from '@/client-config/states/isImapSmtpCaldavEnabledState';
import { isMicrosoftCalendarEnabledState } from '@/client-config/states/isMicrosoftCalendarEnabledState';
import { isMicrosoftMessagingEnabledState } from '@/client-config/states/isMicrosoftMessagingEnabledState';
import { useTriggerApisOAuth } from '@/settings/accounts/hooks/useTriggerApiOAuth';
import { SettingsCard } from '@/settings/components/SettingsCard';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { useContext } from 'react';
import { ConnectedAccountProvider, SettingsPath } from 'twenty-shared/types';
import { getSettingsPath } from 'twenty-shared/utils';
import { IconAt, IconGoogle, IconMicrosoft } from 'twenty-ui/icon';
import { UndecoratedLink } from 'twenty-ui/navigation';
import { ThemeContext, themeCssVariables } from 'twenty-ui/theme-constants';

const StyledCardsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledCardButton = styled.button`
  background: transparent;
  border: 0;
  color: inherit;
  cursor: pointer;
  display: block;
  padding: 0;
  text-align: left;
  width: 100%;
`;

type EmailAccountConnectionCardsProps = {
  returnTo?: string;
  onImapSmtpConnect?: (returnTo?: string) => void;
};

export const EmailAccountConnectionCards = ({
  returnTo,
  onImapSmtpConnect,
}: EmailAccountConnectionCardsProps) => {
  const { theme } = useContext(ThemeContext);
  const { triggerApisOAuth } = useTriggerApisOAuth();
  const { t } = useLingui();
  const isGoogleMessagingEnabled = useAtomStateValue(
    isGoogleMessagingEnabledState,
  );
  const isMicrosoftMessagingEnabled = useAtomStateValue(
    isMicrosoftMessagingEnabledState,
  );
  const isGoogleCalendarEnabled = useAtomStateValue(
    isGoogleCalendarEnabledState,
  );
  const isMicrosoftCalendarEnabled = useAtomStateValue(
    isMicrosoftCalendarEnabledState,
  );
  const isImapSmtpCaldavEnabled = useAtomStateValue(
    isImapSmtpCaldavEnabledState,
  );
  const imapSmtpPath = getSettingsPath(
    SettingsPath.NewImapSmtpCaldavConnection,
    undefined,
    returnTo ? { returnTo } : undefined,
  );

  return (
    <StyledCardsContainer>
      {(isGoogleMessagingEnabled || isGoogleCalendarEnabled) && (
        <StyledCardButton
          onClick={() =>
            triggerApisOAuth(ConnectedAccountProvider.GOOGLE, {
              redirectLocation: returnTo,
            })
          }
          type="button"
        >
          <SettingsCard
            Icon={<IconGoogle size={theme.icon.size.md} />}
            title={t`Connect with Google`}
          />
        </StyledCardButton>
      )}
      {(isMicrosoftMessagingEnabled || isMicrosoftCalendarEnabled) && (
        <StyledCardButton
          onClick={() =>
            triggerApisOAuth(ConnectedAccountProvider.MICROSOFT, {
              redirectLocation: returnTo,
            })
          }
          type="button"
        >
          <SettingsCard
            Icon={<IconMicrosoft size={theme.icon.size.md} />}
            title={t`Connect with Microsoft`}
          />
        </StyledCardButton>
      )}
      {isImapSmtpCaldavEnabled &&
        (onImapSmtpConnect ? (
          <StyledCardButton
            onClick={() => onImapSmtpConnect(returnTo)}
            type="button"
          >
            <SettingsCard
              Icon={<IconAt size={theme.icon.size.md} />}
              title={t`Connect via IMAP/SMTP`}
            />
          </StyledCardButton>
        ) : (
          <UndecoratedLink to={imapSmtpPath}>
            <SettingsCard
              Icon={<IconAt size={theme.icon.size.md} />}
              title={t`Connect via IMAP/SMTP`}
            />
          </UndecoratedLink>
        ))}
    </StyledCardsContainer>
  );
};
