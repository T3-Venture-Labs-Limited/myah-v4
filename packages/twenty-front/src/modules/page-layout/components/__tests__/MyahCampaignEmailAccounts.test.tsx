import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import userEvent from '@testing-library/user-event';

import { MyahCampaignEmailAccounts } from '@/page-layout/components/MyahCampaignEmailAccounts';

jest.mock('@/page-layout/hooks/useCurrentPageLayoutOrThrow', () => ({
  useCurrentPageLayoutOrThrow: () => ({
    currentPageLayout: {
      tabs: [
        {
          id: 'runtime-operations-tab-id',
          universalIdentifier: 'a62c90d6-08dc-4f2c-9b06-c7c10d3d12ba',
        },
      ],
    },
  }),
}));

const mockUseQuery = jest.fn();
const mockUseMutation = jest.fn();
const mockNavigate = jest.fn();
const mockLocation = {
  hash: '#a62c90d6-08dc-4f2c-9b06-c7c10d3d12ba',
  pathname: '/object/campaign/campaign-1',
  search: '',
};
const mockEnqueueErrorSnackBar = jest.fn();
const mockEnqueueSuccessSnackBar = jest.fn();
const mockCloseDropdown = jest.fn((dropdownId: string) => {
  document.dispatchEvent(new CustomEvent(`close-dropdown-${dropdownId}`));
});

jest.mock('@apollo/client/react', () => ({
  useMutation: (...args: unknown[]) => mockUseMutation(...args),
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));

jest.mock('@/ui/layout/dropdown/components/Dropdown', () => {
  const React = require('react');

  return {
    Dropdown: ({
      clickableComponent,
      dropdownAriaLabel,
      dropdownComponents,
      dropdownId,
      dropdownRole,
      onClose,
      onOpen,
    }: {
      clickableComponent: React.ReactElement<{
        onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
      }>;
      dropdownAriaLabel?: string;
      dropdownComponents: React.ReactNode;
      dropdownId: string;
      dropdownRole?: string;
      onClose?: () => void;
      onOpen?: () => void;
    }) => {
      const [isOpen, setIsOpen] = React.useState(false);

      React.useEffect(() => {
        const close = () => {
          setIsOpen(false);
          onClose?.();
        };
        const closeEventName = `close-dropdown-${dropdownId}`;

        document.addEventListener(closeEventName, close);

        return () => document.removeEventListener(closeEventName, close);
      }, [dropdownId, onClose]);

      return (
        <>
          {React.cloneElement(clickableComponent, {
            'aria-expanded': isOpen,
            onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
              clickableComponent.props.onClick?.(event);
              setIsOpen(true);
              onOpen?.();
            },
          })}
          {isOpen ? (
            <div aria-label={dropdownAriaLabel} role={dropdownRole}>
              {dropdownComponents}
            </div>
          ) : null}
        </>
      );
    },
  };
});

jest.mock('@/ui/layout/dropdown/hooks/useCloseDropdown', () => ({
  useCloseDropdown: () => ({ closeDropdown: mockCloseDropdown }),
}));

jest.mock('@/ui/layout/modal/components/ConfirmationModal', () => ({
  ConfirmationModal: ({
    confirmButtonText,
    onClose,
    onConfirmClick,
    subtitle,
    title,
  }: {
    confirmButtonText: string;
    onClose: () => void;
    onConfirmClick: () => void;
    subtitle: React.ReactNode;
    title: string;
  }) => {
    const titleId = 'confirmation-title';
    const descriptionId = 'confirmation-description';

    return (
      <div
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        role="dialog"
      >
        <h2 id={titleId}>{title}</h2>
        <p id={descriptionId}>{subtitle}</p>
        <button onClick={onClose} type="button">
          Cancel
        </button>
        <button onClick={onConfirmClick} type="button">
          {confirmButtonText}
        </button>
      </div>
    );
  },
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

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useLocation: () => mockLocation,
  useNavigate: () => mockNavigate,
}));

jest.mock('@/settings/accounts/components/EmailAccountConnectionCards', () => ({
  EmailAccountConnectionCards: ({ returnTo }: { returnTo?: string }) => (
    <button
      aria-label="Connect email account"
      data-return-to={returnTo}
      type="button"
    >
      Connect email account
    </button>
  ),
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

jest.mock('twenty-ui/input', () => {
  const React = require('react');

  return {
    Button: React.forwardRef(
      (
        {
          title,
          ariaLabel,
          onClick,
          disabled,
        }: {
          title: string;
          ariaLabel?: string;
          onClick?: () => void;
          disabled?: boolean;
        },
        ref: React.ForwardedRef<HTMLButtonElement>,
      ) => (
        <button
          aria-label={ariaLabel}
          disabled={disabled}
          onClick={onClick}
          ref={ref}
          type="button"
        >
          {title}
        </button>
      ),
    ),
    LightIconButton: React.forwardRef(
      (
        {
          'aria-label': ariaLabel,
          onClick,
          disabled,
        }: {
          'aria-label': string;
          onClick?: () => void;
          disabled?: boolean;
        },
        ref: React.ForwardedRef<HTMLButtonElement>,
      ) => (
        <button
          aria-label={ariaLabel}
          disabled={disabled}
          onClick={onClick}
          ref={ref}
          type="button"
        />
      ),
    ),
  };
});

const linkedAccount = {
  id: 'campaign-account-1',
  connectedAccountId: 'connected-account-1',
  health: 'AVAILABLE' as 'AVAILABLE' | 'RECONNECT_REQUIRED' | 'UNAVAILABLE',
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
  accountRefetch = jest.fn().mockResolvedValue({}),
  accounts = [linkedAccount],
  candidateError,
  candidateLoading = false,
  candidateRefetch = jest.fn().mockResolvedValue({}),
  candidates = [candidate],
  link = jest.fn().mockResolvedValue({}),
  remove = jest.fn().mockResolvedValue({}),
  setDefault = jest.fn().mockResolvedValue({}),
}: {
  accountError?: Error;
  accountLoading?: boolean;
  accountRefetch?: jest.Mock;
  accounts?: (typeof linkedAccount)[];
  candidateError?: Error;
  candidateLoading?: boolean;
  candidateRefetch?: jest.Mock;
  candidates?: (typeof candidate)[];
  link?: jest.Mock;
  remove?: jest.Mock;
  setDefault?: jest.Mock;
} = {}) => {
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

const openAccountPicker = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Add email account' }));
};

describe('MyahCampaignEmailAccounts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocation.search = '';
  });

  it('exposes Email Accounts as a real level-two heading', () => {
    renderWithAccounts();

    expect(
      screen.getByRole('heading', { level: 2, name: 'Email Accounts' }),
    ).toBeVisible();
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

  it('renders a hard-deleted default link as unavailable and still removable', () => {
    renderWithAccounts({
      accounts: [
        {
          ...linkedAccount,
          health: 'UNAVAILABLE',
          label: 'Unavailable email account',
          provider: null as never,
          senderEmail: null as never,
        },
      ],
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'The default email account is unavailable',
    );
    expect(
      screen.getByRole('button', { name: 'Remove Unavailable email account' }),
    ).toBeEnabled();
  });

  it('announces account loading independently from candidate loading', () => {
    renderWithAccounts({ accountLoading: true, candidateLoading: true });
    openAccountPicker();

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
    openAccountPicker();

    expect(screen.getByText('sender@example.com')).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Available email accounts could not be loaded.',
    );
  });

  it('disables unavailable candidates and uses one named dialog popup', () => {
    renderWithAccounts({
      candidates: [{ ...candidate, health: 'UNAVAILABLE' }],
    });
    openAccountPicker();

    expect(
      screen.getByRole('button', { name: 'Add team@example.com' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('dialog', { name: 'Email account candidates' }),
    ).toBeVisible();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('announces an OAuth connection failure once without linking an account', async () => {
    mockLocation.search =
      '?emailAccountConnectionFailed=1&linkConnectedAccount=1&connectedAccountId=123e4567-e89b-42d3-a456-426614174000';
    const link = jest.fn();
    configureHooks({ link });

    render(<MyahCampaignEmailAccounts campaignId="campaign-1" />);

    await waitFor(() =>
      expect(mockEnqueueErrorSnackBar).toHaveBeenCalledWith({
        message: 'Email account connection failed. Try connecting it again.',
      }),
    );
    expect(link).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith(
      {
        hash: '#a62c90d6-08dc-4f2c-9b06-c7c10d3d12ba',
        pathname: '/object/campaign/campaign-1',
        search: '',
      },
      { replace: true },
    );
  });

  it('consumes callback parameters before linking and refetches active account queries', async () => {
    let resolveLink: () => void = () => undefined;
    const link = jest.fn(
      (_options: {
        awaitRefetchQueries: boolean;
        refetchQueries: {
          definitions: { name?: { value?: string } }[];
        }[];
        variables: {
          input: { campaignId: string; connectedAccountId: string };
        };
      }) =>
        new Promise<void>((resolve) => {
          resolveLink = resolve;
        }),
    );
    mockLocation.search =
      '?linkConnectedAccount=1&connectedAccountId=123e4567-e89b-42d3-a456-426614174000';
    const { accountRefetch, candidateRefetch } = configureHooks({ link });

    const { unmount } = render(
      <StrictMode>
        <MyahCampaignEmailAccounts campaignId="campaign-1" />
      </StrictMode>,
    );

    await waitFor(() => expect(link).toHaveBeenCalledTimes(1));

    const linkOptions = link.mock.calls[0][0];

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith(
      {
        hash: '#a62c90d6-08dc-4f2c-9b06-c7c10d3d12ba',
        pathname: '/object/campaign/campaign-1',
        search: '',
      },
      { replace: true },
    );
    expect(linkOptions).toMatchObject({
      awaitRefetchQueries: true,
      variables: {
        input: {
          campaignId: 'campaign-1',
          connectedAccountId: '123e4567-e89b-42d3-a456-426614174000',
        },
      },
    });
    expect(
      linkOptions.refetchQueries.map(
        (document) => document.definitions[0]?.name?.value,
      ),
    ).toEqual(['CampaignEmailAccounts', 'CampaignEmailAccountCandidates']);

    mockLocation.search = '';
    unmount();
    render(<MyahCampaignEmailAccounts campaignId="campaign-1" />);

    expect(link).toHaveBeenCalledTimes(1);

    resolveLink();

    await waitFor(() =>
      expect(mockEnqueueSuccessSnackBar).toHaveBeenCalledWith({
        message: 'Email account linked.',
      }),
    );
    expect(accountRefetch).not.toHaveBeenCalled();
    expect(candidateRefetch).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });

  it('opens the existing account connection settings seam', () => {
    renderWithAccounts();
    openAccountPicker();

    fireEvent.click(
      screen.getByRole('button', { name: 'Connect email account' }),
    );

    expect(
      screen.getByRole('button', { name: 'Connect email account' }),
    ).toHaveAttribute(
      'data-return-to',
      '/object/campaign/campaign-1?linkConnectedAccount=1#runtime-operations-tab-id',
    );
  });

  it('opens, activates, and closes the account picker with the keyboard', async () => {
    const user = userEvent.setup();
    const link = jest.fn().mockResolvedValue({
      data: { linkCampaignEmailAccount: [linkedAccount, candidate] },
    });
    const { accountRefetch, candidateRefetch } = renderWithAccounts({ link });
    const addEmailAccountButton = screen.getByRole('button', {
      name: 'Add email account',
    });

    expect(
      screen.queryByRole('button', { name: 'Add team@example.com' }),
    ).not.toBeInTheDocument();

    addEmailAccountButton.focus();
    await user.keyboard('{Enter}');

    const candidateButton = await screen.findByRole('button', {
      name: 'Add team@example.com',
    });
    await waitFor(() => expect(candidateButton).toHaveFocus());
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
      expect(
        screen.queryByRole('dialog', { name: 'Email account candidates' }),
      ).not.toBeInTheDocument();
      expect(addEmailAccountButton).toHaveFocus();
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
    const removalDialog = screen.getByRole('dialog', {
      name: 'Remove team@example.com?',
    });
    expect(removalDialog).toHaveAttribute(
      'aria-describedby',
      'confirmation-description',
    );
    expect(removalDialog).toHaveTextContent(
      'Removing this email account does not change the default email account.',
    );
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(nonDefaultRemove).toHaveFocus();

    fireEvent.click(
      screen.getByRole('button', { name: 'Remove sender@example.com' }),
    );
    expect(
      screen.getByRole('dialog', { name: 'Remove sender@example.com?' }),
    ).toHaveTextContent('Removing the default account pauses email drafting.');
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
    fireEvent.click(screen.getByRole('button', { name: 'Remove account' }));

    await waitFor(() => expect(mockEnqueueErrorSnackBar).toHaveBeenCalled());
    expect(screen.getByText('sender@example.com')).toBeVisible();
  });

  it('uses refreshed account query data rather than a stale mutation result', async () => {
    const returnedStaleAccounts = [linkedAccount];
    const refreshedAccounts = [
      {
        ...linkedAccount,
        isDefault: false,
      },
      {
        ...candidate,
        health: 'RECONNECT_REQUIRED' as const,
        id: 'campaign-account-2',
        isDefault: true,
      },
    ];
    let queryAccounts = [
      linkedAccount,
      { ...candidate, id: 'campaign-account-2', isDefault: false },
    ];
    const setDefault = jest.fn().mockImplementation(async () => {
      queryAccounts = refreshedAccounts;
      return {
        data: { setDefaultCampaignEmailAccount: returnedStaleAccounts },
      };
    });
    configureHooks({ accounts: queryAccounts, setDefault });
    const { rerender } = render(
      <MyahCampaignEmailAccounts campaignId="campaign-1" />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Make team@example.com default' }),
    );
    await waitFor(() => expect(setDefault).toHaveBeenCalled());

    configureHooks({ accounts: queryAccounts, setDefault });
    rerender(<MyahCampaignEmailAccounts campaignId="campaign-1" />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Reconnect the default email account before sending',
    );
    expect(screen.getByText('team@example.com')).toBeVisible();
    expect(screen.queryByText('Default')).toBeInTheDocument();
  });

  it('uses query data for the new Campaign after a Campaign switch', () => {
    const campaignOneAccounts = [linkedAccount];
    const campaignTwoAccounts = [
      { ...candidate, id: 'campaign-account-2', isDefault: true },
    ];
    mockUseQuery.mockImplementation(
      (
        document: { definitions: { name?: { value?: string } }[] },
        options: { variables: { input: { campaignId: string } } },
      ) => {
        const operationName = document.definitions[0]?.name?.value;
        const accounts =
          options.variables.input.campaignId === 'campaign-1'
            ? campaignOneAccounts
            : campaignTwoAccounts;
        return operationName === 'CampaignEmailAccounts'
          ? {
              data: { campaignEmailAccounts: accounts },
              loading: false,
              refetch: jest.fn(),
            }
          : {
              data: { campaignEmailAccountCandidates: [] },
              loading: false,
              refetch: jest.fn(),
            };
      },
    );
    mockUseMutation.mockImplementation(() => [jest.fn(), { loading: false }]);
    const { rerender } = render(
      <MyahCampaignEmailAccounts campaignId="campaign-1" />,
    );

    expect(screen.getByText('sender@example.com')).toBeVisible();
    rerender(<MyahCampaignEmailAccounts campaignId="campaign-2" />);

    expect(screen.getByText('team@example.com')).toBeVisible();
    expect(screen.queryByText('sender@example.com')).not.toBeInTheDocument();
  });

  it('moves focus to Add email account after a successful removal', async () => {
    const remove = jest.fn().mockResolvedValue({
      data: { removeCampaignEmailAccount: [] },
    });
    renderWithAccounts({ remove });

    fireEvent.click(
      screen.getByRole('button', { name: 'Remove sender@example.com' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove account' }));

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Add email account' }),
      ).toHaveFocus(),
    );
  });
});
