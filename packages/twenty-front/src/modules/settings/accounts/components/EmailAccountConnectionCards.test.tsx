import { fireEvent, render, screen } from '@testing-library/react';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from 'twenty-ui/theme-constants';

import { EmailAccountConnectionCards } from '@/settings/accounts/components/EmailAccountConnectionCards';

i18n.load('en', {});
i18n.activate('en');

const mockTriggerApisOAuth = jest.fn();

jest.mock('@/settings/components/SettingsCard', () => ({
  SettingsCard: ({ title }: { title: string }) => <div>{title}</div>,
}));

jest.mock('@/settings/accounts/hooks/useTriggerApiOAuth', () => ({
  useTriggerApisOAuth: () => ({ triggerApisOAuth: mockTriggerApisOAuth }),
}));

jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: () => true,
}));

jest.mock('twenty-ui/icon', () => ({
  IconAt: () => null,
  IconGoogle: () => null,
  IconMicrosoft: () => null,
}));

describe('EmailAccountConnectionCards', () => {
  beforeEach(() => jest.clearAllMocks());

  const renderCards = ({
    onImapSmtpConnect,
    returnTo,
  }: {
    onImapSmtpConnect?: (returnTo?: string) => void;
    returnTo?: string;
  } = {}) =>
    render(
      <MemoryRouter>
        <I18nProvider i18n={i18n}>
          <ThemeProvider applyToRoot={false} colorScheme="light">
            <EmailAccountConnectionCards
              onImapSmtpConnect={onImapSmtpConnect}
              returnTo={returnTo}
            />
          </ThemeProvider>
        </I18nProvider>
      </MemoryRouter>,
    );

  it('uses the supplied return path for keyboard-accessible OAuth providers and IMAP/SMTP', async () => {
    const onImapSmtpConnect = jest.fn();

    renderCards({
      onImapSmtpConnect,
      returnTo: '/object/campaign/campaign-1?linkConnectedAccount=1#operations',
    });

    const googleButton = screen.getByRole('button', {
      name: 'Connect with Google',
    });
    const microsoftButton = screen.getByRole('button', {
      name: 'Connect with Microsoft',
    });
    const imapButton = screen.getByRole('button', {
      name: 'Connect via IMAP/SMTP',
    });

    const user = userEvent.setup();

    googleButton.focus();
    await user.keyboard('{Enter}');
    await user.click(microsoftButton);
    await user.click(imapButton);

    expect(mockTriggerApisOAuth).toHaveBeenNthCalledWith(1, 'google', {
      redirectLocation:
        '/object/campaign/campaign-1?linkConnectedAccount=1#operations',
    });
    expect(mockTriggerApisOAuth).toHaveBeenNthCalledWith(2, 'microsoft', {
      redirectLocation:
        '/object/campaign/campaign-1?linkConnectedAccount=1#operations',
    });
    expect(onImapSmtpConnect).toHaveBeenCalledWith(
      '/object/campaign/campaign-1?linkConnectedAccount=1#operations',
    );
  });

  it('preserves Settings account navigation without campaign return props', () => {
    renderCards();

    fireEvent.click(
      screen.getByRole('button', { name: 'Connect with Google' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Connect with Microsoft' }),
    );

    expect(mockTriggerApisOAuth).toHaveBeenNthCalledWith(1, 'google', {
      redirectLocation: undefined,
    });
    expect(mockTriggerApisOAuth).toHaveBeenNthCalledWith(2, 'microsoft', {
      redirectLocation: undefined,
    });
    expect(
      screen.getByRole('link', { name: 'Connect via IMAP/SMTP' }),
    ).toHaveAttribute(
      'href',
      '/settings/accounts/new-imap-smtp-caldav-connection',
    );
  });
});
