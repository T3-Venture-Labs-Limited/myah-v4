import { SettingsAccountSendingPolicy } from '@/settings/accounts/components/SettingsAccountSendingPolicy';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

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
    min,
    onChange,
    step,
    type,
    value,
  }: {
    label: string;
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

  it('saves both values', async () => {
    render(
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
    expect(mockEnqueueSuccessSnackBar).toHaveBeenCalled();
  });

  it.each([
    ['Daily send limit', '0'],
    ['Daily send limit', '-1'],
    ['Minimum send interval (milliseconds)', '0'],
    ['Minimum send interval (milliseconds)', '-1'],
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
