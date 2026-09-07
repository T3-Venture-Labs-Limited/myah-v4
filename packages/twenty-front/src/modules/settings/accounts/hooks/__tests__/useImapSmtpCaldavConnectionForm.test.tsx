import { act, renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';

import { EmailConnectionSecurity } from '~/generated-metadata/graphql';
import { SettingsPath } from 'twenty-shared/types';
import { useImapSmtpCaldavConnectionForm } from '@/settings/accounts/hooks/useImapSmtpCaldavConnectionForm';

const mockSaveConnection = jest.fn();
const mockNavigateApp = jest.fn();
const mockNavigateSettings = jest.fn();
const mockEnqueueErrorSnackBar = jest.fn();
const mockEnqueueSuccessSnackBar = jest.fn();

jest.mock('@apollo/client/react', () => ({
  useMutation: () => [mockSaveConnection, { loading: false }],
}));

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigateApp,
}));

jest.mock('~/hooks/useNavigateSettings', () => ({
  useNavigateSettings: () => mockNavigateSettings,
}));

jest.mock(
  '@/settings/accounts/hooks/useConnectedImapSmtpCaldavAccount',
  () => ({
    useConnectedImapSmtpCaldavAccount: () => ({
      connectedAccount: undefined,
      loading: false,
    }),
  }),
);

jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: () => ({
    enqueueErrorSnackBar: mockEnqueueErrorSnackBar,
    enqueueSuccessSnackBar: mockEnqueueSuccessSnackBar,
  }),
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>{children}</MemoryRouter>
);

const formData = {
  handle: 'mailbox@example.com',
  IMAP: {
    host: 'imap.example.com',
    port: 993,
    password: 'secret',
    connectionSecurity: EmailConnectionSecurity.SSL_TLS,
  },
};

describe('useImapSmtpCaldavConnectionForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSaveConnection.mockResolvedValue({
      data: {
        saveImapSmtpCaldavAccount: {
          connectedAccountId: '0560dffc-4a79-4c13-9a11-df2745eab756',
        },
      },
    });
  });

  it('returns to the supplied path with the exact created connected account id', async () => {
    const { result } = renderHook(
      () =>
        useImapSmtpCaldavConnectionForm({
          returnTo:
            '/object/campaign/campaign-1?linkConnectedAccount=1#operations',
        }),
      { wrapper },
    );

    await act(async () => {
      await result.current.handleSave(formData);
    });

    expect(mockNavigateApp).toHaveBeenCalledWith(
      '/object/campaign/campaign-1?linkConnectedAccount=1&connectedAccountId=0560dffc-4a79-4c13-9a11-df2745eab756#operations',
    );
  });

  it('keeps Settings navigation when no return path is supplied', async () => {
    const { result } = renderHook(() => useImapSmtpCaldavConnectionForm(), {
      wrapper,
    });

    await act(async () => {
      await result.current.handleSave(formData);
    });

    expect(mockNavigateSettings).toHaveBeenCalledWith(
      SettingsPath.AccountsConfiguration,
      { connectedAccountId: '0560dffc-4a79-4c13-9a11-df2745eab756' },
    );
    expect(mockNavigateApp).not.toHaveBeenCalled();
  });
});
