import { fireEvent, render, screen } from '@testing-library/react';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';

import { EmailAccountConnectionCards } from '@/settings/accounts/components/EmailAccountConnectionCards';

i18n.load('en', {});
i18n.activate('en');

const mockTriggerApisOAuth = jest.fn();

jest.mock('@/settings/components/SettingsCard', () => ({
  SettingsCard: ({
    onClick,
    title,
  }: {
    onClick?: () => void;
    title: string;
  }) => (
    <button onClick={onClick} type="button">
      {title}
    </button>
  ),
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

  it('uses the supplied return path for OAuth providers and IMAP/SMTP', () => {
    const onImapSmtpConnect = jest.fn();

    render(
      <I18nProvider i18n={i18n}>
        <EmailAccountConnectionCards
          onImapSmtpConnect={onImapSmtpConnect}
          returnTo="/object/campaign/campaign-1?linkConnectedAccount=1#operations"
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByText('Connect with Google'));
    fireEvent.click(screen.getByText('Connect with Microsoft'));
    fireEvent.click(screen.getByText('Connect via IMAP/SMTP'));

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
});
