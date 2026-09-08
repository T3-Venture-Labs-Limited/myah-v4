import { SettingsAccountSendingPolicy } from '@/settings/accounts/components/SettingsAccountSendingPolicy';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';

const GRAPHQL_INT_MAX = 2_147_483_647;

const mockUpdateConnectedAccountSendingPolicy = jest.fn();
const mockEnqueueErrorSnackBar = jest.fn();
const mockEnqueueSuccessSnackBar = jest.fn();

jest.mock('@apollo/client/react', () => ({
  useMutation: () => [
    mockUpdateConnectedAccountSendingPolicy,
    { loading: false },
  ],
}));

jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: () => ({
    enqueueErrorSnackBar: mockEnqueueErrorSnackBar,
    enqueueSuccessSnackBar: mockEnqueueSuccessSnackBar,
  }),
}));

jest.mock('@/ui/input/components/SettingsTextInput', () => ({
  SettingsTextInput: ({
    label,
    max,
    min,
    onChange,
    step,
    type,
    value,
  }: {
    label: string;
    max?: number;
    min?: number;
    onChange: (value: string) => void;
    step?: number;
    type?: string;
    value: string;
  }) => (
    <label>
      {label}
      <input
        aria-label={label}
        max={max}
        min={min}
        step={step}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  ),
}));

jest.mock('twenty-ui/input', () => ({
  Button: ({
    disabled,
    onClick,
    title,
  }: {
    disabled?: boolean;
    onClick: () => void;
    title: string;
  }) => (
    <button disabled={disabled} type="button" onClick={onClick}>
      {title}
    </button>
  ),
}));

jest.mock('twenty-ui/layout', () => ({
  Section: ({ children }: { children: React.ReactNode }) => (
    <section>{children}</section>
  ),
}));

jest.mock('twenty-ui/typography', () => ({
  H2Title: ({ description, title }: { description: string; title: string }) => (
    <header>
      <h2>{title}</h2>
      <p>{description}</p>
    </header>
  ),
}));

describe('SettingsAccountSendingPolicy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateConnectedAccountSendingPolicy.mockResolvedValue({ data: {} });
  });

  it('loads the account current values into native numeric inputs', () => {
    render(
      <SettingsAccountSendingPolicy
        connectedAccountId="account-id"
        dailySendLimit={75}
        minimumSendIntervalMs={120_000}
      />,
    );

    expect(screen.getByLabelText('Daily send limit')).toHaveValue(75);
    expect(
      screen.getByLabelText('Minimum send interval (milliseconds)'),
    ).toHaveValue(120_000);
    expect(screen.getByLabelText('Daily send limit')).toHaveAttribute(
      'type',
      'number',
    );
    expect(
      screen.getByLabelText('Minimum send interval (milliseconds)'),
    ).toHaveAttribute('type', 'number');
    expect(screen.getByLabelText('Daily send limit')).toHaveAttribute(
      'max',
      String(GRAPHQL_INT_MAX),
    );
    expect(
      screen.getByLabelText('Minimum send interval (milliseconds)'),
    ).toHaveAttribute('max', String(GRAPHQL_INT_MAX));
  });

  it('renders the policy defaults', () => {
    render(
      <SettingsAccountSendingPolicy
        connectedAccountId="account-id"
        dailySendLimit={50}
        minimumSendIntervalMs={300_000}
      />,
    );

    expect(screen.getByLabelText('Daily send limit')).toHaveValue(50);
    expect(
      screen.getByLabelText('Minimum send interval (milliseconds)'),
    ).toHaveValue(300_000);
  });

  it('saves both values at the signed GraphQL Int maximum', async () => {
    render(
      <SettingsAccountSendingPolicy
        connectedAccountId="account-id"
        dailySendLimit={50}
        minimumSendIntervalMs={300_000}
      />,
    );

    fireEvent.change(screen.getByLabelText('Daily send limit'), {
      target: { value: String(GRAPHQL_INT_MAX) },
    });
    fireEvent.change(
      screen.getByLabelText('Minimum send interval (milliseconds)'),
      { target: { value: String(GRAPHQL_INT_MAX) } },
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Save sending policy' }),
    );

    await waitFor(() =>
      expect(mockUpdateConnectedAccountSendingPolicy).toHaveBeenCalledWith({
        variables: {
          input: {
            connectedAccountId: 'account-id',
            dailySendLimit: GRAPHQL_INT_MAX,
            minimumSendIntervalMs: GRAPHQL_INT_MAX,
          },
        },
      }),
    );
    expect(mockEnqueueSuccessSnackBar).toHaveBeenCalled();
  });

  it('refreshes untouched drafts from network props and submits fresh values', async () => {
    const { rerender } = render(
      <SettingsAccountSendingPolicy
        connectedAccountId="account-id"
        dailySendLimit={50}
        minimumSendIntervalMs={300_000}
      />,
    );

    rerender(
      <SettingsAccountSendingPolicy
        connectedAccountId="account-id"
        dailySendLimit={75}
        minimumSendIntervalMs={120_000}
      />,
    );

    expect(screen.getByLabelText('Daily send limit')).toHaveValue(75);
    expect(
      screen.getByLabelText('Minimum send interval (milliseconds)'),
    ).toHaveValue(120_000);

    fireEvent.click(
      screen.getByRole('button', { name: 'Save sending policy' }),
    );

    await waitFor(() =>
      expect(mockUpdateConnectedAccountSendingPolicy).toHaveBeenCalledWith({
        variables: {
          input: {
            connectedAccountId: 'account-id',
            dailySendLimit: 75,
            minimumSendIntervalMs: 120_000,
          },
        },
      }),
    );
  });

  it('preserves one dirty draft while refreshing its untouched sibling', async () => {
    const { rerender } = render(
      <SettingsAccountSendingPolicy
        connectedAccountId="account-id"
        dailySendLimit={50}
        minimumSendIntervalMs={300_000}
      />,
    );

    fireEvent.change(screen.getByLabelText('Daily send limit'), {
      target: { value: '80' },
    });
    rerender(
      <SettingsAccountSendingPolicy
        connectedAccountId="account-id"
        dailySendLimit={75}
        minimumSendIntervalMs={120_000}
      />,
    );

    expect(screen.getByLabelText('Daily send limit')).toHaveValue(80);
    expect(
      screen.getByLabelText('Minimum send interval (milliseconds)'),
    ).toHaveValue(120_000);

    fireEvent.click(
      screen.getByRole('button', { name: 'Save sending policy' }),
    );

    await waitFor(() =>
      expect(mockUpdateConnectedAccountSendingPolicy).toHaveBeenCalledWith({
        variables: {
          input: {
            connectedAccountId: 'account-id',
            dailySendLimit: 80,
            minimumSendIntervalMs: 120_000,
          },
        },
      }),
    );
  });

  it('preserves edits made while saving and synchronizes the unchanged field', async () => {
    let resolveMutation!: (result: { data: object }) => void;

    mockUpdateConnectedAccountSendingPolicy.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveMutation = resolve;
      }),
    );

    const { rerender } = render(
      <SettingsAccountSendingPolicy
        connectedAccountId="account-id"
        dailySendLimit={50}
        minimumSendIntervalMs={300_000}
      />,
    );

    fireEvent.change(screen.getByLabelText('Daily send limit'), {
      target: { value: '80' },
    });
    fireEvent.change(
      screen.getByLabelText('Minimum send interval (milliseconds)'),
      { target: { value: '90000' } },
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Save sending policy' }),
    );

    await waitFor(() =>
      expect(mockUpdateConnectedAccountSendingPolicy).toHaveBeenCalledWith({
        variables: {
          input: {
            connectedAccountId: 'account-id',
            dailySendLimit: 80,
            minimumSendIntervalMs: 90_000,
          },
        },
      }),
    );

    fireEvent.change(screen.getByLabelText('Daily send limit'), {
      target: { value: '90' },
    });

    await act(async () => {
      resolveMutation({ data: {} });
    });
    await waitFor(() => expect(mockEnqueueSuccessSnackBar).toHaveBeenCalled());

    rerender(
      <SettingsAccountSendingPolicy
        connectedAccountId="account-id"
        dailySendLimit={80}
        minimumSendIntervalMs={120_000}
      />,
    );

    expect(screen.getByLabelText('Daily send limit')).toHaveValue(90);
    expect(
      screen.getByLabelText('Minimum send interval (milliseconds)'),
    ).toHaveValue(120_000);
  });

  it.each([
    ['Daily send limit', '0'],
    ['Daily send limit', '-1'],
    ['Daily send limit', String(GRAPHQL_INT_MAX + 1)],
    ['Minimum send interval (milliseconds)', '0'],
    ['Minimum send interval (milliseconds)', '-1'],
    ['Minimum send interval (milliseconds)', String(GRAPHQL_INT_MAX + 1)],
  ])('blocks saving when %s is %s', (label, value) => {
    render(
      <SettingsAccountSendingPolicy
        connectedAccountId="account-id"
        dailySendLimit={50}
        minimumSendIntervalMs={300_000}
      />,
    );

    fireEvent.change(screen.getByLabelText(label), {
      target: { value },
    });

    expect(
      screen.getByRole('button', { name: 'Save sending policy' }),
    ).toBeDisabled();
    expect(mockUpdateConnectedAccountSendingPolicy).not.toHaveBeenCalled();
  });
});
