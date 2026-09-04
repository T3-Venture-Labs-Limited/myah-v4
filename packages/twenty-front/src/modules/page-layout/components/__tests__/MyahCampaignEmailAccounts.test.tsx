import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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
    dropdownAriaLabel,
    dropdownComponents,
    dropdownRole,
  }: {
    clickableComponent: React.ReactNode;
    dropdownAriaLabel?: string;
    dropdownComponents: React.ReactNode;
    dropdownRole?: string;
  }) => (
    <>
      {clickableComponent}
      <div aria-label={dropdownAriaLabel} role={dropdownRole}>
        {dropdownComponents}
      </div>
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
    disabled,
  }: {
    'aria-label': string;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      type="button"
    />
  ),
}));

const linkedAccount = {
  id: 'campaign-account-1',
  connectedAccountId: 'connected-account-1',
  health: 'AVAILABLE' as const,
  isDefault: true,
  label: 'Primary mailbox',
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

const configureHooks = ({
  accountError,
  accountLoading = false,
  accounts = [linkedAccount],
  candidateError,
  candidateLoading = false,
  candidates = [candidate],
  link = jest.fn().mockResolvedValue({}),
  remove = jest.fn().mockResolvedValue({}),
  setDefault = jest.fn().mockResolvedValue({}),
}: {
  accountError?: Error;
  accountLoading?: boolean;
  accounts?: (typeof linkedAccount)[];
  candidateError?: Error;
  candidateLoading?: boolean;
  candidates?: (typeof candidate)[];
  link?: jest.Mock;
  remove?: jest.Mock;
  setDefault?: jest.Mock;
} = {}) => {
  const accountRefetch = jest.fn().mockResolvedValue({});
  const candidateRefetch = jest.fn().mockResolvedValue({});

  mockUseQuery.mockImplementation(
    (document: { definitions: { name?: { value?: string } }[] }) => {
      const operationName = document.definitions[0]?.name?.value;

      return operationName === 'CampaignEmailAccounts'
        ? {
            data: accountLoading
              ? undefined
              : { campaignEmailAccounts: accounts },
            error: accountError,
            loading: accountLoading,
            refetch: accountRefetch,
          }
        : {
            data: candidateLoading
              ? undefined
              : { campaignEmailAccountCandidates: candidates },
            error: candidateError,
            loading: candidateLoading,
            refetch: candidateRefetch,
          };
    },
  );
  mockUseMutation.mockImplementation(
    (document: { definitions: { name?: { value?: string } }[] }) => {
      const operationName = document.definitions[0]?.name?.value;

      if (operationName === 'LinkCampaignEmailAccount') {
        return [link, { loading: false }];
      }
      if (operationName === 'SetDefaultCampaignEmailAccount') {
        return [setDefault, { loading: false }];
      }

      return [remove, { loading: false }];
    },
  );

  return { accountRefetch, candidateRefetch };
};

const renderWithAccounts = (options = {}) => {
  const hooks = configureHooks(options);

  return {
    ...hooks,
    ...render(<MyahCampaignEmailAccounts campaignId="campaign-1" />),
  };
};

describe('MyahCampaignEmailAccounts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses sender addresses for compact account and action names', () => {
    renderWithAccounts({
      accounts: [linkedAccount, { ...candidate, id: 'campaign-account-2' }],
    });

    expect(screen.getByText('sender@example.com')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Make team@example.com default' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Remove sender@example.com' }),
    ).toBeEnabled();
  });

  it('announces account loading independently from candidate loading', () => {
    renderWithAccounts({ accountLoading: true, candidateLoading: true });

    expect(screen.getByText('Loading email accounts…')).toHaveAttribute(
      'aria-live',
      'polite',
    );
    expect(
      screen.getByText('Loading available email accounts…'),
    ).toHaveAttribute('aria-live', 'polite');
  });

  it('shows an empty linked-account state', () => {
    renderWithAccounts({ accounts: [], candidates: [] });

    expect(screen.getByText('No email accounts linked.')).toBeVisible();
  });

  it('warns that drafting is paused when the server reports no default', () => {
    renderWithAccounts({ accounts: [{ ...linkedAccount, isDefault: false }] });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Email drafting is paused',
    );
    expect(screen.queryByText('Default')).not.toBeInTheDocument();
  });

  it('renders candidate query failures independently from linked account results', () => {
    renderWithAccounts({ candidateError: new Error('candidate failed') });

    expect(screen.getByText('sender@example.com')).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Available email accounts could not be loaded.',
    );
  });

  it('disables unavailable candidates and uses one named dialog popup', () => {
    renderWithAccounts({
      candidates: [{ ...candidate, health: 'UNAVAILABLE' }],
    });

    expect(
      screen.getByRole('button', { name: 'Add team@example.com' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('dialog', { name: 'Email account candidates' }),
    ).toBeVisible();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens the existing account connection settings seam', () => {
    renderWithAccounts();

    fireEvent.click(
      screen.getByRole('button', { name: 'Connect email account' }),
    );

    expect(mockNavigateSettings).toHaveBeenCalled();
  });

  it('links candidates with the keyboard and refetches both account queries', async () => {
    const user = userEvent.setup();
    const link = jest.fn().mockResolvedValue({
      data: { linkCampaignEmailAccount: [linkedAccount, candidate] },
    });
    const { accountRefetch, candidateRefetch } = renderWithAccounts({ link });

    screen.getByRole('button', { name: 'Add team@example.com' }).focus();
    await user.keyboard('{Enter}');

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
    await waitFor(() => {
      expect(accountRefetch).toHaveBeenCalled();
      expect(candidateRefetch).toHaveBeenCalled();
    });
  });

  it('states only default removal pauses drafting and restores focus after cancellation', () => {
    renderWithAccounts({
      accounts: [
        linkedAccount,
        {
          ...linkedAccount,
          id: 'campaign-account-2',
          isDefault: false,
          senderEmail: 'team@example.com',
        },
      ],
    });

    const nonDefaultRemove = screen.getByRole('button', {
      name: 'Remove team@example.com',
    });
    fireEvent.click(nonDefaultRemove);
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      'Removing this email account does not change the default email account.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel removal' }));
    expect(nonDefaultRemove).toHaveFocus();

    fireEvent.click(
      screen.getByRole('button', { name: 'Remove sender@example.com' }),
    );
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      'Removing the default account pauses email drafting.',
    );
  });

  it('warns that an unhealthy default pauses drafting', () => {
    renderWithAccounts({
      accounts: [{ ...linkedAccount, health: 'RECONNECT_REQUIRED' }],
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Email drafting is paused',
    );
  });

  it('keeps linked accounts rendered when removal fails', async () => {
    const remove = jest.fn().mockRejectedValue(new Error('denied'));
    renderWithAccounts({ remove });

    fireEvent.click(
      screen.getByRole('button', { name: 'Remove sender@example.com' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Confirm removal' }));

    await waitFor(() => expect(mockEnqueueErrorSnackBar).toHaveBeenCalled());
    expect(screen.getByText('sender@example.com')).toBeVisible();
  });
});
