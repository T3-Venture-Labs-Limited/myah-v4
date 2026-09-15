import { readFileSync } from 'node:fs';

import { fireEvent, render, screen } from '@testing-library/react';

import { MyahInboxInstagramComposer } from '@/myah/inbox/components/MyahInboxInstagramComposer';

jest.mock('twenty-ui/theme-constants', () => ({
  themeCssVariables: {
    font: { color: { danger: 'red', secondary: 'gray' }, size: { xs: '12px' } },
    background: { transparent: { lighter: 'transparent' } },
    border: { color: { light: 'gray' }, radius: { md: '8px' } },
    spacing: ['0px', '4px', '8px', '12px'],
  },
}));

jest.mock('@/ui/input/components/TextArea', () => ({
  TextArea: ({
    ariaLabel,
    disabled,
    onChange,
    value,
    minRows,
    maxRows,
  }: {
    ariaLabel: string;
    disabled: boolean;
    onChange: (value: string) => void;
    value: string;
    minRows: number;
    maxRows: number;
  }) => (
    <textarea
      aria-label={ariaLabel}
      rows={minRows}
      data-max-rows={maxRows}
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
  it('uses an Email-like bounded plain-text editor with a send-only action row', () => {
    render(
      <MyahInboxInstagramComposer
        body={'Line one\n\nLine three'}
        channelState="READY"
        onBodyChange={jest.fn()}
        onReviewAndSend={jest.fn()}
        username="creator"
      />,
    );

    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('Line one\n\nLine three');
    expect(input).toHaveAttribute('rows', '6');
    expect(input).toHaveAttribute('data-max-rows', '6');
    expect(screen.getByLabelText('Instagram draft actions')).toContainElement(
      screen.getByRole('button', { name: 'Review and send' }),
    );
    expect(
      screen.queryByRole('button', { name: /generate/i }),
    ).not.toBeInTheDocument();

    const source = readFileSync(
      `${__dirname}/../MyahInboxInstagramComposer.tsx`,
      'utf8',
    );
    expect(source).toContain(
      'background: ${themeCssVariables.background.transparent.lighter}',
    );
    expect(source).toContain(
      'border-radius: ${themeCssVariables.border.radius.md}',
    );
    expect(source).toContain('padding: ${themeCssVariables.spacing[3]}');
    expect(source).toContain('justify-content: flex-end');
  });

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
