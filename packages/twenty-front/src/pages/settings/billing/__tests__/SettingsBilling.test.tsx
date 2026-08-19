import { GET_MANAGED_EMAIL_SUBSCRIPTIONS } from '@/settings/workspace/graphql/managed-email/managedEmailQueries';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { type MockedResponse } from '@apollo/client/testing';
import { MockedProvider } from '@apollo/client/testing/react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';
import { type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { SettingsPath } from 'twenty-shared/types';
import { SOURCE_LOCALE } from 'twenty-shared/translations';
import { ThemeProvider } from 'twenty-ui/theme-constants';
import { messages } from '~/locales/generated/en';
import { SettingsBilling } from '~/pages/settings/billing/SettingsBilling';

const mockNavigateSettings = jest.fn();

jest.mock('~/hooks/useNavigateSettings', () => ({
  useNavigateSettings: () => mockNavigateSettings,
}));

jest.mock('@/settings/components/layout/SettingsPageLayout', () => ({
  SettingsPageLayout: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('@/settings/components/SettingsPageContainer', () => ({
  SettingsPageContainer: ({ children }: { children: ReactNode }) => children,
}));

i18n.load({ [SOURCE_LOCALE]: messages });
i18n.activate(SOURCE_LOCALE);

const subscriptionMock: MockedResponse = {
  request: { query: GET_MANAGED_EMAIL_SUBSCRIPTIONS },
  result: {
    data: {
      managedEmailSubscriptions: [
        {
          action: 'STOP_SERVICE',
          billingInterval: 'MONTHLY',
          currency: 'USD',
          paidThrough: '2026-09-06T12:00:00.000Z',
          productKey: 'managed_mailbox_month',
          quantity: 2,
          recurringAmountCents: 1_300,
          resourceIds: ['mailbox-1', 'mailbox-2'],
          resourceLabels: [
            'maya@creator-partners.test',
            'lin@creator-partners.test',
          ],
          resourceType: 'MAILBOX',
          service: 'MANAGED_EMAIL',
          status: 'ACTIVE',
          unitPriceCents: 650,
        },
      ],
    },
  },
};

const renderPage = () =>
  render(
    <MockedProvider mocks={[subscriptionMock]}>
      <JotaiProvider>
        <I18nProvider i18n={i18n}>
          <ThemeProvider colorScheme="light">
            <MemoryRouter
              future={{
                v7_relativeSplatPath: true,
                v7_startTransition: true,
              }}
            >
              <SettingsBilling />
            </MemoryRouter>
          </ThemeProvider>
        </I18nProvider>
      </JotaiProvider>
    </MockedProvider>,
  );

describe('SettingsBilling managed email subscriptions', () => {
  beforeEach(() => {
    mockNavigateSettings.mockReset();
  });

  it('loads managed email independently and links to its existing controls', async () => {
    renderPage();

    expect(await screen.findByText('Mailbox')).toBeInTheDocument();
    expect(screen.getByText('$6.50')).toBeInTheDocument();
    expect(screen.getByText('$13.00')).toBeInTheDocument();
    expect(
      screen.getByText(
        'AI usage and balance are tracked separately from managed email.',
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Manage' }));

    expect(mockNavigateSettings).toHaveBeenCalledWith(
      SettingsPath.WorkspaceEmail,
    );
  });
});
