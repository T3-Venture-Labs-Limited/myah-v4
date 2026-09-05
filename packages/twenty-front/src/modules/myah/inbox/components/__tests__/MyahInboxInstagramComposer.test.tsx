import { fireEvent, render, screen } from '@testing-library/react';

import { MyahInboxInstagramComposer } from '@/myah/inbox/components/MyahInboxInstagramComposer';

jest.mock('twenty-ui/theme-constants', () => ({
  themeCssVariables: {
    font: { color: { danger: 'red', secondary: 'gray' }, size: { xs: '12px' } },
    spacing: ['0px', '4px', '8px'],
  },
}));

jest.mock('@/ui/input/components/TextArea', () => ({
  TextArea: ({
    ariaLabel,
    disabled,
    onChange,
    value,
  }: {
    ariaLabel: string;
    disabled: boolean;
    onChange: (value: string) => void;
    value: string;
  }) => (
    <textarea
      aria-label={ariaLabel}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      value={value}
    />
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
    <button disabled={disabled} onClick={onClick} type="button">
      {title}
    </button>
  ),
}));

describe('MyahInboxInstagramComposer', () => {
  it('uses the recipient label and delegates an explicit review and send action', () => {
    const onBodyChange = jest.fn();
    const onReviewAndSend = jest.fn();
    render(
      <MyahInboxInstagramComposer
        body="Existing draft"
        channelState="READY"
        onBodyChange={onBodyChange}
        onReviewAndSend={onReviewAndSend}
        username="creator"
      />,
    );

    fireEvent.change(screen.getByLabelText('Message @creator via Instagram'), {
      target: { value: 'Hello' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Review and send' }));

    expect(onBodyChange).toHaveBeenCalledWith('Hello');
    expect(onReviewAndSend).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['AMBIGUOUS', undefined],
    ['UNAVAILABLE', undefined],
    ['READY', 'COMPOSIO_HISTORY'],
  ] as const)('disables sends for state %s', (channelState, provider) => {
    render(
      <MyahInboxInstagramComposer
        body="Hello"
        channelState={channelState}
        error={undefined}
        onBodyChange={jest.fn()}
        onReviewAndSend={jest.fn()}
        provider={provider}
        username="creator"
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Review and send' }),
    ).toBeDisabled();
  });

  it('keeps a recoverable error editable and retryable', () => {
    render(
      <MyahInboxInstagramComposer
        body="Hello"
        channelState="READY"
        error="Instagram sync failed"
        onBodyChange={jest.fn()}
        onReviewAndSend={jest.fn()}
        username="creator"
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Instagram sync failed',
    );
    expect(
      screen.getByLabelText('Message @creator via Instagram'),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Review and send' }),
    ).toBeEnabled();
  });
});
