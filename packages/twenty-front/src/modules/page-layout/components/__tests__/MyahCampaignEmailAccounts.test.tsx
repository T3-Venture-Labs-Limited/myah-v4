import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { MyahCampaignEmailAccounts } from '@/page-layout/components/MyahCampaignEmailAccounts';

const mockUseQuery = jest.fn();
const mockUseMutation = jest.fn();
const mockNavigateSettings = jest.fn();
const mockEnqueueErrorSnackBar = jest.fn();
const mockEnqueueSuccessSnackBar = jest.fn();

jest.mock('@apollo/client/react', () => ({
  useMutation: (...args: unknown[]) => mockUseMutation(...args),
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));

jest.mock(
  '@/object-record/record-field-list/record-detail-section/components/RecordDetailSectionContainer',
  () => ({
    RecordDetailSectionContainer: ({
      children,
      rightAdornment,
      title,
    }: {
      children: React.ReactNode;
      rightAdornment?: React.ReactNode;
      title: string;
    }) => (
      <section aria-label={title}>
        <h2>{title}</h2>
        {rightAdornment}
        {children}
      </section>
    ),
  }),
);

jest.mock('@/ui/layout/dropdown/components/Dropdown', () => ({
  Dropdown: ({
    clickableComponent,
    dropdownComponents,
  }: {
    clickableComponent: React.ReactNode;
    dropdownComponents: React.ReactNode;
  }) => (
    <>
      {clickableComponent}
      {dropdownComponents}
    </>
  ),
}));

jest.mock('@/ui/layout/modal/components/ModalStatefulWrapper', () => ({
  ModalStatefulWrapper: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

jest.mock('@/ui/layout/modal/hooks/useModal', () => ({
  useModal: () => ({ closeModal: jest.fn(), openModal: jest.fn() }),
}));

jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: () => ({
    enqueueErrorSnackBar: mockEnqueueErrorSnackBar,
    enqueueSuccessSnackBar: mockEnqueueSuccessSnackBar,
  }),
}));

jest.mock('~/hooks/useNavigateSettings', () => ({
  useNavigateSettings: () => mockNavigateSettings,
}));

jest.mock('twenty-ui/data-display', () => ({
  Chip: ({
    label,
    leftComponent,
    rightComponent,
  }: {
    label: string;
    leftComponent?: React.ReactNode;
    rightComponent?: React.ReactNode;
  }) => (
    <div>
      {leftComponent}
      {label}
      {rightComponent}
    </div>
  ),
  ChipVariant: { Static: 'static' },
}));

jest.mock('twenty-ui/icon', () => ({
  IconGoogle: () => <span>Google icon</span>,
  IconMail: () => <span>Mail icon</span>,
  IconMicrosoft: () => <span>Microsoft icon</span>,
  IconPlus: () => null,
  IconX: () => null,
}));

jest.mock('twenty-ui/input', () => ({
  Button: ({
    title,
    ariaLabel,
    onClick,
    disabled,
  }: {
    title: string;
    ariaLabel?: string;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {title}
    </button>
  ),
  LightIconButton: ({
    'aria-label': ariaLabel,
    onClick,
  }: {
    'aria-label': string;
    onClick?: () => void;
  }) => <button aria-label={ariaLabel} onClick={onClick} type="button" />,
}));

const linkedAccount = {
  id: 'campaign-account-1',
  connectedAccountId: 'connected-account-1',
  health: 'AVAILABLE',
  isDefault: true,
  label: 'Primary mailbox',
  messageChannelId: 'channel-1',
  provider: 'GOOGLE',
  senderEmail: 'sender@example.com',
};

const candidate = {
  ...linkedAccount,
  connectedAccountId: 'connected-account-2',
  id: 'candidate-1',
  isDefault: false,
  label: 'Team mailbox',
  senderEmail: 'team@example.com',
};

const renderWithAccounts = ({
  accounts = [linkedAccount],
  candidates = [candidate],
  remove = jest
    .fn()
    .mockResolvedValue({ data: { removeCampaignEmailAccount: [] } }),
}: {
  accounts?: (typeof linkedAccount)[];
  candidates?: (typeof candidate)[];
  remove?: jest.Mock;
} = {}) => {
  mockUseQuery
    .mockReturnValueOnce({
      data: { campaignEmailAccounts: accounts },
      loading: false,
    })
    .mockReturnValueOnce({
      data: { campaignEmailAccountCandidates: candidates },
      loading: false,
    });
  mockUseMutation
    .mockReturnValueOnce([jest.fn().mockResolvedValue({}), { loading: false }])
    .mockReturnValueOnce([jest.fn().mockResolvedValue({}), { loading: false }])
    .mockReturnValueOnce([remove, { loading: false }]);

  return render(<MyahCampaignEmailAccounts campaignId="campaign-1" />);
};

describe('MyahCampaignEmailAccounts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows linked accounts with their server-authoritative default and health', () => {
    renderWithAccounts({
      accounts: [{ ...linkedAccount, health: 'RECONNECT_REQUIRED' }],
    });

    expect(
      screen.getByText('Primary mailbox (sender@example.com)'),
    ).toBeVisible();
    expect(screen.getByText('Default')).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent('Reconnect');
  });

  it('warns that drafting is paused when the server reports no default', () => {
    renderWithAccounts({ accounts: [{ ...linkedAccount, isDefault: false }] });

    expect(screen.getByRole('alert')).toHaveTextContent('paused');
    expect(screen.queryByText('Default')).not.toBeInTheDocument();
  });

  it('links a selected candidate and exposes the existing account connection seam', async () => {
    const link = jest.fn().mockResolvedValue({
      data: { linkCampaignEmailAccount: [linkedAccount, candidate] },
    });
    mockUseQuery
      .mockReturnValueOnce({
        data: { campaignEmailAccounts: [linkedAccount] },
        loading: false,
      })
      .mockReturnValueOnce({
        data: { campaignEmailAccountCandidates: [candidate] },
        loading: false,
      });
    mockUseMutation
      .mockReturnValueOnce([link, { loading: false }])
      .mockReturnValueOnce([jest.fn(), { loading: false }])
      .mockReturnValueOnce([jest.fn(), { loading: false }]);

    render(<MyahCampaignEmailAccounts campaignId="campaign-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Add email account' }));
    fireEvent.click(screen.getByRole('button', { name: /Add Team mailbox/ }));

    await waitFor(() =>
      expect(link).toHaveBeenCalledWith({
        variables: {
          input: {
            campaignId: 'campaign-1',
            connectedAccountId: 'connected-account-2',
          },
        },
      }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Connect email account' }),
    );
    expect(mockNavigateSettings).toHaveBeenCalled();
  });

  it('confirms removal and retains rendered accounts when the mutation fails', async () => {
    const remove = jest.fn().mockRejectedValue(new Error('denied'));
    mockUseQuery.mockImplementation(
      (document: { definitions: { name?: { value?: string } }[] }) => {
        const operationName = document.definitions[0]?.name?.value;

        return operationName === 'CampaignEmailAccounts'
          ? { data: { campaignEmailAccounts: [linkedAccount] }, loading: false }
          : {
              data: { campaignEmailAccountCandidates: [candidate] },
              loading: false,
            };
      },
    );
    mockUseMutation.mockImplementation(
      (document: { definitions: { name?: { value?: string } }[] }) => [
        document.definitions[0]?.name?.value === 'RemoveCampaignEmailAccount'
          ? remove
          : jest.fn(),
        { loading: false },
      ],
    );

    render(<MyahCampaignEmailAccounts campaignId="campaign-1" />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Remove Primary mailbox' }),
    );
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      'Remove Primary mailbox',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Confirm removal' }));

    await waitFor(() => expect(mockEnqueueErrorSnackBar).toHaveBeenCalled());
    expect(
      screen.getByText('Primary mailbox (sender@example.com)'),
    ).toBeVisible();
  });
});
